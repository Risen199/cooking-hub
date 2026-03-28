// api/stitch-client.js
const STITCH_API = 'https://express.stitch.money';

module.exports = async (req, res) => {
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
    const { orderId, amount, customerPhone, customerEmail, customerName } = req.body;
    
    // ✅ Updated validation - check all required fields
    if (!orderId || !amount || !customerPhone || !customerName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: orderId, amount, customerPhone, and customerName are required' 
      });
    }
    
    const cleanPhone = String(customerPhone).replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('27') ? `+${cleanPhone}` : `+27${cleanPhone.slice(1)}`;
    
    console.log('🔧 Getting Stitch token...');
    
    // Step 1: Get access token
    const tokenResponse = await fetch(`${STITCH_API}/api/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: process.env.STITCH_CLIENT_ID,
        clientSecret: process.env.STITCH_SECRET,
        scope: 'client_paymentrequest'
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.success || !tokenData.data?.accessToken) {
      console.error('❌ Failed to get Stitch token:', tokenData);
      return res.status(200).json({ 
        success: false, 
        error: 'Authentication failed with Stitch' 
      });
    }
    
    const accessToken = tokenData.data.accessToken;
    console.log('✅ Stitch token obtained');
    
    // Step 2: Create payment link with required fields
    console.log('🔧 Creating payment link for order:', orderId);
    
    const paymentResponse = await fetch(`${STITCH_API}/api/v1/payment-links`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: 'ZAR',
        merchantReference: orderId,
        returnUrl: 'https://beiju.co.za/order-confirmation',
        cancelUrl: 'https://beiju.co.za/checkout',
        payerName: customerName,
        payerEmail: customerEmail || 'customer@beiju.co.za',
        payerPhone: formattedPhone,
        description: `Order ${orderId} from BEIJU`
      })
    });
    
    const paymentData = await paymentResponse.json();
    
    if (!paymentResponse.ok) {
      console.error('❌ Stitch API error:', paymentData);
      return res.status(200).json({ 
        success: false, 
        error: paymentData.fieldErrors ? 
          `Missing: ${Object.keys(paymentData.fieldErrors).join(', ')}` : 
          paymentData.message || 'Payment creation failed' 
      });
    }
    
    const paymentUrl = paymentData.url || paymentData.paymentUrl;
    
    if (!paymentUrl) {
      console.error('❌ No payment URL in response:', paymentData);
      return res.status(200).json({ 
        success: false, 
        error: 'Stitch did not return a payment URL' 
      });
    }
    
    console.log('✅ Payment URL created:', paymentUrl);
    
    return res.status(200).json({ 
      success: true, 
      url: paymentUrl, 
      paymentId: paymentData.id 
    });
    
  } catch (error) {
    console.error('❌ Stitch error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};