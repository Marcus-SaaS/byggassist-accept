export const config = { runtime: "nodejs" };

// Minimal MVP: hämta offert-data publikt via token (justera endpoints om det behövs)
// och generera en enkel PDF som alltid funkar för kundlänken.
const UPSTREAM_BASE =
  process.env.UPSTREAM_BASE ||
  "https://preview--bygg-assist-78c09474.base44.app";

// 👉 Justera dessa till din riktiga publika endpoint när du vet exakt.
// Vi testar några vanliga varianter – första som svarar JSON används.
async function fetchQuoteByToken(token) {
  const candidates = [
    `${UPSTREAM_BASE}/functions/publicGetQuoteByToken?token=${encodeURIComponent(token)}`,
    `${UPSTREAM_BASE}/api/public/quotes/by-token/${encodeURIComponent(token)}`,
    `${UPSTREAM_BASE}/api/public/quote?token=${encodeURIComponent(token)}`,
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) continue;
      const data = await r.json();
      return data?.quote ? data : { quote: data }; // normalize shape
    } catch {}
  }
  return null;
}

function normalizeQuote(data) {
  const q = data.quote || data;
  const items = (q.items || q.lines || []).map((x) => ({
    name: x.name || x.title || x.item || "Rad",
    desc: x.description || x.desc || "",
    qty: x.quantity ?? x.qty ?? 1,
    unitPrice: Number(x.unitPrice ?? x.price ?? x.unit_price ?? 0),
    total: Number(x.total ?? ((x.quantity ?? 1) * (x.unitPrice ?? x.price ?? 0))),
  }));
  const subtotal = q.subtotal ?? items.reduce((s, x) => s + (x.total || 0), 0);
  const vat = Number(q.vat ?? q.tax ?? 0);
  const total = q.total ?? (subtotal + vat);
  return {
    number: q.number || q.no || q.id,
    date: q.date || new Date().toLocaleDateString("sv-SE"),
    validUntil: q.validUntil || q.valid_to || "",
    customer: q.customer || q.client || { name: q.customerName || "" },
    items, subtotal, vat, total,
    notes: q.notes || q.terms || "",
  };
}

function money(n) {
  try { return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" }).format(n || 0); }
  catch { return `${(n || 0).toFixed(2)} kr`; }
}

export default async function handler(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ ok: false, error: "missing token" });

  // 1) Hämta offert-JSON publikt via token
  const data = await fetchQuoteByToken(token);
  if (!data) {
  const PDFDocument = (await import("pdfkit")).default;
  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="offert-${String(token)}.pdf"`);
  res.setHeader("Cache-Control", "no-store");

  const doc = new PDFDocument({ margin: 48 });
  doc.pipe(res);

  doc.fontSize(18).text("Offert", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(12).text("PDF inte tillgänglig just nu", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#444")
    .text("Vi kunde inte hämta offertuppgifterna från servern just nu.")
    .text("Försök igen om en stund eller kontakta oss.");
  doc.moveDown(0.8);
  doc.fillColor("#000").fontSize(10).text(`Token: ${String(token)}`);

  doc.end();
  return;
}
  }
  const quote = normalizeQuote(data);

  // 2) Generera PDF i farten
  const PDFDocument = (await import("pdfkit")).default;
  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="offert-${quote.number || token}.pdf"`);
  res.setHeader("Cache-Control", "no-store");

  const doc = new PDFDocument({ margin: 48 });
  doc.pipe(res);

  // Header
  doc.fontSize(18).text("Offert", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor("#555")
    .text(`Offertnr: ${quote.number || "-"}`)
    .text(`Datum: ${quote.date}`)
    .text(`Giltig t.o.m: ${quote.validUntil || "-"}`);
  doc.moveDown(0.8);
  doc.fillColor("#000").fontSize(12).text("Kund", { underline: true });
  doc.fontSize(11).fillColor("#333")
    .text(quote.customer?.name || "-")
    .text(quote.customer?.email || "")
    .text(quote.customer?.phone || "");
  doc.moveDown(1);

  // Items
  doc.fillColor("#000").fontSize(12).text("Specifikation", { underline: true });
  doc.moveDown(0.4);
  if (!quote.items.length) {
    doc.fontSize(11).fillColor("#666").text("Inga rader.");
  } else {
    quote.items.forEach((it) => {
      const line = [
        it.name || "Rad",
        it.qty != null ? `x${it.qty}` : "",
        it.unitPrice != null ? money(it.unitPrice) : "",
        it.total != null ? money(it.total) : "",
      ].filter(Boolean).join("  ·  ");
      doc.fontSize(11).fillColor("#111").text(line);
      if (it.desc) doc.fontSize(10).fillColor("#666").text(it.desc);
      doc.moveDown(0.2);
    });
  }

  // Totals
  doc.moveDown(0.8);
  doc.fontSize(12).fillColor("#000").text("Summa", { underline: true });
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor("#111").text(`Delsumma: ${money(quote.subtotal)}`);
  doc.text(`Moms: ${money(quote.vat)}`);
  doc.fontSize(12).text(`Att betala: ${money(quote.total)}`);

  // Notes
  if (quote.notes) {
    doc.moveDown(1);
    doc.fontSize(11).fillColor("#000").text("Noteringar", { underline: true });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#444").text(quote.notes);
  }

  doc.end();
}
