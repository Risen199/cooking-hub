// api/cron-webhook.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sendWasenderMessage(to, text) {
  try {
    const response = await fetch('https://www.wasenderapi.com/api/send-message', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WASENDER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to, text })
    });
    const data = await response.json();
    return { success: response.ok, data };
  } catch (error) {
    console.error('Send error:', error);
    return { success: false, error };
  }
}

module.exports = async (req, res) => {
  // Only allow cron job or admin access
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Find orders that are paid but WhatsApp not sent (older than 2 minutes)
    const { data: orders, error } = await supabase
      .from('Messages')
      .select('*, Stores(WhatsApp, Name)')
      .eq('payment_status', 'paid')
      .eq('whatsapp_sent', false)
      .lt('Timestamp', new Date(Date.now() - 2 * 60 * 1000).toISOString());

    if (error) throw error;

    let resentCount = 0;

    for (const order of orders || []) {
      let cookSent = false;
      let customerSent = false;

      // Send to cook
      const storeWhatsApp = order.Stores?.WhatsApp;
      if (storeWhatsApp) {
        const orderMessage = `🛍️ NEW ORDER (PAID - RETRY)\n[${order.Store_ID}] ORDER FOR: ${order.Customer_Name}\nPhone: ${order.Customer_Name}\n${order.Order_Items}\nTotal: R${order.Total_Amount}\nPickup: ${order.Pickup_Window}`;
        const result = await sendWasenderMessage(storeWhatsApp, orderMessage);
        if (result.success) cookSent = true;
      }

      // Send to customer
      if (order.Customer_Phone && order.Customer_Phone !== 'Not provided') {
        const confirmMsg = `✅ Payment confirmed! Your order is ready for pickup.\n\n🍳 ${order.Store_ID}\n📦 ${order.Order_Items}\n💰 Total: R${order.Total_Amount}\n⏰ Pickup: ${order.Pickup_Window}`;
        const result = await sendWasenderMessage(order.Customer_Phone, confirmMsg);
        if (result.success) customerSent = true;
      }

      if (cookSent || customerSent) {
        await supabase
          .from('Messages')
          .update({ whatsapp_sent: true })
          .eq('Message_ID', order.Message_ID);
        resentCount++;
      }
    }

    return res.status(200).json({ success: true, resentCount });
  } catch (error) {
    console.error('Cron error:', error);
    return res.status(500).json({ error: error.message });
  }
};