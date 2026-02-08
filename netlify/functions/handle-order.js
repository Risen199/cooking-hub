// netlify/functions/handle-order.js
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
        const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Stores`, { headers: HEADERS });
        const data = await res.json();
        const stores = data.records?.map(r => r.fields) || [];
        return { statusCode: 200, body: JSON.stringify({ success: true, stores }) };
      }

      if (action === 'menu') {
        const storeId = queryStringParameters.storeId;
        if (!storeId) {
          return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing storeId' }) };
        }
        const formula = encodeURIComponent(`{Store_ID} = '${storeId}'`);
        const url = `https://api.airtable.com/v0/${BASE_ID}/Menu?filterByFormula=${formula}`;
        const res = await fetch(url, { headers: HEADERS });
        const data = await res.json();
        const menu = data.records?.map(r => r.fields) || [];
        return { statusCode: 200, body: JSON.stringify({ success: true, menu }) };
      }

      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Invalid GET action' }) };
    }

    // === POST: heatmap or order ===
    if (httpMethod === 'POST') {
      const data = JSON.parse(body);

      if (data.action === 'logHeatmap') {
        await fetch(`https://api.airtable.com/v0/${BASE_ID}/Heatmap`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({
            records: [{
              fields: {
                'Search_Term': String(data.searchTerm).trim().toLowerCase()
              }
            }]
          })
        });
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      if (data.action === 'order') {
        await fetch(`https://api.airtable.com/v0/${BASE_ID}/Messages`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({
            records: [{
              fields: {
                Store_ID: data.storeId,
                Customer_Name: data.customerName,
                Items: data.items,
                Total: parseFloat(data.total),
                Pickup_Window: data.pickupWindow
              }
            }]
          })
        });
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Invalid POST action' }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};