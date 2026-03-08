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
  
  if (day >= 6) { // Saturday
    start.setDate(date.getDate() - day - 1);
    end.setDate(date.getDate() - day);
  } else {
    start.setDate(date.getDate() - day - 6);
    end.setDate(date.getDate() - day);
  }
  
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);
  
  return { start, end };
}

// Get month date range
function getMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);
  return { start, end };
}

// Format currency
const formatMoney = (amount) => `R${Number(amount).toFixed(2)}`;

// Format date for display
const formatDate = (date) => {
  return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
};

// Extract phone number properly from WhatsApp LID format
function extractPhoneNumber(messageKey) {
  console.log('🔍 Extracting phone from:', JSON.stringify(messageKey));
  
  let phoneNumber = null;
  
  if (messageKey.senderPn) {
    phoneNumber = messageKey.senderPn.split('@')[0];
  } else if (messageKey.cleanedSenderPn) {
    phoneNumber = messageKey.cleanedSenderPn;
  } else {
    let rawNumber = messageKey.remoteJid.split('@')[0];
    phoneNumber = rawNumber.replace(/\D/g, '');
  }
  
  if (phoneNumber) {
    phoneNumber = phoneNumber.replace(/\D/g, '');
    
    if (phoneNumber.length === 9) {
      phoneNumber = '27' + phoneNumber;
    } else if (phoneNumber.length === 10 && phoneNumber.startsWith('0')) {
      phoneNumber = '27' + phoneNumber.slice(1);
    }
    
    phoneNumber = '+' + phoneNumber;
  }
  
  return phoneNumber;
}

// Show main menu - CORRECTED MATH
async function showMainMenu(phoneNumber, promoter) {
  // Get all stores for this promoter
  const { data: stores } = await supabase
    .from('Stores')
    .select('Store_ID, Name')
    .eq('promoter_id', promoter.id);
  
  if (!stores || stores.length === 0) {
    await sendWasenderMessage(phoneNumber,
      `👋 *${promoter.promoter_name}*\n\nYou have no stores yet. Add some to start earning!`);
    return;
  }
  
  const storeIds = stores.map(s => s.Store_ID);
  
  // Get last week's completed orders
  const lastWeek = getWeekRange(new Date(Date.now() - 7 * 86400000));
  const { data: lastWeekOrders } = await supabase
    .from('Messages')
    .select('Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', lastWeek.start.toISOString())
    .lt('Timestamp', lastWeek.end.toISOString());
  
  const lastWeekTotal = (lastWeekOrders || []).reduce(
    (sum, o) => sum + (Number(o.Total_Amount) || 0), 0
  );
  const lastWeekHubCommission = lastWeekTotal * 0.15;
  const lastWeekPromoterCommission = lastWeekHubCommission * 0.35;
  
  // Get this week's in-progress orders
  const thisWeek = getWeekRange(new Date());
  const { data: thisWeekOrders } = await supabase
    .from('Messages')
    .select('Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', thisWeek.start.toISOString())
    .lt('Timestamp', thisWeek.end.toISOString());
  
  const thisWeekTotal = (thisWeekOrders || []).reduce(
    (sum, o) => sum + (Number(o.Total_Amount) || 0), 0
  );
  const thisWeekHubCommission = thisWeekTotal * 0.15;
  const thisWeekPromoterCommission = thisWeekHubCommission * 0.35;
  
  // Get per-store totals for this week preview
  const { data: storeOrders } = await supabase
    .from('Messages')
    .select('Store_ID, Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', thisWeek.start.toISOString())
    .lt('Timestamp', thisWeek.end.toISOString());
  
  const storeTotals = {};
  stores.forEach(store => { storeTotals[store.Store_ID] = 0; });
  (storeOrders || []).forEach(order => {
    storeTotals[order.Store_ID] += Number(order.Total_Amount) || 0;
  });
  
  // Sort stores by total orders for preview
  const sortedStores = [...stores].sort((a, b) => 
    (storeTotals[b.Store_ID] || 0) - (storeTotals[a.Store_ID] || 0)
  );
  
  // Build response with correct math
  let response = `👋 *${promoter.promoter_name}*, your earnings:\n\n`;
  
  // Last week
  response += `📆 *LAST WEEK* (${formatDate(lastWeek.start)}-${formatDate(lastWeek.end)})\n`;
  response += `🍳 Total orders: ${formatMoney(lastWeekTotal)}\n`;
  response += `🏪 Hub commission (15%): ${formatMoney(lastWeekHubCommission)}\n`;
  response += `💰 Your 35% of hub commission: ${formatMoney(lastWeekPromoterCommission)} ${lastWeekPromoterCommission > 0 ? '✅' : ''}\n\n`;
  
  // This week
  response += `📆 *THIS WEEK* (${formatDate(thisWeek.start)}-now)\n`;
  response += `🍳 Total orders: ${formatMoney(thisWeekTotal)} so far\n`;
  response += `🏪 Hub commission (15%): ${formatMoney(thisWeekHubCommission)} so far\n`;
  response += `💰 Your 35% of hub commission: ${formatMoney(thisWeekPromoterCommission)} ${thisWeekPromoterCommission > 0 ? '⏳' : ''}\n\n`;
  
  // Store preview
  response += `*Your stores this week:*\n`;
  sortedStores.slice(0, 3).forEach(store => {
    const storeTotal = storeTotals[store.Store_ID] || 0;
    const storeHubCommission = storeTotal * 0.15;
    const storePromoterCommission = storeHubCommission * 0.35;
    response += `🍳 ${store.Name}: ${formatMoney(storeTotal)} total | Your cut: ${formatMoney(storePromoterCommission)}\n`;
  });
  
  if (stores.length > 3) {
    response += `... and ${stores.length - 3} more stores\n`;
  }
  
  response += `\n📋 *Reply:*\n`;
  response += `1️⃣ This week details\n`;
  response += `2️⃣ Last week details\n`;
  response += `3️⃣ All stores\n`;
  response += `4️⃣ This month\n`;
  
  await sendWasenderMessage(phoneNumber, response);
}

