// api/stitch-client.js
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  
  try {
    const { orderId, amount, customerPhone, customerEmail } = req.body;
    
    if (!orderId || !amount || !customerPhone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    const cleanPhone = String(customerPhone).replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('27') ? `+${cleanPhone}` : `+27${cleanPhone.slice(1)}`;
    
    console.log('🔧 Getting Stitch token...');
    
    // Step 1: Get access token
    const tokenResponse = await fetch('https://secure.stitch.money/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.STITCH_CLIENT_ID,
        client_secret: process.env.STITCH_SECRET,
        scope: 'client_paymentrequest'
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      console.error('❌ Failed to get Stitch token:', tokenData);
      return res.status(200).json({ 
        success: false, 
        error: 'Authentication failed with Stitch' 
      });
    }
    
    console.log('✅ Stitch token obtained');
    
    // Step 2: Create payment request using GraphQL
    const mutation = {
      query: `
        mutation CreatePaymentRequest($input: PaymentInitiationRequestCreateInput!) {
          paymentInitiationRequestCreate(input: $input) {
            id
            url
          }
        }
      `,
      variables: {
        input: {
          amount: {
            currency: "ZAR",
            quantity: amount.toString()
          },
          paymentMethods: {
            eft: { enabled: true }
          },
          externalReference: orderId,
          payerInformation: {
            payerId: customerEmail || orderId,
            phoneNumber: formattedPhone
          },
          expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          metadata: {
            orderId: orderId
          },
          redirectUri: "https://beiju.co.za/order-confirmation"
        }
      }
    };
    
    console.log('🔧 Creating payment request for order:', orderId);
    
    const paymentResponse = await fetch('https://api.stitch.money/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mutation)
    });
    
    const paymentData = await paymentResponse.json();
    
    if (paymentData.errors) {
      console.error('❌ Stitch GraphQL errors:', JSON.stringify(paymentData.errors, null, 2));
      return res.status(200).json({ 
        success: false, 
        error: paymentData.errors[0].message 
      });
    }
    
    const paymentUrl = paymentData.data?.paymentInitiationRequestCreate?.url;
    const paymentId = paymentData.data?.paymentInitiationRequestCreate?.id;
    
    if (!paymentUrl) {
      console.error('❌ No payment URL in response:', paymentData);
      return res.status(200).json({ 
        success: false, 
        error: 'Stitch did not return a payment URL' 
      });
    }
    
    console.log('✅ Payment URL created:', paymentUrl);
    
    return res.status(200).json({ 
      success: true, 
      url: paymentUrl, 
      paymentId: paymentId 
    });
    
  } catch (error) {
    console.error('❌ Stitch error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};