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

exports.handler = async (event) => {
  const { httpMethod, queryStringParameters, body } = event;

  try {
    // GET REQUESTS
    if (httpMethod === 'GET') {
      const action = queryStringParameters?.action;

      // 1. GET STORES - UPDATED WITH SLUG FIELD
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
  
  // Ensure slug field is included (it should already be there from your DB)
  // But we'll log to verify
  console.log('Stores fetched with slugs:', stores?.map(s => ({ 
    id: s.Store_ID, 
    name: s.Name, 
    slug: s.slug 
  })));
  
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

      // 4. GET HUB CONFIG - UPDATED WITH SLUG
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
    // Log to verify slug is there
    console.log('Hub fetched with slug:', hubs[0].slug);
    
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

      // 5. GET HUB BY SLUG - NEW FOR CLEAN URLS
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

    // POST REQUESTS
    if (httpMethod === 'POST') {
      const data = JSON.parse(body);

      // LOG HEATMAP SEARCH
      if (data.action === 'logHeatmap') {
        const searchTerm = data.Search_Term || '';
        
        // FIXED: Using correct column names and SA timestamp
        const { error } = await supabase
          .from('Heatmap')
          .insert([{ 
            Search_Term: searchTerm,
            Timestamp: getSATimestamp()
          }]);
        
        if (error) {
          console.error('Heatmap insert error:', error);
          // Don't throw - we still want to return success to user
        }
        
        return { 
          statusCode: 200, 
          body: JSON.stringify({ success: true }) 
        };
      }

      // CREATE ORDER     
    if (data.action === 'order') {
      const waNumber = (data.waNumber || '27726515909').replace(/\D/g, '');
      const orderMessage = `ORDER FOR: ${data.Customer_Name || 'Customer'}\n${data.Order_Items || 'No items'}\nTotal: R${(data.Total_Amount || 0).toFixed(2)}\n\nPickup window: ${data.Pickup_Window || 'ASAP'}`;
      const whatsAppUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(orderMessage)}`;

  // ✅ CALCULATE COMMISSIONS
  const totalAmount = Number(data.Total_Amount) || 0;
  const commissionPool = Number((totalAmount * 0.15).toFixed(2));
  const promoterCommission = Number((commissionPool * 0.3).toFixed(2));
  const companyCommission = Number((commissionPool * 0.7).toFixed(2));

  // Log to Messages table with calculated commissions
  const { error } = await supabase
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

        if (error) {
          console.error('Messages insert error:', error);
          // WhatsApp still works even if logging fails
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