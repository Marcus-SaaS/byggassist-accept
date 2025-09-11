// /api/pdf-token/[token].js
export const config = { runtime: "nodejs" };

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ---- CONFIG ----
const UPSTREAM_BASE =
  process.env.UPSTREAM_BASE || "https://preview--bygg-assist-78c09474.base44.app";

// ---- Helpers ----

// Remove "quote_" prefix if upstream does not want it
const stripQuotePrefix = (t) => String(t).replace(/^quote_/, "");

// Build a wide set of candidate URLs (path + query, with and without prefix, plus common flags)
function buildCandidateUrls(base, token) {
  const tWith = encodeURIComponent(token);
  const tNo = encodeURIComponent(stripQuotePrefix(token));

  return [
    // Base44 public function (query & path), with and without "quote_" prefix
    `${base}/functions/publicQuoteByToken?token=${tWith}`,
    `${base}/functions/publicQuoteByToken/${tWith}`,
    `${base}/functions/publicQuoteByToken?token=${tNo}`,
    `${base}/functions/publicQuoteByToken/${tNo}`,

    // Same but with common format flags (sometimes platforms gate JSON behind flags)
    `${base}/functions/publicQuoteByToken?token=${tWith}&format=json`,
    `${base}/functions/publicQuoteByToken/${tWith}?format=json`,
    `${base}/functions/publicQuoteByToken?token=${tNo}&format=json`,
    `${base}/functions/publicQuoteByToken/${tNo}?format=json`,
    `${base}/functions/publicQuoteByToken?token=${tWith}&accept=json`,
    `${base}/functions/publicQuoteByToken/${tWith}?accept=json`,
    `${base}/functions/publicQuoteByToken?token=${tNo}&accept=json`,
    `${base}/functions/publicQuoteByToken/${tNo}?accept=json`,

    // Other possible public endpoints (keep as fallbacks)
    `${base}/api/public/quotes/by-token/${tWith}`,
    `${base}/api/public/quotes/by-token/${tNo}`,
    `${base}/api/public/quotes/by-token?token=${tWith}`,
    `${base}/api/public/quotes/by-token?token=${tNo}`,
    `${base}/functions/publicGetQuoteByToken?token=${tWith}`,
    `${base}/functions/publicGetQuoteByToken?token=${tNo}`,
    `${base}/api/public/quote?token=${tWith}`,
    `${base}/api/public/quote?token=${tNo}`,
  ];
}

async function tryFetchJSON(url) {
  const r = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    redirect: "follow",
  });
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  let json = null;
  let textPreview = "";
  if (ct.includes("application/json")) {
    json = await r.json().catch(() => null);
  } else {
    textPreview = await r.text().catch(() => "");
  }
  return {
    ok: r.ok,
    status: r.status,
    ct,
    url,
    json,
    bodyPreview: textPreview.slice(0, 600),
  };
}

// Try to pull a quote-like object regardless of nesting shape
function pickQuoteJson(anyJson) {
  if (!anyJson) return null;
  if (anyJson.quote) return anyJson.quote;
  if (anyJson.data) return anyJson.data.quote || anyJson.data;
  if (anyJson.result) return anyJson.result.quote || anyJson.result;

  const looksLike =
    typeof anyJson === "object" &&
    anyJson &&
    (Array.isArray(anyJson.items) ||
      Array.isArray(anyJson.lines) ||
      typeof anyJson.total !== "undefined");
  if (looksLike) return anyJson;

  for (const k of Object.keys(anyJson)) {
    const v = anyJson[k];
    if (v && typeof v === "object") {
      const child = pickQuoteJson(v);
      if (child) return child;
    }
  }
  return null;
}

function money(n) {
  const num = Number(n || 0);
  try {
    return new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: "SEK",
    }).format(num);
  } catch {
    return `${num.toFixed(2)} kr`;
  }
}

function normalizeQuote(data) {
  const safe = (v, d = "-") => (v === null || v === undefined || v === "" ? d : String(v));
  if (!data) {
    return {
      number: "-",
      date: new Date().toLocaleDateString("sv-SE"),
      validUntil: "-",
      customerLines: ["-"],
      items: [],
      subtotal: money(0),
      vat: money(0),
      total: money(0),
      notes: "",
    };
  }

  const q = data.quote ?? data;
  const itemsRaw = q.items ?? q.lines ?? [];
  const items = itemsRaw.map((x) => ({
    name: safe(x.name ?? x.title ?? "Rad"),
    qty: x.quantity != null ? `x${x.quantity}` : x.qty != null ? `x${x.qty}` : "",
    price:
      x.unitPrice != null
        ? money(x.unitPrice)
        : x.price != null
        ? money(x.price)
        : "",
    total: x.total != null ? money(x.total) : "",
    desc: safe(x.description ?? x.desc ?? "", ""),
  }));

  const subtotal =
    q.subtotal ??
    itemsRaw.reduce((s, r) => s + Number(r.total || 0), 0);
  const vat = q.vat ?? q.tax ?? 0;
  const total = q.total ?? Number(subtotal) + Number(vat);

  const cust = q.customer ?? q.client ?? { name: q.customerName ?? "" };
  const customerLines = [cust.name, cust.email, cust.phone]
    .filter(Boolean)
    .map((s) => String(s));

  return {
    number: safe(q.number ?? q.no ?? q.id),
    date: safe(q.date ?? new Date().toLocaleDateString("sv-SE")),
    validUntil: safe(q.validUntil ?? q.valid_to),
    customerLines,
    items,
    subtotal: money(subtotal),
    vat: money(vat),
    total: money(total),
    notes: safe(q.notes ?? q.terms ?? "", ""),
  };
}

