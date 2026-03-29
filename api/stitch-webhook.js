// api/stitch-webhook.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to send WhatsApp messages
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
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body;
    console.log('📩 Stitch webhook received:', payload);

    const { event, data } = payload;

    if (event === 'payment.paid') {
      const paymentId = data.id;
      const orderReference = data.reference;
      const amount = data.amount / 100; // convert from cents
      
      console.log(`✅ Payment succeeded: order ${orderReference}, payment ${paymentId}, amount R${amount}`);
      
      // Update order status in Messages table
      const { error: updateError } = await supabase
        .from('Messages')
        .update({ 
          payment_status: 'paid', 
          payment_id: paymentId,
          status: 'Ordered'
        })
        .eq('Message_ID', orderReference);
      
      if (updateError) {
        console.error('❌ Failed to update order:', updateError);
        return res.status(500).json({ error: 'Database update failed' });
      }
      
      // Get the order details
      const { data: order } = await supabase
        .from('Messages')
        .select('*, Stores(WhatsApp, Name)')
        .eq('Message_ID', orderReference)
        .single();
      
      if (order) {
        // Send order to cook (forward)
        const storeWhatsApp = order.Stores?.WhatsApp;
        if (storeWhatsApp) {
          const orderMessage = `🛍️ NEW ORDER (PAID)\n[${order.Store_ID}] ORDER FOR: ${order.Customer_Name}\nPhone: ${order.Customer_Name}\n${order.Order_Items}\nTotal: R${order.Total_Amount}\nPickup: ${order.Pickup_Window}`;
          await sendWasenderMessage(storeWhatsApp, orderMessage);
          console.log(`📱 Order forwarded to cook: ${storeWhatsApp}`);
        }
        
        // Send confirmation to customer
        if (order.Customer_Phone && order.Customer_Phone !== 'Not provided') {
          const confirmMsg = `✅ Payment received! Your order has been confirmed.\n\n🍳 ${order.Store_ID}\n📦 ${order.Order_Items}\n💰 Total: R${order.Total_Amount}\n⏰ Pickup: ${order.Pickup_Window}\n\nThank you for ordering from BEIJU! 🇿🇦`;
          await sendWasenderMessage(order.Customer_Phone, confirmMsg);
          console.log(`📱 Confirmation sent to customer: ${order.Customer_Phone}`);
        }
      }
    }
    
    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(200).json({ received: true });
  }
};