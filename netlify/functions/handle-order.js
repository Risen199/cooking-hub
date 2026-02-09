// netlify/functions/handle-order.js

const fetch = globalThis.fetch || require('node-fetch');

exports.handler = async (event) => {
  const { httpMethod, queryStringParameters, body } = event;
  const BASE_ID = 'appoP1ZMDdmvT6FS9';
  const TOKEN = 'patt5rEogpO4GBF3J.62aa651a0d72ee5bf4e59d99eeada69912249c6b3760158cec086da40a776465';
  const HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    // === GET: stores, menu, searchArea, getHub ===
    if (httpMethod === 'GET') {
      const action = queryStringParameters?.action;

      // === UPDATED: Fetch stores with new status fields ===
      if (action === 'stores') {
        const township = queryStringParameters?.township;
        
        // Start with base filter for active stores
        let formula = '{Is_Active} = TRUE()';
        if (township) {
          formula = `AND(${formula}, {Township_Code} = '${township}')`;
        }
        
        const encodedFormula = encodeURIComponent(formula);
        const url = `https://api.airtable.com/v0/${BASE_ID}/Stores?filterByFormula=${encodedFormula}`;
        
        const res = await fetch(url, { headers: HEADERS });
        const data = await res.json();
        
        // Map records to include the new fields
        const stores = data.records?.map(r => ({
          ...r.fields,
          Temporarily_Closed: r.fields.Temporarily_Closed || false,
          Status_Message: r.fields.Status_Message || ''
        })) || [];
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, stores })
        };
      }

      // Fetch menu for specific store (NO CHANGES)
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

      // === NEW: Search area using Location_Aliases ===
      if (action === 'searchArea') {
        const searchTerm = queryStringParameters?.q?.toLowerCase().trim();
        if (!searchTerm) {
          return {
            statusCode: 400,
            body: JSON.stringify({ success: false, error: 'Missing search term (q)' })
          };
        }

        // Fetch ALL active stores
        const allStoresUrl = `https://api.airtable.com/v0/${BASE_ID}/Stores?filterByFormula=${encodeURIComponent('{Is_Active} = TRUE()')}`;
        const storesRes = await fetch(allStoresUrl, { headers: HEADERS });
        const storesData = await storesRes.json();
        const allStores = storesData.records?.map(r => r.fields) || [];

        // Find store where searchTerm matches any Location_Aliases
        let foundTownshipCode = null;
        for (const store of allStores) {
          const aliases = store.Location_Aliases
            ?.split(',')
            .map(a => a.trim().toLowerCase());

          if (aliases && aliases.includes(searchTerm)) {
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

      // === NEW: Get hub configuration ===
      if (action === 'getHub') {
        const townshipCode = queryStringParameters?.township;
        if (!townshipCode) {
          return {
            statusCode: 400,
            body: JSON.stringify({ success: false, error: 'Missing township code' })
          };
        }

        // Use Table ID for Hub_Configs: tblTBMwzYMzS8EIYx
        const formula = encodeURIComponent(`AND({Township_Code} = '${townshipCode}', {Is_Active} = TRUE())`);
        const url = `https://api.airtable.com/v0/${BASE_ID}/tblTBMwzYMzS8EIYx?filterByFormula=${formula}`;
        
        const res = await fetch(url, { headers: HEADERS });
        const data = await res.json();
        
        if (data.records.length > 0) {
          const hubConfig = data.records[0].fields;
          return {
            statusCode: 200,
            body: JSON.stringify({ success: true, hub: hubConfig })
          };
        } else {
          return {
            statusCode: 404,
            body: JSON.stringify({ success: false, error: 'Hub not found' })
          };
        }
      }

      return { 
        statusCode: 400, 
        body: JSON.stringify({ success: false, error: 'Invalid GET action' }) 
      };
    }

    // === POST: heatmap or order ===
    if (httpMethod === 'POST') {
      const data = JSON.parse(body);

      // Log unknown area searches to Heatmap table
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

      // Log order to Messages table
      if (data.action === 'order') {
        console.log('🔴 ORDER RECEIVED:', data);

        // Get store WhatsApp number
        const waNumber = (data.waNumber || '27726515909').replace(/\D/g, '');
        
        // Format order items for WhatsApp message
        const orderItems = typeof data.Order_Items === 'string' 
          ? data.Order_Items.replace(/\|/g, '\n')
          : 'No items specified';
        
        const orderMessage = `ORDER FOR: ${data.Customer_Name || 'Customer'}\n${orderItems}\nTotal: R${(data.Total_Amount || 0).toFixed(2)}\n\nPickup window: ${data.Pickup_Window || 'ASAP'}`;
        const whatsAppUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(orderMessage)}`;

        // Order data for Airtable
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