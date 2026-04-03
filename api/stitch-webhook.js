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
  console.log('🔥 Webhook hit! Method:', req.method, 'URL:', req.url);
  console.log('📦 Body:', req.body);
  
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body;
    console.log('📩 Stitch webhook received:', payload);

    // Handle Stitch webhook format
    if (payload.status === 'PAID') {
      const paymentId = payload.id;
      const stitchLinkId = payload.id; // This is the linkId sent in webhook
      const amount = payload.amount / 100;
      
      console.log(`✅ Payment succeeded: linkId ${stitchLinkId}, payment ${paymentId}, amount R${amount}`);
      
      // Find order by stitch_link_id (NOT Message_ID)
      const { data: order, error: fetchError } = await supabase
        .from('Messages')
        .select('*, Stores(WhatsApp, Name)')
        .eq('stitch_link_id', stitchLinkId)
        .single();
      
      if (fetchError) {
        console.error('❌ Failed to fetch order by stitch_link_id:', fetchError);
        // Try fallback: search by Message_ID if stitch_link_id not found
        const { data: orderById, error: fetchByIdError } = await supabase
          .from('Messages')
          .select('*, Stores(WhatsApp, Name)')
          .eq('Message_ID', stitchLinkId)
          .single();
        
        if (fetchByIdError || !orderById) {
          console.error('❌ Order not found by linkId or Message_ID:', stitchLinkId);
          return res.status(200).json({ received: true });
        }
        order = orderById;
      }
      
      if (!order) {
        console.error('❌ Order not found:', stitchLinkId);
        return res.status(200).json({ received: true });
      }
      
      console.log(`✅ Found order: ${order.Message_ID} for linkId: ${stitchLinkId}`);
      
      // Update order status
      const { error: updateError } = await supabase
        .from('Messages')
        .update({ 
          payment_status: 'paid', 
          payment_id: paymentId
        })
        .eq('Message_ID', order.Message_ID);
      
      if (updateError) {
        console.error('❌ Failed to update order:', updateError);
        return res.status(500).json({ error: 'Database update failed' });
      }
      
      let cookWhatsAppSent = false;
      let customerWhatsAppSent = false;
      
      // Send order to cook
      const storeWhatsApp = order.Stores?.WhatsApp;
      if (storeWhatsApp) {
        const orderMessage = `🛍️ NEW ORDER (PAID)\n[${order.Store_ID}] ORDER FOR: ${order.Customer_Name}\n${order.Order_Items}\nTotal: R${order.Total_Amount}\nPickup: ${order.Pickup_Window}`;
        const result = await sendWasenderMessage(storeWhatsApp, orderMessage);
        if (result && result.success !== false) {
          cookWhatsAppSent = true;
          console.log(`📱 Order forwarded to cook: ${storeWhatsApp}`);
        } else {
          console.error(`❌ Failed to send WhatsApp to cook: ${storeWhatsApp}`);
        }
      }
      
      // Send confirmation to customer
      if (order.Customer_Phone && order.Customer_Phone !== 'Not provided' && order.Customer_Phone !== 'null') {
        const confirmMsg = `✅ Payment received! Your order has been confirmed.\n\n🍳 ${order.Store_ID}\n📦 ${order.Order_Items}\n💰 Total: R${order.Total_Amount}\n⏰ Pickup: ${order.Pickup_Window}\n\nThank you for ordering from BEIJU! 🇿🇦`;
        const result = await sendWasenderMessage(order.Customer_Phone, confirmMsg);
        if (result && result.success !== false) {
          customerWhatsAppSent = true;
          console.log(`📱 Confirmation sent to customer: ${order.Customer_Phone}`);
        } else {
          console.error(`❌ Failed to send WhatsApp to customer: ${order.Customer_Phone}`);
        }
      } else {
        console.log(`⚠️ No customer phone number for order: ${order.Message_ID}`);
      }
      
      // Update whatsapp_sent status
      if (cookWhatsAppSent || customerWhatsAppSent) {
        await supabase
          .from('Messages')
          .update({ whatsapp_sent: true })
          .eq('Message_ID', order.Message_ID);
        console.log(`✅ WhatsApp status updated for order: ${order.Message_ID}`);
      }
    }
    
    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(200).json({ received: true });
  }
};