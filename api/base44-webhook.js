import { storage } from '../../lib/storage';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-base44-secret'];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { quoteId, quoteData } = req.body;
    const token = `quote_${quoteId}`;
    
    await storage.set(`quote:${token}`, quoteData, 86400);
    
    return res.status(200).json({ 
      ok: true, 
      message: 'Quote received',
      token: token
    });
    
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
