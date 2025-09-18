export default async function handler(req, res) {
  console.log('Webhook called!', new Date().toISOString());
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-base44-secret'];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Request body:', req.body);
    return res.status(200).json({ 
      ok: true, 
      message: 'Webhook received successfully',
      quoteId: req.body.quoteId 
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
