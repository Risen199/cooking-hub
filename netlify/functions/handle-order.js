// netlify/functions/handle-order.js

// Polyfill for fetch if not available
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

      // Fetch all stores (optionally filtered by township)
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

      // Fetch menu for specific store
      if (action === 'menu') {
        const storeId = queryStringParameters.storeId;
        if (!storeId) {
          return { 
            statusCode: 400, 
            headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, menu }) 
        };
      }

      return { 
        statusCode: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Invalid GET action' }) 
      };
    }

    // === POST: heatmap or order ===
    if (httpMethod === 'POST') {
      const data = JSON.parse(body);

      // Log unknown area searches to Heatmap table (NO timestamp - let Airtable handle it)
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: response.ok, airtableResponse: result }) 
        };
      }

      // Log order to Messages table (NO timestamp - let Airtable handle it)
      if (data.action === 'order') {
        const messageId = 'msg_' + Date.now();
        
        const orderData = {
          Message_ID: messageId,
          Store_ID: data.Store_ID || data.storeId,
          Customer_Name: data.Customer_Name || data.customerName,
          Order_Items: data.Order_Items || data.orderItems || data.items,
          Total_Amount: parseFloat(data.Total_Amount || data.totalAmount || data.total || 0),
          Pickup_Window: data.Pickup_Window || data.pickupWindow || '',
          Delivery_Type: data.Delivery_Type || data.deliveryType || 'Collection',
          Status: 'Ordered',
          Source: 'Website',
          Commission_Pool: parseFloat(data.Commission_Pool || 0),
          Promoter_Commission: parseFloat(data.Promoter_Commission || 0),
          Company_Commission: parseFloat(data.Company_Commission || 0)
        };

        const waNumber = (data.waNumber || '27726515909').replace(/\D/g, '');
        const orderMessage = `ORDER FOR: ${orderData.Customer_Name}\n${orderData.Order_Items}\nTotal: R${orderData.Total_Amount.toFixed(2)}\n\nPickup window: ${orderData.Pickup_Window}`;
        const whatsAppUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(orderMessage)}`;

        const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Messages`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({
            records: [{ fields: orderData }]
          })
        });

        const result = await response.json();

        return { 
          statusCode: 200, 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: response.ok, whatsAppUrl, airtableResponse: result }) 
        };
      }

      return { 
        statusCode: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Invalid POST action' }) 
      };
    }

    return { 
      statusCode: 405, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Method not allowed' }) 
    };

  } catch (err) {
    console.error('Function error:', err);
    return { 
      statusCode: 500, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message, stack: err.stack }) 
    };
  }
};