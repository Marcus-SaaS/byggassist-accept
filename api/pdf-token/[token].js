// /api/pdf-token/[token].js
export const config = { runtime: "nodejs" };

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Helpers to try both token formats and both path/query variants
const stripQuotePrefix = (t) => String(t).replace(/^quote_/, "");

function buildCandidateUrls(base, token) {
  const tWith = encodeURIComponent(token);
  const tNo   = encodeURIComponent(stripQuotePrefix(token));

  return [
    // Base44's new function – query & path, with and without "quote_" prefix
    `${base}/functions/publicQuoteByToken?token=${tWith}`,
    `${base}/functions/publicQuoteByToken/${tWith}`,
    `${base}/functions/publicQuoteByToken?token=${tNo}`,
    `${base}/functions/publicQuoteByToken/${tNo}`,

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


const UPSTREAM_BASE =
  process.env.UPSTREAM_BASE || "https://preview--bygg-assist-78c09474.base44.app";

// --- helpers ---
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

  const subtotal = q.subtotal ?? itemsRaw.reduce((s, r) => s + Number(r.total || 0), 0);
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

export default async function handler(req, res) {
  try {
    const { token, debug } = req.query;
    if (!token || Array.isArray(token)) {
      return res.status(400).json({ ok: false, error: "missing or invalid token" });
    }

    // högst upp i filen finns redan UPSTREAM_BASE = "https://preview--bygg-assist-78c09474.base44.app"

// Replace the old array with this single line:
const candidates = buildCandidateUrls(UPSTREAM_BASE, token);


  const tried = [];
let quoteData = null;

for (const url of candidates) {
  try {
    const out = await tryFetchJSON(url);   // du har redan tryFetchJSON i filen
    tried.push(out);
    if (out.ok && out.json) {
      // Plocka offertdata oavsett var den ligger i JSON:en
      const maybe = pickQuoteJson
        ? pickQuoteJson(out.json)
        : (out.json.quote || out.json.data?.quote || out.json.result?.quote || out.json);
      if (maybe && (maybe.items || maybe.lines || typeof maybe.total !== "undefined")) {
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

    // 2) Build PDF (no crash, Helvetica only, no emojis)
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const black = rgb(0, 0, 0);
    const dim = rgb(0.3, 0.3, 0.3);

    const q = normalizeQuote(quoteData);
    let x = 50;
    let y = 792;

    page.drawText("Offert", { x, y, size: 22, font, color: black });
    y -= 22;
    page.drawText(`Offertnr: ${q.number}`, { x, y, size: 11, font }); y -= 14;
    page.drawText(`Datum: ${q.date}`, { x, y, size: 11, font }); y -= 14;
    page.drawText(`Giltig t.o.m: ${q.validUntil}`, { x, y, size: 11, font }); y -= 20;

    page.drawText("Kund", { x, y, size: 12, font, color: black }); y -= 14;
    for (const line of q.customerLines) {
      page.drawText(line, { x, y, size: 11, font, color: dim }); y -= 13;
    }
    y -= 8;

    page.drawText("Specifikation", { x, y, size: 12, font, color: black }); y -= 16;

    if (q.items.length) {
      const drawItem = (it) => {
        page.drawText(it.name, { x, y, size: 11, font, color: black });
        if (it.qty) page.drawText(it.qty, { x: 300, y, size: 11, font, color: dim });
        if (it.price) page.drawText(it.price, { x: 360, y, size: 11, font, color: black });
        if (it.total) page.drawText(it.total, { x: 450, y, size: 11, font, color: black });
      };
      for (const it of q.items) {
        drawItem(it); y -= 14;
        if (it.desc) {
          page.drawText(it.desc, { x, y, size: 10, font, color: dim }); y -= 12;
        }
      }
    } else {
      page.drawText("Inga rader.", { x, y, size: 11, font, color: dim }); y -= 14;
    }

    y -= 8;
    page.drawText("Summa", { x, y, size: 12, font, color: black }); y -= 16;
    page.drawText(`Delsumma: ${q.subtotal}`, { x, y, size: 11, font, color: black }); y -= 14;
    page.drawText(`Moms: ${q.vat}`, { x, y, size: 11, font, color: black }); y -= 14;
    page.drawText(`Att betala: ${q.total}`, { x, y, size: 12, font, color: black }); y -= 20;

    if (q.notes) {
      page.drawText("Noteringar", { x, y, size: 12, font, color: black }); y -= 14;
      page.drawText(q.notes.slice(0, 600), { x, y, size: 10, font, color: dim });
    } else if (!quoteData) {
      page.drawText("OBS", { x, y, size: 12, font, color: black }); y -= 14;
      page.drawText(
        `Kunde inte hämta offertdata just nu. PDF visas i förenklad form.\nToken: ${String(token)}`,
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
