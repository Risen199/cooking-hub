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

// Show main menu - OPTION B (shows total orders + 35% commission)
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
  
  // Get last week's completed earnings
  const lastWeek = getWeekRange(new Date(Date.now() - 7 * 86400000));
  const { data: lastWeekOrders } = await supabase
    .from('Messages')
    .select('Promoter_Commission')
    .in('Store_ID', storeIds)
    .gte('Timestamp', lastWeek.start.toISOString())
    .lt('Timestamp', lastWeek.end.toISOString());
  
  const lastWeekCommission = (lastWeekOrders || []).reduce(
    (sum, o) => sum + (Number(o.Promoter_Commission) || 0), 0
  );
  
  // Calculate last week total orders (before commission)
  const lastWeekTotal = lastWeekCommission * (100/35);
  
  // Get this week's in-progress earnings
  const thisWeek = getWeekRange(new Date());
  const { data: thisWeekOrders } = await supabase
    .from('Messages')
    .select('Store_ID, Promoter_Commission')
    .in('Store_ID', storeIds)
    .gte('Timestamp', thisWeek.start.toISOString())
    .lt('Timestamp', thisWeek.end.toISOString());
  
  const thisWeekCommission = (thisWeekOrders || []).reduce(
    (sum, o) => sum + (Number(o.Promoter_Commission) || 0), 0
  );
  
  // Calculate this week total orders (before commission)
  const thisWeekTotal = thisWeekCommission * (100/35);
  
  // Calculate per-store totals for this week
  const storeTotals = {};
  stores.forEach(store => { storeTotals[store.Store_ID] = 0; });
  (thisWeekOrders || []).forEach(order => {
    storeTotals[order.Store_ID] += Number(order.Promoter_Commission) || 0;
  });
  
  // Sort stores by earnings for preview
  const sortedStores = [...stores].sort((a, b) => 
    (storeTotals[b.Store_ID] || 0) - (storeTotals[a.Store_ID] || 0)
  );
  
  // Build response with Option B format
  let response = `👋 *${promoter.promoter_name}*, your earnings:\n\n`;
  
  // Last week
  response += `📆 *LAST WEEK* (${formatDate(lastWeek.start)}-${formatDate(lastWeek.end)})\n`;
  response += `🍳 Total orders: ${formatMoney(lastWeekTotal)}\n`;
  response += `💰 Your 35%: ${formatMoney(lastWeekCommission)} ${lastWeekCommission > 0 ? '✅' : ''}\n\n`;
  
  // This week
  response += `📆 *THIS WEEK* (${formatDate(thisWeek.start)}-now)\n`;
  response += `🍳 Total orders: ${formatMoney(thisWeekTotal)} so far\n`;
  response += `💰 Your 35%: ${formatMoney(thisWeekCommission)} ${thisWeekCommission > 0 ? '⏳' : ''}\n\n`;
  
  // Store preview
  response += `*Your stores this week:*\n`;
  sortedStores.slice(0, 3).forEach(store => {
    const commission = storeTotals[store.Store_ID] || 0;
    const total = commission * (100/35);
    response += `🍳 ${store.Name}: ${formatMoney(total)} total | Your cut: ${formatMoney(commission)}\n`;
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

// Show this week details
async function showThisWeek(phoneNumber, promoter, stores, storeIds) {
  const thisWeek = getWeekRange(new Date());
  
  const { data: orders } = await supabase
    .from('Messages')
    .select('Store_ID, Promoter_Commission')
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
    storeTotals[order.Store_ID] += Number(order.Promoter_Commission) || 0;
    storeCounts[order.Store_ID] += 1;
  });
  
  const totalCommission = Object.values(storeTotals).reduce((sum, val) => sum + val, 0);
  const totalOrders = totalCommission * (100/35);
  
  if (totalCommission === 0) {
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
    const commission = storeTotals[store.Store_ID] || 0;
    const total = commission * (100/35);
    const count = storeCounts[store.Store_ID] || 0;
    if (commission > 0) {
      response += `🍳 ${store.Name}: ${formatMoney(total)} total | `;
      response += `Your cut: ${formatMoney(commission)} (${count} order${count !== 1 ? 's' : ''})\n`;
    }
  });
  
  // Show stores with zero orders
  stores.forEach(store => {
    const commission = storeTotals[store.Store_ID] || 0;
    if (commission === 0) {
      response += `🍳 ${store.Name}: R0 (0 orders)\n`;
    }
  });
  
  response += `\n💰 *TOTAL ORDERS*: ${formatMoney(totalOrders)}\n`;
  response += `💵 *YOUR 35%*: ${formatMoney(totalCommission)}\n`;
  response += `⏳ Finalizes Saturday after 7pm\n`;
  response += `📅 Payout: Monday ${formatDate(payoutDate)}\n\n`;
  response += `0️⃣ Back to main menu`;
  
  await sendWasenderMessage(phoneNumber, response);
}

