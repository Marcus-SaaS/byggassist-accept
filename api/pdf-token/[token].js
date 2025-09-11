import { getBaseUrl, isValidToken } from '../../../lib/config';
import { pdfRateLimit } from '../../../lib/rate-limit';
import { generatePDF } from '../../../lib/generatePDF';

export default async function handler(req, res) {
  try {
    // Rate limiting
    const rateLimitResult = await pdfRateLimit.limit(req);
    if (!rateLimitResult.success) {
      return res.status(429).json({ error: 'För många förfrågningar' });
    }

    const { token } = req.query;
    
    // Validera token
    if (!token || !isValidToken(token)) {
      return res.status(400).json({ 
        error: 'Ogiltig token-format' 
      });
    }

    const UPSTREAM_BASE = getBaseUrl();
    const debugMode = req.query.debug === '1';
    const triedUrls = [];
    let picked = false;
    let finalData = null;

    // Testa olika URL-varianter
    const urlVariants = [
      `${UPSTREAM_BASE}/functions/publicQuoteByToken?token=${token}`,
      `${UPSTREAM_BASE}/functions/publicQuoteByToken/${token}`,
      `${UPSTREAM_BASE}/functions/publicQuoteByToken?token=${token}&format=json`,
      `${UPSTREAM_BASE}/functions/publicQuoteByToken/${token}?format=json`
    ];

    for (const url of urlVariants) {
      triedUrls.push(url);
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        const contentType = response.headers.get('content-type');
        triedUrls[triedUrls.length - 1] += ` [Status: ${response.status}, CT: ${contentType}]`;

        if (response.ok && contentType && contentType.includes('application/json')) {
          const data = await response.json();
          finalData = data;
          picked = true;
          break;
        }
      } catch (error) {
        triedUrls[triedUrls.length - 1] += ` [Error: ${error.message}]`;
      }
    }

    // Fallback om ingen data hittades
    if (!finalData) {
      finalData = {
        number: `BA-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        date: new Date().toISOString().split('T')[0],
        customer: { name: 'Kund', email: '', phone: '' },
        items: [{ name: 'Information saknas', quantity: 1, unitPrice: 0, total: 0 }],
        subtotal: 0,
        vat: 0,
        total: 0,
        notes: 'Kontakta säljaren för offertinformation'
      };
    }

    if (debugMode) {
      return res.status(200).json({
        debug: true,
        tried: triedUrls,
        picked,
        data: finalData
      });
    }

    // Generera PDF
    const pdfBuffer = await generatePDF(finalData);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="offert-${finalData.number}.pdf"`);
    res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).json({ 
      error: 'Kunde inte generera PDF',
      reference: `ERR-${Date.now()}`
    });
  }
}