// Show this week details - CORRECTED MATH
async function showThisWeek(phoneNumber, promoter, stores, storeIds) {
  const thisWeek = getWeekRange(new Date());
  
  const { data: orders } = await supabase
    .from('Messages')
    .select('Store_ID, Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', thisWeek.start.toISOString())
    .lt('Timestamp', thisWeek.end.toISOString());
  
  const storeTotals = {};
  const storeCounts = {};
  stores.forEach(store => { 
    storeTotals[store.Store_ID] = 0; 
    storeCounts[store.Store_ID] = 0;
  });
  
  (orders || []).forEach(order => {
    storeTotals[order.Store_ID] += Number(order.Total_Amount) || 0;
    storeCounts[order.Store_ID] += 1;
  });
  
  const thisWeekTotal = Object.values(storeTotals).reduce((sum, val) => sum + val, 0);
  const hubCommission = thisWeekTotal * 0.15;
  const promoterCommission = hubCommission * 0.35;
  
  if (thisWeekTotal === 0) {
    await sendWasenderMessage(phoneNumber,
      `📆 *This week* (${formatDate(thisWeek.start)}-now)\n\n` +
      `No orders yet this week.\n\n` +
      `Orders start appearing as they come in.\n\n` +
      `0️⃣ Back to main menu`);
    return;
  }
  
  // Calculate payout date (Monday after week ends)
  const payoutDate = new Date(thisWeek.end);
  payoutDate.setDate(payoutDate.getDate() + 3);
  
  let response = `📆 *This week* (${formatDate(thisWeek.start)}-now) - in progress\n\n`;
  
  stores.forEach(store => {
    const storeTotal = storeTotals[store.Store_ID] || 0;
    const storeHubCommission = storeTotal * 0.15;
    const storePromoterCommission = storeHubCommission * 0.35;
    const count = storeCounts[store.Store_ID] || 0;
    
    if (storeTotal > 0) {
      response += `🍳 *${store.Name}*\n`;
      response += `   Total orders: ${formatMoney(storeTotal)}\n`;
      response += `   Hub commission (15%): ${formatMoney(storeHubCommission)}\n`;
      response += `   Your 35%: ${formatMoney(storePromoterCommission)} (${count} order${count !== 1 ? 's' : ''})\n\n`;
    }
  });
  
  // Show stores with zero orders
  stores.forEach(store => {
    const storeTotal = storeTotals[store.Store_ID] || 0;
    if (storeTotal === 0) {
      response += `🍳 ${store.Name}: No orders yet\n`;
    }
  });
  
  response += `\n💰 *TOTAL ORDERS*: ${formatMoney(thisWeekTotal)}\n`;
  response += `🏪 *HUB COMMISSION (15%)*: ${formatMoney(hubCommission)}\n`;
  response += `💵 *YOUR 35%*: ${formatMoney(promoterCommission)}\n`;
  response += `⏳ Finalizes Saturday after 7pm\n`;
  response += `📅 Payout: Monday ${formatDate(payoutDate)}\n\n`;
  response += `0️⃣ Back to main menu`;
  
  await sendWasenderMessage(phoneNumber, response);
}

