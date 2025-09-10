import { createRequire } from "module";
const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit");

export default async function handler(req, res) {
  try {
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="test.pdf"');

    const doc = new PDFDocument();
    doc.pipe(res);

    doc.fontSize(20).text("Hej från ByggAssist 👋", 100, 100);
    doc.fontSize(14).text("Detta är en test-PDF som genererats i Vercel.", 100, 150);

    doc.end();
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
