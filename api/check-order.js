// api/check-order.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { orderId } = req.query;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    const { data: order, error } = await supabase
      .from('Messages')
      .select('payment_status, whatsapp_sent, Total_Amount, Pickup_Window')
      .eq('Message_ID', orderId)
      .single();

    if (error || !order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    return res.status(200).json({
      success: true,
      payment_status: order.payment_status,
      whatsapp_sent: order.whatsapp_sent,
      total: order.Total_Amount,
      pickup: order.Pickup_Window
    });
  } catch (error) {
    console.error('Check order error:', error);
    return res.status(500).json({ error: error.message });
  }
};