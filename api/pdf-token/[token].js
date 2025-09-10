const candidates = [
  `${UPSTREAM_BASE}/api/public/quotes/by-token/${encodeURIComponent(token)}`, // ny
  `${UPSTREAM_BASE}/functions/publicGetQuoteByToken?token=${encodeURIComponent(token)}`,
  `${UPSTREAM_BASE}/api/public/quote?token=${encodeURIComponent(token)}`
];
// /api/pdf-token/[token].js
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const UPSTREAM_BASE =
  process.env.UPSTREAM_BASE || "https://preview--bygg-assist-78c09474.base44.app";

// Try to fetch public quote JSON by token (adjust paths when you know the exact one)
async function fetchQuoteByToken(token) {
  const candidates = [
    `${UPSTREAM_BASE}/functions/publicGetQuoteByToken?token=${encodeURIComponent(token)}`,
    `${UPSTREAM_BASE}/api/public/quotes/by-token/${encodeURIComponent(token)}`,
    `${UPSTREAM_BASE}/api/public/quote?token=${encodeURIComponent(token)}`,
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!r.ok || !ct.includes("application/json")) continue;
      const data = await r.json();
      return { data, url };
    } catch {}
  }
  return null;
}

function normalizeQuote(raw) {
  const q = raw?.quote ?? raw ?? {};
  const items = (q.items ?? q.lines ?? []).map((x) => ({
    name: x.name ?? x.title ?? "Rad",
    qty:  x.quantity ?? x.qty ?? 1,
    unit: x.unit ?? "",
    price: Number(x.unitPrice ?? x.price ?? 0),
    total: Number(x.total ?? ((x.quantity ?? 1) * (x.unitPrice ?? x.price ?? 0))),
    desc: x.description ?? x.desc ?? "",
  }));
  const subtotal = q.subtotal ?? items.reduce((s, it) => s + (it.total || 0), 0);
  const vat = Number(q.vat ?? q.tax ?? 0);
  const total = q.total ?? (subtotal + vat);
  return {
    number: q.number ?? q.no ?? q.id ?? "",
    date: q.date ?? new Date().toLocaleDateString("sv-SE"),
    validUntil: q.validUntil ?? q.valid_to ?? "",
    customer: q.customer ?? q.client ?? { name: q.customerName ?? "" },
    items, subtotal, vat, total,
    notes: q.notes ?? q.terms ?? "",
  };
}

function money(n) {
  try { return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" }).format(n || 0); }
  catch { return `${(n || 0).toFixed(2)} kr`; }
}

export default async function handler(req, res) {
  const { token } = req.query;
  if (!token) {
    res.status(400).json({ ok: false, error: "missing token" });
    return;
  }

  try {
    // 1) Try load quote data (optional)
    const fetched = await fetchQuoteByToken(token).catch(() => null);
    const quote = fetched ? normalizeQuote(fetched.data) : null;

    // 2) Build PDF with pdf-lib
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let x = 50;
    let y = 792;

    // Header
    page.drawText("Offert", { x, y, size: 22, font: fontBold, color: rgb(0,0,0) }); y -= 18;
    page.drawText(`Offertnr: ${quote?.number || "-"}`, { x, y, size: 11, font }); y -= 14;
    page.drawText(`Datum: ${quote?.date || new Date().toLocaleDateString("sv-SE")}`, { x, y, size: 11, font }); y -= 14;
    page.drawText(`Giltig t.o.m: ${quote?.validUntil || "-"}`, { x, y, size: 11, font }); y -= 22;

    // Customer
    page.drawText("Kund", { x, y, size: 12, font: fontBold }); y -= 14;
    if (quote?.customer) {
      const c = quote.customer;
      const lines = [c.name, c.email, c.phone].filter(Boolean);
      lines.forEach(line => { page.drawText(String(line), { x, y, size: 11, font, color: rgb(0.2,0.2,0.2) }); y -= 13; });
    } else {
      page.drawText("—", { x, y, size: 11, font, color: rgb(0.5,0.5,0.5) }); y -= 13;
    }
    y -= 10;

    // Items
    page.drawText("Specifikation", { x, y, size: 12, font: fontBold }); y -= 16;

    const drawLine = (parts) => {
      const [a,b,c,d] = parts;
      page.drawText(a, { x, y, size: 11, font });
      if (b) page.drawText(b, { x: 300, y, size: 11, font, color: rgb(0.2,0.2,0.2) });
      if (c) page.drawText(c, { x: 360, y, size: 11, font });
      if (d) page.drawText(d, { x: 450, y, size: 11, fontBold });
      y -= 14;
    };

    if (quote?.items?.length) {
      // header row
      drawLine(["Benämning", "Antal", "À-pris", "Summa"]);
      y -= 4;
      quote.items.forEach(it => {
        drawLine([
          it.name || "Rad",
          it.qty != null ? `x${it.qty}` : "",
          it.price != null ? money(it.price) : "",
          it.total != null ? money(it.total) : ""
        ]);
        if (it.desc) {
          page.drawText(String(it.desc), { x, y, size: 10, font, color: rgb(0.4,0.4,0.4) }); 
          y -= 12;
        }
      });
    } else {
      page.drawText("Inga rader.", { x, y, size: 11, font, color: rgb(0.5,0.5,0.5) }); 
      y -= 14;
    }

    // Totals
    y -= 8;
    page.drawText("Summa", { x, y, size: 12, font: fontBold }); y -= 16;
    page.drawText(`Delsumma: ${money(quote?.subtotal ?? 0)}`, { x, y, size: 11, font }); y -= 14;
    page.drawText(`Moms: ${money(quote?.vat ?? 0)}`, { x, y, size: 11, font }); y -= 14;
    page.drawText(`Att betala: ${money(quote?.total ?? 0)}`, { x, y, size: 12, font: fontBold }); y -= 22;

    // Notes or fallback message
    if (quote?.notes) {
      page.drawText("Noteringar", { x, y, size: 12, font: fontBold }); y -= 14;
      page.drawText(String(quote.notes).slice(0, 600), { x, y, size: 10, font, color: rgb(0.2,0.2,0.2) });
    } else if (!quote) {
      page.drawText("OBS", { x, y, size: 12, font: fontBold }); y -= 14;
      page.drawText(
        `Kunde inte hämta offertdata just nu. PDF visas i förenklad form.\nToken: ${String(token)}`,
        { x, y, size: 10, font, color: rgb(0.4,0.2,0.2) }
      );
    }

    const bytes = await pdf.save();
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="offert-${quote?.number || token}.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
