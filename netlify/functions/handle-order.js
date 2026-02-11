// netlify/functions/handle-order.js

const fetch = globalThis.fetch || require('node-fetch');

exports.handler = async (event) => {
  const { httpMethod, queryStringParameters, body } = event;
  
  // ✅ SIMPLE: Hardcode everything - no env vars
  const BASE_ID = 'appoP1ZMDdmvT6FS9';
  const TOKEN = 'patt5rEogpO4GBF3J.62aa651a0d72ee5bf4e59d99eeada69912249c6b3760158cec086da40a776465';
  
  const HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    if (httpMethod === 'GET') {
      const action = queryStringParameters?.action;

      // 1. GET STORES
      if (action === 'stores') {
        const township = queryStringParameters?.township;
        let formula = "{Is_Active} = 'checked'";
        if (township) {
          formula = `AND(${formula}, {Township_Code} = '${township}')`;
        }
        const encodedFormula = encodeURIComponent(formula);
        const url = `https://api.airtable.com/v0/${BASE_ID}/Stores?filterByFormula=${encodedFormula}`;
        
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

      // 2. GET MENU
      if (action === 'menu') {
        const storeId = queryStringParameters.storeId;
        if (!storeId) return { 
          statusCode: 400, 
          body: JSON.stringify({ success: false, error: 'Missing storeId' }) 
        };
        
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

      // 3. SEARCH AREA - FIXED: Gets ALL stores (no filter)
      if (action === 'searchArea') {
        const searchTerm = queryStringParameters?.q?.toLowerCase().trim();
        if (!searchTerm) {
          return {
            statusCode: 400,
            body: JSON.stringify({ success: false, error: 'Missing search term' })
          };
        }

        // Get ALL stores - no filter
        const url = `https://api.airtable.com/v0/${BASE_ID}/Stores`;
        const res = await fetch(url, { headers: HEADERS });
        const data = await res.json();
        const allStores = data.records?.map(r => r.fields) || [];

        let foundTownshipCode = null;
        for (const store of allStores) {
          let aliasList = [];
          if (Array.isArray(store.Location_Aliases)) {
            aliasList = store.Location_Aliases.map(a => String(a).toLowerCase().trim());
          } else if (typeof store.Location_Aliases === 'string') {
            aliasList = store.Location_Aliases.split(',').map(a => a.trim().toLowerCase());
          }
          
          if (aliasList.includes(searchTerm)) {
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

      // 4. GET HUB CONFIG
      if (action === 'getHub') {
        const townshipCode = queryStringParameters?.township;
        if (!townshipCode) {
          return {
            statusCode: 400,
            body: JSON.stringify({ success: false, error: 'Missing township code' })
          };
        }

        const formula = encodeURIComponent(`AND({Township_Code} = '${townshipCode}', {Is_Active} = 'checked')`);
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
    }

    // POST REQUESTS
    if (httpMethod === 'POST') {
      const data = JSON.parse(body);

      if (data.action === 'logHeatmap') {
        const searchTerm = data.Search_Term || '';
        const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Heatmap`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({
            records: [{ fields: { 'Search_Term': searchTerm } }]
          })
        });
        
        const result = await response.json();
        return { 
          statusCode: 200, 
          body: JSON.stringify({ success: response.ok, airtableResponse: result }) 
        };
      }

      if (data.action === 'order') {
        const waNumber = (data.waNumber || '27726515909').replace(/\D/g, '');
        const orderMessage = `ORDER FOR: ${data.Customer_Name || 'Customer'}\n${data.Order_Items || 'No items'}\nTotal: R${(data.Total_Amount || 0).toFixed(2)}\n\nPickup window: ${data.Pickup_Window || 'ASAP'}`;
        const whatsAppUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(orderMessage)}`;

        try {
          await fetch(`https://api.airtable.com/v0/${BASE_ID}/Messages`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({
              records: [{
                fields: {
                  Message_ID: 'msg_' + Date.now(),
                  Store_ID: data.Store_ID || 'unknown',
                  Customer_Name: data.Customer_Name || 'Customer',
                  Order_Items: data.Order_Items || 'No items',
                  Total_Amount: data.Total_Amount || 0,
                  Pickup_Window: data.Pickup_Window || 'ASAP',
                  Delivery_Type: data.Delivery_Type || 'Collection',
                  Status: 'Ordered'
                }
              }]
            })
          });
        } catch (err) {
          console.log('Airtable log failed, but WhatsApp will still work');
        }

        return { 
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            success: true, 
            whatsAppUrl,
            message: 'Order sent to WhatsApp' 
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