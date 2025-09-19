export default async function handler(req, res) {
  console.log('🚀 WEBHOOK STARTED - ' + new Date().toISOString());
  
  try {
    // Debug: logga allt
    console.log('📨 Headers:', JSON.stringify(req.headers));
    console.log('📦 Body:', JSON.stringify(req.body));
    console.log('🔑 Received secret:', req.headers['x-base44-secret']);
    console.log('🔑 Expected secret:', process.env.WEBHOOK_SECRET || 'NOT_SET_IN_VERCEL');
    
    // Enkel response
    const response = {
      ok: true,
      message: 'Webhook received successfully!',
      timestamp: new Date().toISOString(),
      receivedBody: req.body
    };
    
    console.log('✅ Success response:', response);
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('💥 CATCH Error:', error.message);
    console.error('💥 Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