// Show last week details - CORRECTED MATH
async function showLastWeek(phoneNumber, promoter, stores, storeIds) {
  const lastWeek = getWeekRange(new Date(Date.now() - 7 * 86400000));
  
  const { data: orders } = await supabase
    .from('Messages')
    .select('Store_ID, Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', lastWeek.start.toISOString())
    .lt('Timestamp', lastWeek.end.toISOString());
  
  const storeTotals = {};
  const storeCounts = {};
  stores.forEach(store => { 
    storeTotals[store.Store_ID] = 0; 
    storeCounts[store.Store_ID] = 0;
  });
  
  (orders || []).forEach(order => {
    storeTotals[order.Store_ID] += Number(order.Total_Amount) || 0;
    storeCounts[order.Store_ID] += 1;
  });
  
  const lastWeekTotal = Object.values(storeTotals).reduce((sum, val) => sum + val, 0);
  const hubCommission = lastWeekTotal * 0.15;
  const promoterCommission = hubCommission * 0.35;
  
  if (lastWeekTotal === 0) {
    await sendWasenderMessage(phoneNumber,
      `📆 *Last week* (${formatDate(lastWeek.start)}-${formatDate(lastWeek.end)})\n\n` +
      `No orders for this period.\n\n` +
      `0️⃣ Back to main menu`);
    return;
  }
  
  // Payout date (Monday after week ended)
  const payoutDate = new Date(lastWeek.end);
  payoutDate.setDate(payoutDate.getDate() + 3);
  
  let response = `📆 *Last week* (${formatDate(lastWeek.start)}-${formatDate(lastWeek.end)}) - COMPLETED\n\n`;
  
  stores.forEach(store => {
    const storeTotal = storeTotals[store.Store_ID] || 0;
    const storeHubCommission = storeTotal * 0.15;
    const storePromoterCommission = storeHubCommission * 0.35;
    const count = storeCounts[store.Store_ID] || 0;
    
    if (storeTotal > 0) {
      response += `🍳 *${store.Name}*\n`;
      response += `   Total orders: ${formatMoney(storeTotal)}\n`;
      response += `   Hub commission (15%): ${formatMoney(storeHubCommission)}\n`;
      response += `   Your 35%: ${formatMoney(storePromoterCommission)} (${count} order${count !== 1 ? 's' : ''})\n\n`;
    }
  });
  
  response += `💰 *TOTAL ORDERS*: ${formatMoney(lastWeekTotal)}\n`;
  response += `🏪 *HUB COMMISSION (15%)*: ${formatMoney(hubCommission)}\n`;
  response += `💵 *YOUR 35%*: ${formatMoney(promoterCommission)}\n`;
  response += `✅ PAID on Monday ${formatDate(payoutDate)}\n\n`;
  response += `0️⃣ Back to main menu`;
  
  await sendWasenderMessage(phoneNumber, response);
}