// Show last week details
async function showLastWeek(phoneNumber, promoter, stores, storeIds) {
  const lastWeek = getWeekRange(new Date(Date.now() - 7 * 86400000));
  
  const { data: orders } = await supabase
    .from('Messages')
    .select('Store_ID, Promoter_Commission')
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
    storeTotals[order.Store_ID] += Number(order.Promoter_Commission) || 0;
    storeCounts[order.Store_ID] += 1;
  });
  
  const totalCommission = Object.values(storeTotals).reduce((sum, val) => sum + val, 0);
  const totalOrders = totalCommission * (100/35);
  
  if (totalCommission === 0) {
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
    const commission = storeTotals[store.Store_ID] || 0;
    const total = commission * (100/35);
    const count = storeCounts[store.Store_ID] || 0;
    if (commission > 0) {
      response += `🍳 ${store.Name}: ${formatMoney(total)} total | `;
      response += `Your cut: ${formatMoney(commission)} (${count} order${count !== 1 ? 's' : ''})\n`;
    }
  });
  
  response += `\n💰 *TOTAL ORDERS*: ${formatMoney(totalOrders)}\n`;
  response += `💵 *YOUR 35%*: ${formatMoney(totalCommission)}\n`;
  response += `✅ PAID on Monday ${formatDate(payoutDate)}\n\n`;
  response += `0️⃣ Back to main menu`;
  
  await sendWasenderMessage(phoneNumber, response);
}

// Show all stores overview
async function showAllStores(phoneNumber, promoter, stores, storeIds) {
  const thisWeek = getWeekRange(new Date());
  const lastWeek = getWeekRange(new Date(Date.now() - 7 * 86400000));
  
  const [thisWeekOrders, lastWeekOrders] = await Promise.all([
    supabase.from('Messages').select('Store_ID, Promoter_Commission').in('Store_ID', storeIds).gte('Timestamp', thisWeek.start.toISOString()).lt('Timestamp', thisWeek.end.toISOString()),
    supabase.from('Messages').select('Store_ID, Promoter_Commission').in('Store_ID', storeIds).gte('Timestamp', lastWeek.start.toISOString()).lt('Timestamp', lastWeek.end.toISOString())
  ]);
  
  const thisWeekTotals = {};
  const lastWeekTotals = {};
  stores.forEach(store => { 
    thisWeekTotals[store.Store_ID] = 0; 
    lastWeekTotals[store.Store_ID] = 0;
  });
  
  (thisWeekOrders.data || []).forEach(order => {
    thisWeekTotals[order.Store_ID] += Number(order.Promoter_Commission) || 0;
  });
  
  (lastWeekOrders.data || []).forEach(order => {
    lastWeekTotals[order.Store_ID] += Number(order.Promoter_Commission) || 0;
  });
  
  let response = `📋 *ALL YOUR STORES*\n\n`;
  
  stores.forEach(store => {
    const thisWeekCommission = thisWeekTotals[store.Store_ID] || 0;
    const thisWeekTotal = thisWeekCommission * (100/35);
    const lastWeekCommission = lastWeekTotals[store.Store_ID] || 0;
    const lastWeekTotal = lastWeekCommission * (100/35);
    
    response += `🍳 *${store.Name}*\n`;
    response += `   This week: ${formatMoney(thisWeekTotal)} total | Your cut: ${formatMoney(thisWeekCommission)}\n`;
    response += `   Last week: ${formatMoney(lastWeekTotal)} total | Your cut: ${formatMoney(lastWeekCommission)}\n`;
  });
  
  response += `\n0️⃣ Back to main menu`;
  
  await sendWasenderMessage(phoneNumber, response);
}

// Show this month
async function showThisMonth(phoneNumber, promoter, stores, storeIds) {
  const now = new Date();
  const monthRange = getMonthRange(now);
  
  const { data: orders } = await supabase
    .from('Messages')
    .select('Timestamp, Promoter_Commission')
    .in('Store_ID', storeIds)
    .gte('Timestamp', monthRange.start.toISOString())
    .lt('Timestamp', monthRange.end.toISOString());
  
  // Calculate weekly totals
  const weekTotals = [0, 0, 0, 0, 0];
  const weekStatus = ['', '', '', '', ''];
  
  (orders || []).forEach(order => {
    const orderDate = new Date(order.Timestamp);
    const weekOfMonth = Math.floor((orderDate.getDate() - 1) / 7);
    if (weekOfMonth < 5) {
      weekTotals[weekOfMonth] += Number(order.Promoter_Commission) || 0;
    }
  });
  
  // Determine which weeks are complete
  const today = now.getDay();
  const currentWeek = Math.floor((now.getDate() - 1) / 7);
  
  for (let i = 0; i < 5; i++) {
    if (i < currentWeek) {
      weekStatus[i] = '✅';
    } else if (i === currentWeek) {
      weekStatus[i] = '⏳';
    }
  }
  
  const monthCommission = weekTotals.reduce((sum, val) => sum + val, 0);
  const monthTotal = monthCommission * (100/35);
  
  if (monthCommission === 0) {
    await sendWasenderMessage(phoneNumber,
      `📅 *${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}*\n\n` +
      `No orders recorded for this month.\n\n` +
      `0️⃣ Back to main menu`);
    return;
  }
  
  const monthName = now.toLocaleString('default', { month: 'long' });
  
  let response = `📅 *${monthName} ${now.getFullYear()}*\n\n`;
  
  for (let i = 0; i < 5; i++) {
    if (weekTotals[i] > 0 || weekStatus[i]) {
      const weekTotal = weekTotals[i] * (100/35);
      response += `Week ${i + 1}: ${formatMoney(weekTotal)} total | `;
      response += `Your cut: ${formatMoney(weekTotals[i])} ${weekStatus[i]}\n`;
    }
  }
  
  response += `\n💰 *MONTH TOTAL ORDERS*: ${formatMoney(monthTotal)}\n`;
  response += `💵 *YOUR 35%*: ${formatMoney(monthCommission)}\n\n`;
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
    
    // 🔥 FIX: Ignore messages sent by ME (the bot)
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