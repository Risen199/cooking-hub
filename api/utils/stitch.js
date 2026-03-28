// api/utils/stitch.js
const STITCH_API = 'https://api.stitch.money/express/v1';

async function createStitchPayment(orderId, amount, customerPhone, customerEmail) {
  try {
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
    console.log('✅ Stitch response:', data);
    
    return { success: true, url: data.url, paymentId: data.id };
  } catch (error) {
    console.error('❌ Stitch error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { createStitchPayment };