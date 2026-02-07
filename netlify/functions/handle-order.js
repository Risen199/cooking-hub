// /netlify/functions/handle-order.js
const fetch = require('node-fetch');

// ✅ YOUR AIRTABLE CREDENTIALS — REPLACE ONLY IF NEEDED (but keep secure)
const BASE_ID = 'appoP1ZMDdmvT6FS9';
const API_KEY = 'patd5OWIwov3LBiGI.0747e39177d1a07b7fa1b0ea389eba02b042c03e1db42c8d68d4144724f6fb5f';

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  const { httpMethod, queryStringParameters, body } = event;

  try {
    // 🔹 READ: GET stores
    if (httpMethod === 'GET' && queryStringParameters?.action === 'stores') {
      const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/tblxwBYTxDoM5CYvD`, { headers });
      const data = await res.json();
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: data.records.map(r => r.fields) })
      };
    }

    // 🔹 READ: GET menu for a store
    if (httpMethod === 'GET' && queryStringParameters?.action === 'menu' && queryStringParameters.storeId) {
      const storeId = queryStringParameters.storeId;
      const filter = encodeURIComponent(`{Store_ID}="${storeId}"`);
      const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/tbloZx7wskXik4fmp?filterByFormula=${filter}`, { headers });
      const data = await res.json();
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: data.records.map(r => r.fields) })
      };
    }

    // 🔹 WRITE: POST new order to Messages
    if (httpMethod === 'POST') {
      const payload = JSON.parse(body);
      const {
        storeId,
        customerName,
        items,
        total,
        pickupWindow,
        waNumber
      } = payload;

      const record = {
        fields: {
          Store_ID: storeId,
          Customer_Name: customerName,
          Items: items,
          Total_Amount: parseFloat(total),
          Pickup_Window: pickupWindow,
          WhatsApp_Number: waNumber,
          Status: 'Ordered',
          Timestamp: new Date().toISOString() // Airtable auto-sets if omitted, but safe to include
        }
      };

      const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/tblAtD2DM2ZRtFA0c`, {
        method: 'POST',
        headers,
        body: JSON.stringify(record)
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { statusCode: 500, body: JSON.stringify({ success: false, error: errorText }) };
      }

      const created = await res.json();
      const whatsAppUrl = `https://wa.me/${waNumber.replace(/\D/g, '')}?text=${encodeURIComponent(
        `ORDER FOR: ${customerName}\n${items}\nTotal: R${total}\nPickup: ${pickupWindow}`
      )}`;

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          whatsAppUrl,
          orderId: created.id
        })
      };
    }

    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Invalid request' }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ success: false, error: err.message }) };
  }
};