// ---- Main handler ----
export default async function handler(req, res) {
  try {
    const { token, debug } = req.query;
    if (!token || Array.isArray(token)) {
      return res.status(400).json({ ok: false, error: "missing or invalid token" });
    }

    // 1) Build candidates & try fetch JSON upstream
    const candidates = buildCandidateUrls(UPSTREAM_BASE, token);
    const tried = [];
    let quoteData = null;

    for (const url of candidates) {
      try {
        const out = await tryFetchJSON(url);
        tried.push(out);

        if (out.ok && out.json) {
          const maybe = pickQuoteJson(out.json);
          if (
            maybe &&
            (Array.isArray(maybe.items) ||
              Array.isArray(maybe.lines) ||
              typeof maybe.total !== "undefined")
          ) {
            quoteData = maybe;
            break;
          }
        }
      } catch (e) {
        tried.push({ url, error: String(e) });
      }
    }

    if (debug === "1") {
      return res.status(200).json({ ok: true, tried, picked: !!quoteData });
    }

    // 2) Build PDF (Helvetica only)
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const black = rgb(0, 0, 0);
    const dim = rgb(0.3, 0.3, 0.3);

    const q = normalizeQuote(quoteData);
    let x = 50;
    let y = 792;

    // Header
    page.drawText("Offert", { x, y, size: 22, font, color: black });
    y -= 22;
    page.drawText(`Offertnr: ${q.number}`, { x, y, size: 11, font }); y -= 14;
    page.drawText(`Datum: ${q.date}`, { x, y, size: 11, font }); y -= 14;
    page.drawText(`Giltig t.o.m: ${q.validUntil}`, { x, y, size: 11, font }); y -= 20;

    // Customer
    page.drawText("Kund", { x, y, size: 12, font, color: black }); y -= 14;
    for (const line of q.customerLines) {
      page.drawText(line, { x, y, size: 11, font, color: dim }); y -= 13;
    }
    y -= 8;

    // Items
    page.drawText("Specifikation", { x, y, size: 12, font, color: black }); y -= 16;
    if (q.items.length) {
      // headers
      page.drawText("Benämning", { x, y, size: 11, font, color: dim });
      page.drawText("Antal", { x: 300, y, size: 11, font, color: dim });
      page.drawText("À-pris", { x: 360, y, size: 11, font, color: dim });
      page.drawText("Summa", { x: 450, y, size: 11, font, color: dim });
      y -= 14;

      for (const it of q.items) {
        page.drawText(it.name, { x, y, size: 11, font, color: black });
        if (it.qty) page.drawText(it.qty, { x: 300, y, size: 11, font, color: dim });
        if (it.price) page.drawText(it.price, { x: 360, y, size: 11, font, color: black });
        if (it.total) page.drawText(it.total, { x: 450, y, size: 11, font, color: black });
        y -= 14;
        if (it.desc) { page.drawText(it.desc, { x, y, size: 10, font, color: dim }); y -= 12; }
      }
    } else {
      page.drawText("Inga rader (förenklad vy).", { x, y, size: 11, font, color: dim }); y -= 14;
    }

    // Totals
    y -= 8;
    page.drawText("Summa", { x, y, size: 12, font, color: black }); y -= 16;
    page.drawText(`Delsumma: ${q.subtotal}`, { x, y, size: 11, font, color: black }); y -= 14;
    page.drawText(`Moms: ${q.vat}`, { x, y, size: 11, font, color: black }); y -= 14;
    page.drawText(`Att betala: ${q.total}`, { x, y, size: 12, font, color: black }); y -= 20;

    // Notes / fallback note
    if (q.notes) {
      page.drawText("Noteringar", { x, y, size: 12, font, color: black }); y -= 14;
      page.drawText(q.notes.slice(0, 700), { x, y, size: 10, font, color: dim });
    } else if (!quoteData) {
      page.drawText("OBS", { x, y, size: 12, font, color: black }); y -= 14;
      page.drawText(
        "Kunde inte hämta offertdata just nu. PDF visas i förenklad form.",
        { x, y, size: 10, font, color: dim }
      );
    }

    const bytes = await pdf.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="offert-${q.number || token}.pdf"`);
    return res.status(200).send(Buffer.from(bytes));
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e), stack: e?.stack || null });
  }
}
