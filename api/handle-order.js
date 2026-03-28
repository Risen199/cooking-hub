// api/handle-order.js — Vercel version
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with environment variables
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper function for South African timestamp
const getSATimestamp = () => {
  return new Date().toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/[/]/g, '-').replace(/, /g, ' ');
};

// WasenderAPI function to send WhatsApp messages
async function sendWasenderMessage(to, text) {
  try {
    console.log('📤 Sending to Wasender:', { to, text });
    
    const response = await fetch('https://www.wasenderapi.com/api/send-message', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WASENDER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: to,
        text: text
      })
    });
    
    const data = await response.json();
    console.log('📥 WasenderAPI response:', data);
    return { success: response.ok, data };
  } catch (error) {
    console.error('❌ WasenderAPI send error:', error);
    return { success: false, error };
  }
}

// Function to send auto-response to customer
async function sendCustomerAutoResponse(customerPhone, storeId, orderDetails) {
  try {
    const { data: response } = await supabase
      .from('store_responses')
      .select('*')
      .eq('store_id', storeId)
      .single();

    const { data: store } = await supabase
      .from('Stores')
      .select('Name')
      .eq('Store_ID', storeId)
      .single();

    if (response) {
      const message = `${response.auto_response}\n\n📍 ${response.location_details || 'Ask store for location'}\n⏰ ${orderDetails.pickup_window}\n\n${response.thank_you_message || 'Thank you for ordering!'}`;
      
      await sendWasenderMessage(customerPhone, message);
      
      await supabase.from('wasender_logs').insert([{
        customer_phone: customerPhone,
        store_id: storeId,
        message_type: 'auto_response',
        message_content: message,
        status: 'sent'
      }]);
    }
  } catch (error) {
    console.error('Auto-response error:', error);
  }
}

// Function to forward order to store
async function forwardOrderToStore(storeId, orderMessage, customerPhone) {
  try {
    const { data: store } = await supabase
      .from('store_whatsapp')
      .select('real_whatsapp')
      .eq('store_id', storeId)
      .single();

    if (store) {
      const message = `🛍️ NEW ORDER\n${orderMessage}\n\nCustomer: ${customerPhone}`;
      await sendWasenderMessage(store.real_whatsapp, message);
      
      await supabase.from('wasender_logs').insert([{
        customer_phone: customerPhone,
        store_id: storeId,
        message_type: 'forward_to_store',
        message_content: message,
        status: 'sent'
      }]);
    }
  } catch (error) {
    console.error('Forward to store error:', error);
  }
}

