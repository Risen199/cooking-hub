// netlify/functions/whatsapp-webhook.js
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to send WhatsApp messages via WasenderAPI
async function sendWasenderMessage(to, text) {
  try {
    const response = await fetch('https://www.wasenderapi.com/api/send-message', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WASENDER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to, text })
    });
    return await response.json();
  } catch (error) {
    console.error('Send error:', error);
    return null;
  }
}

// Calculate date ranges (Saturday to Friday)
function getWeekRange(date = new Date()) {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  const start = new Date(date);
  const end = new Date(date);
  
  // If today is Saturday or later, last week ended yesterday (Friday)
  if (day >= 6) { // Saturday
    start.setDate(date.getDate() - day - 1); // Go back to previous Saturday
    end.setDate(date.getDate() - day); // Previous Friday
  } else {
    start.setDate(date.getDate() - day - 6); // Go back to Saturday
    end.setDate(date.getDate() - day); // This Friday
  }
  
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);
  
  return { start, end };
}

// Format currency
const formatMoney = (amount) => `R${Number(amount).toFixed(2)}`;

// Extract phone number properly from WhatsApp LID format
function extractPhoneNumber(messageKey) {
  console.log('🔍 Extracting phone from:', JSON.stringify(messageKey));
  
  let phoneNumber = null;
  
  // Method 1: Use senderPn if available (this is the phone number format)
  if (messageKey.senderPn) {
    phoneNumber = messageKey.senderPn.split('@')[0];
    console.log('✅ Found senderPn:', phoneNumber);
  }
  // Method 2: Use cleanedSenderPn if available
  else if (messageKey.cleanedSenderPn) {
    phoneNumber = messageKey.cleanedSenderPn;
    console.log('✅ Found cleanedSenderPn:', phoneNumber);
  }
  // Method 3: Fallback to remoteJid but clean it
  else {
    let rawNumber = messageKey.remoteJid.split('@')[0];
    // Remove any non-digits
    phoneNumber = rawNumber.replace(/\D/g, '');
    console.log('⚠️ Using cleaned remoteJid:', phoneNumber);
  }
  
  // Ensure it has South African country code (27)
  if (phoneNumber) {
    // Remove any + or spaces
    phoneNumber = phoneNumber.replace(/\D/g, '');
    
    // Format for SA numbers
    if (phoneNumber.length === 9) {
      phoneNumber = '27' + phoneNumber;
    } else if (phoneNumber.length === 10 && phoneNumber.startsWith('0')) {
      phoneNumber = '27' + phoneNumber.slice(1);
    } else if (phoneNumber.length === 11 && phoneNumber.startsWith('27')) {
      // Already correct format
    } else if (phoneNumber.length === 12 && phoneNumber.startsWith('27')) {
      // Already correct format
    }
    
    // Add + for database lookup
    phoneNumber = '+' + phoneNumber;
  }
  
  console.log('📱 Final formatted number:', phoneNumber);
  return phoneNumber;
}

