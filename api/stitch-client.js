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
    
    if (!orderId || !amount || !customerPhone || !customerName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    const cleanReference = String(orderId).replace(/[^a-zA-Z0-9]/g, '');
    const cleanPhone = String(customerPhone).replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('27') ? `+${cleanPhone}` : `+27${cleanPhone.slice(1)}`;
    
    console.log('🔧 Getting Stitch token...');
    
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
    console.log('🔧 Creating payment link for order:', orderId, 'Clean reference:', cleanReference);
    
    const paymentResponse = await fetch(`${STITCH_API}/api/v1/payment-links`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        merchantReference: cleanReference,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        payerName: customerName,
        payerEmailAddress: customerEmail || 'customer@beiju.co.za',
        payerPhoneNumber: formattedPhone,
        skipCheckoutPage: false
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
    
    // Extract payment details
    let paymentUrl = paymentData.data?.payment?.link;
    const paymentId = paymentData.data?.payment?.id;
    const stitchLinkId = paymentData.data?.payment?.id; // This is the linkId
    
    if (!paymentUrl) {
      console.error('❌ No payment URL in response:', paymentData);
      return res.status(200).json({ 
        success: false, 
        error: 'Stitch did not return a payment URL' 
      });
    }
    
    // Append returnUrl as query parameter
    const returnUrl = encodeURIComponent('https://beiju.co.za/order-confirmation');
    paymentUrl = `${paymentUrl}?redirect_url=${returnUrl}`;
    
    console.log('✅ Payment URL created:', paymentUrl);
    console.log('🔗 Stitch Link ID:', stitchLinkId);
    
    return res.status(200).json({ 
      success: true, 
      url: paymentUrl, 
      paymentId: paymentId,
      linkId: stitchLinkId  // ← Return linkId to frontend
    });
    
  } catch (error) {
    console.error('❌ Stitch error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};