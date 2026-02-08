// netlify/functions/handle-order.js

const fetch = globalThis.fetch || require('node-fetch');

exports.handler = async (event) => {
  const { httpMethod, queryStringParameters, body } = event;
  const BASE_ID = 'appoP1ZMDdmvT6FS9';
  const TOKEN = 'patMK7isPmfDCmx3F.91c22d6c139da1dc37a47247ea87b2e98c30a4621b7cc58179da1fda2703a5b2';
  const HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    // === GET: stores or menu ===
    if (httpMethod === 'GET') {
      const action = queryStringParameters?.action;

      if (action === 'stores') {
        const township = queryStringParameters?.township;
        let url = `https://api.airtable.com/v0/${BASE_ID}/Stores`;
        
        if (township) {
          const formula = encodeURIComponent(`{Township_Code} = '${township}'`);
          url += `?filterByFormula=${formula}`;
        }
        
        const res = await fetch(url, { headers: HEADERS });
        const data = await res.json();
        const stores = data.records?.map(r => r.fields) || [];
        return { 
          statusCode: 200, 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, stores }) 
        };
      }

      if (action === 'menu') {
        const storeId = queryStringParameters.storeId;
        if (!storeId) {
          return { 
            statusCode: 400, 
            body: JSON.stringify({ success: false, error: 'Missing storeId' }) 
          };
        }
        const formula = encodeURIComponent(`{Store_ID} = '${storeId}'`);
        const url = `https://api.airtable.com/v0/${BASE_ID}/Menu?filterByFormula=${formula}`;
        const res = await fetch(url, { headers: HEADERS });
        const data = await res.json();
        const menu = data.records?.map(r => r.fields) || [];
        return { 
          statusCode: 200, 
          body: JSON.stringify({ success: true, menu }) 
        };
      }

      return { 
        statusCode: 400, 
        body: JSON.stringify({ success: false, error: 'Invalid GET action' }) 
      };
    }

    // === POST: heatmap or order ===
    if (httpMethod === 'POST') {
      const data = JSON.parse(body);

      if (data.action === 'logHeatmap') {
        const searchTerm = data.Search_Term || data.searchTerm || data.search_Term || '';
        
        const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Heatmap`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({
            records: [{
              fields: {
                'Search_Term': String(searchTerm).trim().toLowerCase()
              }
            }]
          })
        });
        
        const result = await response.json();
        
        return { 
          statusCode: 200, 
          body: JSON.stringify({ success: response.ok, airtableResponse: result }) 
        };
      }

      // ✅ FIXED ORDER LOGGING
      if (data.action === 'order') {
        console.log('🔴 ORDER RECEIVED:', data);

        // Get store WhatsApp number (fallback to default if not provided)
        const waNumber = (data.waNumber || '27726515909').replace(/\D/g, '');
        
        // Format order items properly for WhatsApp message
        const orderItems = typeof data.Order_Items === 'string' 
          ? data.Order_Items.replace(/\|/g, '\n')  // Replace pipes with newlines
          : 'No items specified';
        
        const orderMessage = `ORDER FOR: ${data.Customer_Name || 'Customer'}\n${orderItems}\nTotal: R${(data.Total_Amount || 0).toFixed(2)}\n\nPickup window: ${data.Pickup_Window || 'ASAP'}`;
        const whatsAppUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(orderMessage)}`;

        // ✅ FIXED: Log order to Messages table with ALL required fields
        const orderData = {
          Message_ID: 'msg_' + Date.now() + Math.floor(Math.random() * 1000),
          Store_ID: data.Store_ID || data.storeId || 'unknown',
          Customer_Name: data.Customer_Name || data.customerName || 'Customer',
          Order_Items: data.Order_Items || data.orderItems || 'No items',
          Total_Amount: parseFloat(data.Total_Amount || data.totalAmount || data.total || 0),
          Pickup_Window: data.Pickup_Window || data.pickupWindow || 'ASAP',
          Delivery_Type: data.Delivery_Type || data.deliveryType || 'Collection',
          Status: 'Ordered',
          Source: 'Website'
        };

        console.log('🟢 SENDING TO AIRTABLE:', orderData);

        try {
          const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Messages`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({
              records: [{ fields: orderData }]
            })
          });

          const result = await response.json();
          console.log('🟡 AIRTABLE RESPONSE:', result);

          return { 
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              success: response.ok, 
              whatsAppUrl, 
              airtableResponse: result,
              message: 'Order logged successfully' 
            }) 
          };
        } catch (airtableError) {
          console.error('🔴 AIRTABLE ERROR:', airtableError);
          // Still return WhatsApp URL even if logging fails
          return { 
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              success: false, 
              whatsAppUrl,
              error: 'Order sent to WhatsApp but failed to log to database',
              airtableError: airtableError.message 
            }) 
          };
        }
      }

      return { 
        statusCode: 400, 
        body: JSON.stringify({ success: false, error: 'Invalid POST action' }) 
      };
    }

    return { 
      statusCode: 405, 
      body: JSON.stringify({ success: false, error: 'Method not allowed' }) 
    };

  } catch (err) {
    console.error('❌ FUNCTION ERROR:', err);
    return { 
      statusCode: 500, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: err.message, 
        stack: err.stack 
      }) 
    };
  }
};