// api/stitch-client.js
const STITCH_API = 'https://api.stitch.money/express/v1';

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  
  try {
    const { orderId, amount, customerPhone, customerEmail } = req.body;
    
    // Validate required fields
    if (!orderId || !amount || !customerPhone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: orderId, amount, customerPhone' 
      });
    }
    
    // Clean phone number
    const cleanPhone = String(customerPhone).replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('27') ? `+${cleanPhone}` : `+27${cleanPhone.slice(1)}`;
    
    console.log('🔧 Creating Stitch payment link for:', { orderId, amount, phone: formattedPhone });
    
    const response = await fetch(`${STITCH_API}/redirect-urls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STITCH_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: 'ZAR',
        reference: orderId,
        returnUrl: 'https://beiju.co.za/order-confirmation',
        cancelUrl: 'https://beiju.co.za/checkout',
        customer: {
          phone: formattedPhone,
          email: customerEmail || 'customer@beiju.co.za'
        }
      })
    });
    
    const data = await response.json();
    console.log('✅ Stitch response received');
    
    return res.status(200).json({ 
      success: true, 
      url: data.url, 
      paymentId: data.id 
    });
    
  } catch (error) {
    console.error('❌ Stitch error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};