// api/yoco-checkout.js
const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY;

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
    const { amount, orderId, customerName, customerEmail } = req.body;
    
    if (!amount || !orderId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing amount or orderId' 
      });
    }
    
    // Amount in cents
    const amountInCents = Math.round(amount * 100);
    
    const response = await fetch('https://payments.yoco.com/api/checkouts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${YOCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': orderId
      },
      body: JSON.stringify({
        amount: amountInCents,
        currency: 'ZAR',
        successUrl: `https://beiju.co.za/order-confirmation?orderId=${orderId}`,
        cancelUrl: `https://beiju.co.za/checkout?cancelled=true`,
        failureUrl: `https://beiju.co.za/checkout?failed=true`,
        metadata: {
          orderId: orderId,
          customerName: customerName || 'BEIJU Customer',
          customerEmail: customerEmail || 'customer@beiju.co.za'
        }
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Yoco API error:', data);
      return res.status(200).json({ 
        success: false, 
        error: data.message || 'Failed to create checkout'
      });
    }
    
    return res.status(200).json({
      success: true,
      redirectUrl: data.redirectUrl,
      checkoutId: data.id
    });
    
  } catch (error) {
    console.error('Yoco error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};