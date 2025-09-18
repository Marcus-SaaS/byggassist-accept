export default async function handler(req, res) {
  console.log('=== WEBHOOK STARTED ===');
  console.log('Time:', new Date().toISOString());
  
  // Debug: logga headers
  console.log('Headers:', JSON.stringify(req.headers));
  
  if (req.method !== 'POST') {
    console.log('Error: Method not allowed');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = req.headers['x-base44-secret'];
  console.log('Received secret:', secret);
  console.log('Expected secret:', process.env.WEBHOOK_SECRET || 'NOT_SET');
  
  if (secret !== process.env.WEBHOOK_SECRET) {
    console.log('Error: Unauthorized - secret mismatch');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Request body:', JSON.stringify(req.body));
    
    // Enkel respons utan storage
    const response = { 
      ok: true, 
      message: 'Webhook received successfully',
      quoteId: req.body?.quoteId || 'unknown'
    };
    
    console.log('Success response:', response);
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('CATCH Error:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