// Show all stores overview - CORRECTED MATH
async function showAllStores(phoneNumber, promoter, stores, storeIds) {
  const thisWeek = getWeekRange(new Date());
  const lastWeek = getWeekRange(new Date(Date.now() - 7 * 86400000));
  
  const [thisWeekOrders, lastWeekOrders] = await Promise.all([
    supabase.from('Messages').select('Store_ID, Total_Amount').in('Store_ID', storeIds).gte('Timestamp', thisWeek.start.toISOString()).lt('Timestamp', thisWeek.end.toISOString()),
    supabase.from('Messages').select('Store_ID, Total_Amount').in('Store_ID', storeIds).gte('Timestamp', lastWeek.start.toISOString()).lt('Timestamp', lastWeek.end.toISOString())
  ]);
  
  const thisWeekTotals = {};
  const lastWeekTotals = {};
  stores.forEach(store => { 
    thisWeekTotals[store.Store_ID] = 0; 
    lastWeekTotals[store.Store_ID] = 0;
  });
  
  (thisWeekOrders.data || []).forEach(order => {
    thisWeekTotals[order.Store_ID] += Number(order.Total_Amount) || 0;
  });
  
  (lastWeekOrders.data || []).forEach(order => {
    lastWeekTotals[order.Store_ID] += Number(order.Total_Amount) || 0;
  });
  
  let response = `📋 *ALL YOUR STORES*\n\n`;
  
  stores.forEach(store => {
    const thisWeekTotal = thisWeekTotals[store.Store_ID] || 0;
    const thisWeekHubCommission = thisWeekTotal * 0.15;
    const thisWeekPromoterCommission = thisWeekHubCommission * 0.35;
    
    const lastWeekTotal = lastWeekTotals[store.Store_ID] || 0;
    const lastWeekHubCommission = lastWeekTotal * 0.15;
    const lastWeekPromoterCommission = lastWeekHubCommission * 0.35;
    
    response += `🍳 *${store.Name}*\n`;
    response += `   THIS WEEK:\n`;
    response += `   • Total: ${formatMoney(thisWeekTotal)}\n`;
    response += `   • Hub (15%): ${formatMoney(thisWeekHubCommission)}\n`;
    response += `   • Your 35%: ${formatMoney(thisWeekPromoterCommission)}\n`;
    response += `   LAST WEEK:\n`;
    response += `   • Total: ${formatMoney(lastWeekTotal)}\n`;
    response += `   • Hub (15%): ${formatMoney(lastWeekHubCommission)}\n`;
    response += `   • Your 35%: ${formatMoney(lastWeekPromoterCommission)}\n\n`;
  });
  
  response += `0️⃣ Back to main menu`;
  
  await sendWasenderMessage(phoneNumber, response);
}