exports.handler = async (event) => {
  // Only accept POST requests from WasenderAPI
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parse the incoming webhook
    const payload = JSON.parse(event.body);
    console.log('📩 Webhook received:', JSON.stringify(payload, null, 2));
    
    // Extract message details
    const message = payload.data?.messages;
    if (!message) {
      return { statusCode: 200, body: 'OK' };
    }
    
    const messageKey = message.key;
    const messageText = message.message?.conversation || message.messageBody || '';
    
    // Extract phone number using our new function
    const formattedNumber = extractPhoneNumber(messageKey);
    
    console.log(`📱 From: ${formattedNumber}, Text: "${messageText}"`);

    // Handle different commands
    const command = messageText.toUpperCase().trim();
    
    // EARNINGS command - show main menu
    if (command === 'EARNINGS' || command === '1') {
      // Find promoter by phone number
      const { data: promoter, error } = await supabase
        .from('promoters')
        .select('*')
        .eq('phone', formattedNumber)
        .maybeSingle();
      
      console.log('🔍 Promoter lookup:', { promoter, error, phone: formattedNumber });
      
      if (!promoter) {
        await sendWasenderMessage(formattedNumber, 
          `❌ You're not registered as a promoter.\n\nPhone: ${formattedNumber}\n\nContact BEIJU to get started.`);
        return { statusCode: 200, body: 'OK' };
      }
      
      // Get all stores for this promoter
      const { data: stores } = await supabase
        .from('Stores')
        .select('Store_ID, Name')
        .eq('promoter_id', promoter.id);
      
      if (!stores || stores.length === 0) {
        await sendWasenderMessage(formattedNumber,
          `👋 ${promoter.promoter_name}\n\nYou have no stores yet. Add some to start earning!`);
        return { statusCode: 200, body: 'OK' };
      }
      
      const storeIds = stores.map(s => s.Store_ID);
      
      // Get last week's completed earnings
      const lastWeek = getWeekRange(new Date(Date.now() - 7 * 86400000));
      const { data: lastWeekOrders } = await supabase
        .from('Messages')
        .select('Store_ID, Promoter_Commission')
        .in('Store_ID', storeIds)
        .gte('Timestamp', lastWeek.start.toISOString())
        .lt('Timestamp', lastWeek.end.toISOString());
      
      const lastWeekTotal = (lastWeekOrders || []).reduce(
        (sum, o) => sum + (Number(o.Promoter_Commission) || 0), 0
      );
      
      // Get this week's in-progress earnings
      const thisWeek = getWeekRange(new Date());
      const { data: thisWeekOrders } = await supabase
        .from('Messages')
        .select('Store_ID, Promoter_Commission')
        .in('Store_ID', storeIds)
        .gte('Timestamp', thisWeek.start.toISOString())
        .lt('Timestamp', thisWeek.end.toISOString());
      
      const thisWeekTotal = (thisWeekOrders || []).reduce(
        (sum, o) => sum + (Number(o.Promoter_Commission) || 0), 0
      );
      
      // Calculate per-store totals for this week
      const storeTotals = {};
      stores.forEach(store => { storeTotals[store.Store_ID] = 0; });
      (thisWeekOrders || []).forEach(order => {
        storeTotals[order.Store_ID] += Number(order.Promoter_Commission) || 0;
      });
      
      // Build the response message
      let response = `👋 *${promoter.promoter_name}*, your earnings:\n\n`;
      
      // Last week (paid)
      response += `📆 *Last week* (${lastWeek.start.toLocaleDateString()} - ${lastWeek.end.toLocaleDateString()})\n`;
      response += `💰 ${formatMoney(lastWeekTotal)} ✅ *PAID*\n\n`;
      
      // This week (in progress)
      response += `📆 *This week* (${thisWeek.start.toLocaleDateString()} - in progress)\n`;
      response += `💰 ${formatMoney(thisWeekTotal)} *(pending)*\n\n`;
      
      // Store breakdown
      response += `*Your stores this week:*\n`;
      stores.slice(0, 5).forEach(store => {
        response += `🍳 ${store.Name}: ${formatMoney(storeTotals[store.Store_ID] || 0)}\n`;
      });
      
      if (stores.length > 5) {
        response += `... and ${stores.length - 5} more stores\n`;
      }
      
      response += `\n📱 *Reply with:*\n`;
      response += `1️⃣ This week details\n`;
      response += `2️⃣ Last week details\n`;
      response += `3️⃣ All stores breakdown\n`;
      response += `4️⃣ This month\n`;
      
      await sendWasenderMessage(formattedNumber, response);
      console.log('✅ Response sent to:', formattedNumber);
    }
    
    // Handle numeric menu options
    else if (['1', '2', '3', '4'].includes(command)) {
      // Similar logic for detailed views
      // We'll implement these next
      await sendWasenderMessage(formattedNumber, 
        `📊 Detailed view coming soon!\n\nReply EARNINGS for main menu.`);
    }
    
    // Unknown command
    else {
      await sendWasenderMessage(formattedNumber,
        `📱 *BEIJU Promoter System*\n\n` +
        `Reply *EARNINGS* to see your earnings.\n\n` +
        `Need help? Contact support.`);
    }
    
    return { statusCode: 200, body: 'OK' };
    
  } catch (error) {
    console.error('Webhook error:', error);
    return { statusCode: 200, body: 'OK' }; // Always return 200 to Wasender
  }
};