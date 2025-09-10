import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export default async function handler(req, res) {
  try {
    // Skapa nytt PDF-dokument
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const { height } = page.getSize();
    page.drawText("Hej från ByggAssist", {
      x: 50,
      y: height - 100,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    });
    page.drawText("Detta är en test-PDF genererad med pdf-lib.", {
      x: 50,
      y: height - 150,
      size: 16,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });

    const pdfBytes = await pdfDoc.save();

    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="test.pdf"');
    res.send(Buffer.from(pdfBytes));
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
