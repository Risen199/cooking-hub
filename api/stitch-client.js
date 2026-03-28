// api/stitch-client.js
const STITCH_API = 'https://api.stitch.money/express/v1';

export default async function createPaymentLink(orderId, amount, customerPhone, customerEmail) {
  try {
    const response = await fetch(`${STITCH_API}/redirect-urls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STITCH_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // in cents
        currency: 'ZAR',
        reference: orderId,
        returnUrl: 'https://beiju.co.za/order-confirmation',
        cancelUrl: 'https://beiju.co.za/checkout',
        customer: {
          phone: customerPhone,
          email: customerEmail || 'customer@beiju.co.za'
        }
      })
    });
    
    const data = await response.json();
    console.log('📦 Stitch payment link created:', data);
    return { success: true, url: data.url, paymentId: data.id };
  } catch (error) {
    console.error('❌ Stitch error:', error);
    return { success: false, error: error.message };
  }
}