// Vercel handler
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const httpMethod = req.method;
    const queryStringParameters = req.query;
    const body = req.body;
    const headers = req.headers;

    // GET REQUESTS
    if (httpMethod === 'GET') {
      const action = queryStringParameters?.action;

      // 1. GET STORES
      if (action === 'stores') {
        const township = queryStringParameters?.township;
        
        let query = supabase
          .from('Stores')
          .select('*')
          .eq('Is_Active', true);
        
        if (township) {
          query = query.eq('Township_Code', township);
        }
        
        const { data: stores, error } = await query;
        if (error) throw error;
        
        return res.status(200).json({ success: true, stores: stores || [] });
      }

      // 2. GET MENU
      if (action === 'menu') {
        const storeId = queryStringParameters.storeId;
        if (!storeId) {
          return res.status(400).json({ success: false, error: 'Missing storeId' });
        }
        
        const { data: menu, error } = await supabase
          .from('Menu')
          .select('*')
          .eq('Store_ID', storeId);
        
        if (error) throw error;
        
        return res.status(200).json({ success: true, menu: menu || [] });
      }

      // 3. SEARCH AREA
      if (action === 'searchArea') {
        const searchTerm = queryStringParameters?.q?.toLowerCase().trim();
        if (!searchTerm) {
          return res.status(400).json({ success: false, error: 'Missing search term' });
        }

        const { data: allStores, error } = await supabase
          .from('Stores')
          .select('Township_Code, Location_Aliases');
        
        if (error) throw error;

        let foundTownshipCode = null;
        
        for (const store of allStores || []) {
          const aliasList = store.Location_Aliases || [];
          const normalizedAliases = aliasList.map(a => String(a).toLowerCase().trim());
          
          if (normalizedAliases.includes(searchTerm)) {
            foundTownshipCode = store.Township_Code;
            break;
          }
        }

        if (foundTownshipCode) {
          return res.status(200).json({ success: true, townshipCode: foundTownshipCode });
        } else {
          return res.status(200).json({ success: false, message: 'Area not found' });
        }
      }

      // 4. GET HUB BY TOWNSHIP CODE
      if (action === 'getHub') {
        const townshipCode = queryStringParameters?.township;
        if (!townshipCode) {
          return res.status(400).json({ success: false, error: 'Missing township code' });
        }

        const { data: hubs, error } = await supabase
          .from('Hub_Configs')
          .select('*')
          .eq('Township_Code', townshipCode)
          .limit(1);
        
        if (error) throw error;
        
        if (hubs && hubs.length > 0) {
          return res.status(200).json({ success: true, hub: hubs[0] });
        } else {
          return res.status(200).json({ success: false, error: 'Hub not found' });
        }
      }

      // 5. GET ALL HUBS
      if (action === 'getAllHubs') {
        const { data: hubs, error } = await supabase
          .from('Hub_Configs')
          .select('*')
          .eq('Is_Active', 'checked');
        
        if (error) throw error;
        
        return res.status(200).json({ success: true, hubs: hubs || [] });
      }

      // 6. GET HUB BY SLUG
      if (action === 'getHubBySlug') {
        const slug = queryStringParameters?.slug;
        if (!slug) {
          return res.status(400).json({ success: false, error: 'Missing slug' });
        }

        const { data: hubs, error } = await supabase
          .from('Hub_Configs')
          .select('*')
          .eq('slug', slug)
          .limit(1);
        
        if (error) throw error;
        
        if (hubs && hubs.length > 0) {
          return res.status(200).json({ success: true, hub: hubs[0] });
        } else {
          return res.status(200).json({ success: false, error: 'Hub not found' });
        }
      }
    }

    // POST REQUESTS
    if (httpMethod === 'POST') {
      const data = body;

      // LOG HEATMAP SEARCH
      if (data.action === 'logHeatmap') {
        const searchTerm = data.Search_Term || '';
        
        const { error } = await supabase
          .from('Heatmap')
          .insert([{ 
            Search_Term: searchTerm,
            Timestamp: getSATimestamp()
          }]);
        
        if (error) {
          console.error('Heatmap insert error:', error);
        }
        
        return res.status(200).json({ success: true });
      }

      // CREATE ORDER
      if (data.action === 'order') {
        const ipAddress = headers['x-forwarded-for'] || headers['client-ip'] || 'unknown';
        const userAgent = headers['user-agent'] || 'unknown';
        
        const waNumber = (data.waNumber || '27638716816').replace(/\D/g, '');
        
        const orderMessage = `[${data.Store_ID}] ORDER FOR: ${data.Customer_Name || 'Customer'}\nPhone: ${data.Customer_Phone || 'Not provided'}\n${data.Order_Items || 'No items'}\nTotal: R${(data.Total_Amount || 0).toFixed(2)}\n\nPickup window: ${data.Pickup_Window || 'ASAP'}`;

        const totalAmount = Number(data.Total_Amount) || 0;
        const commissionPool = Number((totalAmount * 0.15).toFixed(2));
        const promoterCommission = Number((commissionPool * 0.35).toFixed(2));
        const companyCommission = Number((commissionPool * 0.65).toFixed(2));

        // 1. Insert into Messages table
        await supabase
          .from('Messages')
          .insert([{
            Message_ID: 'msg_' + Date.now(),
            Store_ID: data.Store_ID || 'unknown',
            Customer_Name: data.Customer_Name || 'Customer',
            Order_Items: data.Order_Items || 'No items',
            Total_Amount: totalAmount,
            Commission_Pool: commissionPool,
            Promoter_Commission: promoterCommission,
            Company_Commission: companyCommission,
            Pickup_Window: data.Pickup_Window || 'ASAP',
            Delivery_Type: data.Delivery_Type || 'Collection',
            Status: 'Ordered',
            Timestamp: getSATimestamp(),
            Source: 'Website'
          }]);

        // 2. Insert into Consent_Logs table
        await supabase
          .from('consent_logs')
          .insert([{
            customer_name: data.Customer_Name || 'Customer',
            customer_phone: data.Customer_Phone || 'Not provided',
            store_id: data.Store_ID || 'unknown',
            order_items: data.Order_Items || 'No items',
            total_amount: totalAmount,
            pickup_window: data.Pickup_Window || 'ASAP',
            consent_given: data.consentGiven || true,
            consent_timestamp: data.consentTimestamp || getSATimestamp(),
            ip_address: ipAddress,
            user_agent: userAgent,
            wasender_message_id: null,
            forwarded_to_store: false
          }]);

        // 3. Send via WasenderAPI to central number
        await sendWasenderMessage(waNumber, orderMessage);
        
      console.log('📱 Customer phone from order:', data.Customer_Phone);

        // 4. Send auto-response to customer
        if (data.Customer_Phone && data.Customer_Phone !== 'Not provided') {
          await sendCustomerAutoResponse(
            data.Customer_Phone, 
            data.Store_ID,
            { pickup_window: data.Pickup_Window || 'ASAP' }
          );
        }

        // 5. Forward to store silently
        await forwardOrderToStore(data.Store_ID, orderMessage, data.Customer_Phone);

        // 6. Return success with orderId
      return res.status(200).json({ 
        success: true,
        orderId: 'msg_' + Date.now(),  // ← ADD THIS LINE
        message: 'Order processed with WasenderAPI'
      });
      }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
    
  } catch (err) {
    console.error('Function error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};