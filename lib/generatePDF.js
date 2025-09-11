import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const generatePDF = async (quoteData) => {
  // Behåll din nuvarande PDF-genereringskod här
  // Den kommer att fungera med de nya förbättringarna
  
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  
  // Din befintliga PDF-kod här...
  
  return await pdfDoc.save();
};
