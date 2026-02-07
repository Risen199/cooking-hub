// netlify/functions/handle-order.js
exports.handler = async (event) => {
  const { httpMethod, queryStringParameters } = event;

  // Test endpoint — works without Airtable
  if (httpMethod === 'GET' && queryStringParameters?.action === 'test') {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, time: new Date().toISOString() })
    };
  }

  // Real Airtable call — hardcoded token, no variables
  const BASE_ID = 'appoP1ZMDdmvT6FS9';
  const TOKEN = 'patMK7isPmfDCmx3F.91c22d6c139da1dc37a47247ea87b2e98c30a4621b7cc58179da1fda2703a5b2';

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/tblxwBYTxDoM5CYvD`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: res.status,
        body: JSON.stringify({ success: false, error: `Airtable error ${res.status}: ${text}` })
      };
    }

    const data = await res.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, stores: data.records.map(r => r.fields) })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};