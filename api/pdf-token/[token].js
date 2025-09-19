// pages/api/pdf-token/[token].js
export const config = { runtime: "nodejs" }; // viktigt för pdf-lib

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Hjälp-funktioner
const stripQuotePrefix = (t) => String(t).replace(/^quote_/, "");
const sendJson = (res, obj, status = 200) => {
  res.status(status).json(obj);
};

async function fetchQuoteByToken(token) {
  const base = process.env.BASE44_URL || "https://base44.app";
  const candidates = [
    `${base}/functions/publicQuoteByToken?token=${encodeURIComponent(token)}`,
    `${base}/functions/publicQuoteByToken/${encodeURIComponent(token)}`,
    `${base}/functions/publicQuoteByToken?token=${encodeURIComponent(stripQuotePrefix(token))}`,
    `${base}/functions/publicQuoteByToken/${encodeURIComponent(stripQuotePrefix(token))}`,
  ];

  let lastErr;
  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) return await r.json();
      lastErr = new Error(`Fetch ${url} -> ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Quote fetch failed");
}

async function buildPdf(quote) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();

  page.drawText("Offert", { x: 50, y: height - 80, size: 24, font, color: rgb(0,0,0) });
  page.drawText(`Offertnr: ${quote?.number ?? quote?.id ?? "–"}`, { x: 50, y: height - 120, size: 12, font });
  page.drawText(`Kund: ${quote?.customer?.name ?? "–"}`, { x: 50, y: height - 140, size: 12, font });

  let y = height - 180;
  for (const item of quote?.items ?? []) {
    const line = `${item?.name ?? "Rad"}  x${item?.qty ?? 1}  ${item?.price ?? 0} kr`;
    page.drawText(line, { x: 50, y, size: 11, font });
    y -= 16;
    if (y < 80) { y = height - 100; pdf.addPage(); }
  }

  page.drawText(`Summa: ${quote?.total ?? 0} kr`, { x: 50, y: 80, size: 12, font });

  return await pdf.save();
}

export default async function handler(req, res) {
  const { token: raw } = req.query;
  if (!raw) return sendJson(res, { error: "Missing token" }, 400);

  const token = decodeURIComponent(raw);
  const debug = req.query.debug === "1";

  try {
    const quote = await fetchQuoteByToken(token);
    if (!quote || !quote.id) return sendJson(res, { error: "Quote not found", token }, 404);

    if (debug) return sendJson(res, { ok: true, token, quoteId: quote.id, keys: Object.keys(quote) });

    const pdfBytes = await buildPdf(quote);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="offert_${quote.number ?? quote.id}.pdf"`);
    res.status(200).send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error("PDF-TOKEN error:", err);
    sendJson(res, { error: "Internal error building PDF", message: String(err.message || err) }, 500);
  }
}
