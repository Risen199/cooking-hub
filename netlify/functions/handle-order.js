// netlify/functions/handle-order.js
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
    const response = await fetch('https://api.wasender.com/v1/messages/send', {
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
    return { success: true, data };
  } catch (error) {
    console.error('WasenderAPI send error:', error);
    return { success: false, error };
  }
}

// Function to send auto-response to customer
async function sendCustomerAutoResponse(customerPhone, storeId, orderDetails) {
  try {
    // Get store response templates
    const { data: response } = await supabase
      .from('store_responses')
      .select('*')
      .eq('store_id', storeId)
      .single();

    // Get store details
    const { data: store } = await supabase
      .from('Stores')
      .select('Name')
      .eq('Store_ID', storeId)
      .single();

    if (response) {
      const message = `${response.auto_response}\n\n📍 ${response.location_details || 'Ask store for location'}\n⏰ ${orderDetails.pickup_window}\n\n${response.thank_you_message || 'Thank you for ordering!'}`;
      
      await sendWasenderMessage(customerPhone, message);
      
      // Log to wasender_logs
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
    // Get store's real WhatsApp number
    const { data: store } = await supabase
      .from('store_whatsapp')
      .select('real_whatsapp')
      .eq('store_id', storeId)
      .single();

    if (store) {
      const message = `🛍️ NEW ORDER\n${orderMessage}\n\nCustomer: ${customerPhone}`;
      await sendWasenderMessage(store.real_whatsapp, message);
      
      // Log to wasender_logs
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

exports.handler = async (event) => {
  const { httpMethod, queryStringParameters, body, headers } = event;

  try {
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
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, stores: stores || [] })
        };
      }

      // 2. GET MENU
      if (action === 'menu') {
        const storeId = queryStringParameters.storeId;
        if (!storeId) {
          return { 
            statusCode: 400, 
            body: JSON.stringify({ success: false, error: 'Missing storeId' }) 
          };
        }
        
        const { data: menu, error } = await supabase
          .from('Menu')
          .select('*')
          .eq('Store_ID', storeId);
        
        if (error) throw error;
        
        return { 
          statusCode: 200, 
          body: JSON.stringify({ success: true, menu: menu || [] }) 
        };
      }

      // 3. SEARCH AREA
      if (action === 'searchArea') {
        const searchTerm = queryStringParameters?.q?.toLowerCase().trim();
        if (!searchTerm) {
          return {
            statusCode: 400,
            body: JSON.stringify({ success: false, error: 'Missing search term' })
          };
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
          return {
            statusCode: 200,
            body: JSON.stringify({ success: true, townshipCode: foundTownshipCode })
          };
        } else {
          return {
            statusCode: 200,
            body: JSON.stringify({ success: false, message: 'Area not found' })
          };
        }
      }

      // 4. GET HUB BY TOWNSHIP CODE
      if (action === 'getHub') {
        const townshipCode = queryStringParameters?.township;
        if (!townshipCode) {
          return {
            statusCode: 400,
            body: JSON.stringify({ success: false, error: 'Missing township code' })
          };
        }

        const { data: hubs, error } = await supabase
          .from('Hub_Configs')
          .select('*')
          .eq('Township_Code', townshipCode)
          .limit(1);
        
        if (error) throw error;
        
        if (hubs && hubs.length > 0) {
          return {
            statusCode: 200,
            body: JSON.stringify({ success: true, hub: hubs[0] })
          };
        } else {
          return {
            statusCode: 200,
            body: JSON.stringify({ success: false, error: 'Hub not found' })
          };
        }
      }

      // 5. GET ALL HUBS
      if (action === 'getAllHubs') {
        const { data: hubs, error } = await supabase
          .from('Hub_Configs')
          .select('*')
          .eq('Is_Active', 'checked');
        
        if (error) throw error;
        
        return {
          statusCode: 200,
          body: JSON.stringify({ success: true, hubs: hubs || [] })
        };
      }

      // 6. GET HUB BY SLUG
      if (action === 'getHubBySlug') {
        const slug = queryStringParameters?.slug;
        if (!slug) {
          return {
            statusCode: 400,
            body: JSON.stringify({ success: false, error: 'Missing slug' })
          };
        }

        const { data: hubs, error } = await supabase
          .from('Hub_Configs')
          .select('*')
          .eq('slug', slug)
          .limit(1);
        
        if (error) throw error;
        
        if (hubs && hubs.length > 0) {
          return {
            statusCode: 200,
            body: JSON.stringify({ success: true, hub: hubs[0] })
          };
        } else {
          return {
            statusCode: 200,
            body: JSON.stringify({ success: false, error: 'Hub not found' })
          };
        }
      }
    }

    // POST REQUESTS
    if (httpMethod === 'POST') {
      const data = JSON.parse(body);

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
        
        return { 
          statusCode: 200, 
          body: JSON.stringify({ success: true }) 
        };
      }

      // CREATE ORDER - WITH POPIA AND WASENDERAPI INTEGRATION
      if (data.action === 'order') {
        // Get IP address from headers
        const ipAddress = headers['x-forwarded-for'] || headers['client-ip'] || 'unknown';
        const userAgent = headers['user-agent'] || 'unknown';
        
        const waNumber = (data.waNumber || '27638716816').replace(/\D/g, ''); // Your central number
        
        // Format order message with Store ID for WasenderAPI
        const orderMessage = `[${data.Store_ID}] ORDER FOR: ${data.Customer_Name || 'Customer'}\nPhone: ${data.Customer_Phone || 'Not provided'}\n${data.Order_Items || 'No items'}\nTotal: R${(data.Total_Amount || 0).toFixed(2)}\n\nPickup window: ${data.Pickup_Window || 'ASAP'}`;
        
        // Don't create WhatsApp link anymore - we'll use WasenderAPI
        // const whatsAppUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(orderMessage)}`;

        const totalAmount = Number(data.Total_Amount) || 0;
        const commissionPool = Number((totalAmount * 0.15).toFixed(2));
        const promoterCommission = Number((commissionPool * 0.3).toFixed(2));
        const companyCommission = Number((commissionPool * 0.7).toFixed(2));

        // 1. Insert into Messages table
        const { error: messagesError } = await supabase
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

        if (messagesError) {
          console.error('Messages insert error:', messagesError);
        }

        // 2. Insert into Consent_Logs table
        const { error: consentError } = await supabase
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

        if (consentError) {
          console.error('consent_logs insert error:', consentError);
        }

        // 3. Send via WasenderAPI to central number (which then forwards)
        const wasenderResult = await sendWasenderMessage(waNumber, orderMessage);
        
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

        return { 
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            success: true, 
            // whatsAppUrl: wasenderResult.success ? null : `https://wa.me/${waNumber}?text=${encodeURIComponent(orderMessage)}`,
            message: 'Order processed with WasenderAPI' 
          }) 
        };
      }
    }

    return { 
      statusCode: 405, 
      body: JSON.stringify({ success: false, error: 'Method not allowed' }) 
    };

  } catch (err) {
    console.error('Function error:', err);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ success: false, error: err.message }) 
    };
  }
};