// Show this month - CORRECTED MATH
async function showThisMonth(phoneNumber, promoter, stores, storeIds) {
  const now = new Date();
  const monthRange = getMonthRange(now);
  
  const { data: orders } = await supabase
    .from('Messages')
    .select('Timestamp, Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', monthRange.start.toISOString())
    .lt('Timestamp', monthRange.end.toISOString());
  
  // Group by week
  const weekTotals = [0, 0, 0, 0, 0];
  const weekStatus = ['', '', '', '', ''];
  
  (orders || []).forEach(order => {
    const orderDate = new Date(order.Timestamp);
    const weekOfMonth = Math.floor((orderDate.getDate() - 1) / 7);
    if (weekOfMonth < 5) {
      weekTotals[weekOfMonth] += Number(order.Total_Amount) || 0;
    }
  });
  
  // Determine which weeks are complete
  const currentWeek = Math.floor((now.getDate() - 1) / 7);
  
  for (let i = 0; i < 5; i++) {
    if (i < currentWeek) {
      weekStatus[i] = '✅';
    } else if (i === currentWeek) {
      weekStatus[i] = '⏳';
    }
  }
  
  const monthTotal = weekTotals.reduce((sum, val) => sum + val, 0);
  const monthHubCommission = monthTotal * 0.15;
  const monthPromoterCommission = monthHubCommission * 0.35;
  
  if (monthTotal === 0) {
    await sendWasenderMessage(phoneNumber,
      `📅 *${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}*\n\n` +
      `No orders recorded for this month.\n\n` +
      `0️⃣ Back to main menu`);
    return;
  }
  
  const monthName = now.toLocaleString('default', { month: 'long' });
  
  let response = `📅 *${monthName} ${now.getFullYear()}*\n\n`;
  
  for (let i = 0; i < 5; i++) {
    if (weekTotals[i] > 0) {
      const weekHubCommission = weekTotals[i] * 0.15;
      const weekPromoterCommission = weekHubCommission * 0.35;
      response += `Week ${i + 1}: ${formatMoney(weekTotals[i])} total | `;
      response += `Hub: ${formatMoney(weekHubCommission)} | `;
      response += `Your cut: ${formatMoney(weekPromoterCommission)} ${weekStatus[i]}\n`;
    }
  }
  
  response += `\n💰 *MONTH TOTAL ORDERS*: ${formatMoney(monthTotal)}\n`;
  response += `🏪 *HUB COMMISSION (15%)*: ${formatMoney(monthHubCommission)}\n`;
  response += `💵 *YOUR 35%*: ${formatMoney(monthPromoterCommission)}\n\n`;
  response += `0️⃣ Back to main menu`;
  
  await sendWasenderMessage(phoneNumber, response);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body);
    console.log('📩 Webhook received');
    
    const message = payload.data?.messages;
    if (!message) {
      return { statusCode: 200, body: 'OK' };
    }
    
    // Ignore messages sent by ME (the bot)
    if (message.key?.fromMe === true) {
      console.log('⏭️ Ignoring own message');
      return { statusCode: 200, body: 'OK' };
    }
    
    const messageKey = message.key;
    const messageText = message.message?.conversation || message.messageBody || '';
    const formattedNumber = extractPhoneNumber(messageKey);
    
    console.log(`📱 From: ${formattedNumber}, Text: "${messageText}"`);

    const command = messageText.toUpperCase().trim();
    
    // Handle numeric commands first (menu navigation)
    if (['0', '1', '2', '3', '4'].includes(command)) {
      // Find promoter first
      const { data: promoter } = await supabase
        .from('promoters')
        .select('*')
        .eq('phone', formattedNumber)
        .maybeSingle();
      
      if (!promoter) {
        return { statusCode: 200, body: 'OK' };
      }
      
      // Get stores
      const { data: stores } = await supabase
        .from('Stores')
        .select('Store_ID, Name')
        .eq('promoter_id', promoter.id);
      
      if (!stores || stores.length === 0) {
        await sendWasenderMessage(formattedNumber,
          `👋 ${promoter.promoter_name}\n\nYou have no stores yet.`);
        return { statusCode: 200, body: 'OK' };
      }
      
      const storeIds = stores.map(s => s.Store_ID);
      
      // Handle menu options
      if (command === '0') {
        await showMainMenu(formattedNumber, promoter);
      } else if (command === '1') {
        await showThisWeek(formattedNumber, promoter, stores, storeIds);
      } else if (command === '2') {
        await showLastWeek(formattedNumber, promoter, stores, storeIds);
      } else if (command === '3') {
        await showAllStores(formattedNumber, promoter, stores, storeIds);
      } else if (command === '4') {
        await showThisMonth(formattedNumber, promoter, stores, storeIds);
      }
    }
    
    // Handle EARNINGS command - show main menu
    else if (command === 'EARNINGS') {
      const { data: promoter } = await supabase
        .from('promoters')
        .select('*')
        .eq('phone', formattedNumber)
        .maybeSingle();
      
      if (!promoter) {
        await sendWasenderMessage(formattedNumber, 
          `❌ You're not registered as a promoter.\n\nPhone: ${formattedNumber}\n\nContact BEIJU to get started.`);
        return { statusCode: 200, body: 'OK' };
      }
      
      await showMainMenu(formattedNumber, promoter);
    }
    
    // Unknown command
    else if (command && command !== '') {
      const { data: promoter } = await supabase
        .from('promoters')
        .select('*')
        .eq('phone', formattedNumber)
        .maybeSingle();
      
      if (promoter) {
        await sendWasenderMessage(formattedNumber,
          `📱 *BEIJU Promoter System*\n\nReply *EARNINGS* to see your earnings.`);
      }
    }
    
    return { statusCode: 200, body: 'OK' };
    
  } catch (error) {
    console.error('Webhook error:', error);
    return { statusCode: 200, body: 'OK' };
  }
};