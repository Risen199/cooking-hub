// api/yoco-webhook.js
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
    return await response.json();
  } catch (error) {
    console.error('Send error:', error);
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body;
    console.log('📩 Yoco webhook received:', payload);

    if (payload.event === 'payment.succeeded') {
      const paymentId = payload.data.id;
      const metadata = payload.data.metadata || {};
      const orderReference = metadata.orderId;
      
      if (!orderReference) {
        console.error('❌ No orderId in webhook metadata');
        return res.status(200).json({ received: true });
      }
      
      console.log(`✅ Payment succeeded: order ${orderReference}, payment ${paymentId}`);
      
      const { data: order, error: fetchError } = await supabase
        .from('Messages')
        .select('*, Stores(WhatsApp, Name)')
        .eq('Message_ID', orderReference)
        .single();
      
      if (fetchError || !order) {
        console.error('❌ Order not found:', orderReference);
        return res.status(200).json({ received: true });
      }
      
      await supabase
        .from('Messages')
        .update({ 
          payment_status: 'paid', 
          payment_id: paymentId,
          status: 'Ordered'
        })
        .eq('Message_ID', orderReference);
      
      // Send WhatsApp to cook
      const storeWhatsApp = order.Stores?.WhatsApp;
      if (storeWhatsApp) {
        const orderMessage = `🛍️ NEW ORDER (PAID)\n[${order.Store_ID}] ORDER FOR: ${order.Customer_Name}\n${order.Order_Items}\nTotal: R${order.Total_Amount}\nPickup: ${order.Pickup_Window}`;
        await sendWasenderMessage(String(storeWhatsApp), orderMessage);
        console.log(`📱 Order forwarded to cook: ${storeWhatsApp}`);
      }
      
      // Send confirmation to customer
      if (order.Customer_Phone && order.Customer_Phone !== 'Not provided') {
        const confirmMsg = `✅ Payment received! Your order has been confirmed.\n\n🍳 ${order.Store_ID}\n📦 ${order.Order_Items}\n💰 Total: R${order.Total_Amount}\n⏰ Pickup: ${order.Pickup_Window}\n\nThank you for ordering from BEIJU! 🇿🇦`;
        await sendWasenderMessage(order.Customer_Phone, confirmMsg);
        console.log(`📱 Confirmation sent to customer: ${order.Customer_Phone}`);
      }
      
      await supabase
        .from('Messages')
        .update({ whatsapp_sent: true })
        .eq('Message_ID', orderReference);
    }
    
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('❌ Yoco webhook error:', error);
    res.status(200).json({ received: true });
  }
};