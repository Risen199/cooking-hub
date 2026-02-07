// netlify/functions/handle-order.js
const Airtable = require('airtable');

const BASE_ID = 'appoP1ZMDdmvT6FS9';
const TOKEN = 'patMK7isPmfDCmx3F.91c22d6c139da1dc37a447247ea87b2e98c30a4621b7cc58179da1fda2703a5b2';

const base = new Airtable({ apiKey: TOKEN }).base(BASE_ID);

exports.handler = async (event) => {
  const { httpMethod, queryStringParameters, body } = event;

  try {
    // === GET REQUESTS ===
    if (httpMethod === 'GET') {
      const action = queryStringParameters?.action;

      if (action === 'stores') {
        const records = await base('Stores').select().all();
        const stores = records.map(r => ({ id: r.id, ...r.fields }));
        return { statusCode: 200, body: JSON.stringify({ success: true, stores }) };
      }

      if (action === 'menu') {
        const storeId = queryStringParameters.storeId;
        if (!storeId) {
          return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing storeId' }) };
        }
        const records = await base('Menu').select({
          filterByFormula: `{Store_ID} = '${storeId}'`
        }).all();
        const menu = records.map(r => r.fields);
        return { statusCode: 200, body: JSON.stringify({ success: true, menu }) };
      }

      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Invalid GET action' }) };
    }

    // === POST REQUESTS ===
    if (httpMethod === 'POST') {
      const data = JSON.parse(body);

      if (data.action === 'logHeatmap') {
        await base('Heatmap').create({
          fields: { 'Search_Term': String(data.searchTerm).trim().toLowerCase() }
        });
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      if (data.action === 'order') {
        await base('Messages').create({
          fields: {
            Store_ID: data.storeId,
            Customer_Name: data.customerName,
            Items: data.items,
            Total: parseFloat(data.total),
            Pickup_Window: data.pickupWindow
          }
        });
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Invalid POST action' }) };
    }

    return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Function error:', err);
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};