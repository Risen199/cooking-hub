// api/whatsapp-webhook.js — Vercel version with Cook Dashboard + Promoter Dashboard
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
  const day = date.getDay();
  const start = new Date(date);
  const end = new Date(date);

  if (day >= 6) {
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

const formatMoney = (amount) => `R${Number(amount).toFixed(2)}`;
const formatDate = (date) => date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });

// Extract phone number from WhatsApp LID format
function extractPhoneNumber(messageKey) {
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

// ========== COOK FUNCTIONS ==========
async function getCookStore(phoneNumber) {
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const { data } = await supabase
    .from('Stores')
    .select('Store_ID, Name')
    .eq('WhatsApp', cleanPhone)
    .maybeSingle();
  return data;
}

async function getTodayOrders(storeId) {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('Messages')
    .select('Order_Items, Total_Amount, Pickup_Window, Timestamp')
    .eq('Store_ID', storeId)
    .gte('Timestamp', `${today}T00:00:00`)
    .lt('Timestamp', `${today}T23:59:59`)
    .order('Timestamp', { ascending: true });
  return data || [];
}

async function getEarnings(storeId, startDate, endDate) {
  const { data } = await supabase
    .from('Messages')
    .select('Total_Amount')
    .eq('Store_ID', storeId)
    .gte('Timestamp', startDate)
    .lt('Timestamp', endDate);
  
  const total = (data || []).reduce((sum, o) => sum + Number(o.Total_Amount), 0);
  return { total, cookShare: total * 0.85 };
}

async function getDailyBreakdown(storeId, startDate, endDate) {
  const { data } = await supabase
    .from('Messages')
    .select('Total_Amount, Timestamp')
    .eq('Store_ID', storeId)
    .gte('Timestamp', startDate)
    .lt('Timestamp', endDate);
  
  const daily = {};
  (data || []).forEach(order => {
    const day = new Date(order.Timestamp).toLocaleDateString('en-ZA', { weekday: 'short' });
    daily[day] = (daily[day] || 0) + Number(order.Total_Amount);
  });
  return daily;
}

function formatOrders(orders, storeName) {
  if (orders.length === 0) {
    return `👩‍🍳 ${storeName}, you have no orders today.`;
  }
  
  let total = 0;
  let message = `👩‍🍳 ${storeName}, your orders today:\n\n`;
  
  orders.forEach(order => {
    const time = new Date(order.Timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    message += `🕘 ${time} — ${order.Order_Items}\n`;
    total += Number(order.Total_Amount);
  });
  
  const cookShare = total * 0.85;
  message += `\n💰 Total: ${formatMoney(total)}\n💵 Your 85%: ${formatMoney(cookShare)}`;
  
  return message;
}

async function showCookMainMenu(phoneNumber, store) {
  const todayOrders = await getTodayOrders(store.Store_ID);
  const todayTotal = todayOrders.reduce((sum, o) => sum + Number(o.Total_Amount), 0);
  const todayShare = todayTotal * 0.85;
  
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);
  const weekEarnings = await getEarnings(store.Store_ID, startOfWeek.toISOString(), now.toISOString());
  
  let response = `👩‍🍳 *${store.Name}*, your dashboard:\n\n`;
  response += `📆 Today: ${todayOrders.length} orders | ${formatMoney(todayTotal)} (your 85% = ${formatMoney(todayShare)})\n`;
  response += `💰 This week: ${formatMoney(weekEarnings.total)} (your 85% = ${formatMoney(weekEarnings.cookShare)})\n\n`;
  response += `📋 *Reply with number:*\n`;
  response += `1️⃣ Today's orders (detailed)\n`;
  response += `2️⃣ This week earnings\n`;
  response += `3️⃣ Last week earnings\n`;
  response += `4️⃣ Last 2 weeks\n`;
  response += `5️⃣ This month\n`;
  response += `0️⃣ Help / main menu`;
  
  await sendWasenderMessage(phoneNumber, response);
}

async function showTodayOrders(phoneNumber, store) {
  const orders = await getTodayOrders(store.Store_ID);
  const message = formatOrders(orders, store.Name);
  await sendWasenderMessage(phoneNumber, message + `\n\n0️⃣ Back to main menu`);
}

async function showThisWeekEarnings(phoneNumber, store) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);
  
  const earnings = await getEarnings(store.Store_ID, startOfWeek.toISOString(), now.toISOString());
  const daily = await getDailyBreakdown(store.Store_ID, startOfWeek.toISOString(), now.toISOString());
  
  let response = `📆 *THIS WEEK* (${startOfWeek.toLocaleDateString()} - ${now.toLocaleDateString()})\n\n`;
  response += `💰 Total orders: ${formatMoney(earnings.total)}\n`;
  response += `💵 Your 85%: ${formatMoney(earnings.cookShare)}\n\n`;
  response += `📊 Daily:\n`;
  
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  days.forEach(day => {
    const amount = daily[day] || 0;
    response += `${day}: ${formatMoney(amount)}\n`;
  });
  
  response += `\n0️⃣ Back to main menu`;
  await sendWasenderMessage(phoneNumber, response);
}

async function showLastWeekEarnings(phoneNumber, store) {
  const now = new Date();
  const endOfLastWeek = new Date(now);
  endOfLastWeek.setDate(now.getDate() - now.getDay());
  endOfLastWeek.setHours(0,0,0,0);
  
  const startOfLastWeek = new Date(endOfLastWeek);
  startOfLastWeek.setDate(endOfLastWeek.getDate() - 7);
  
  const earnings = await getEarnings(store.Store_ID, startOfLastWeek.toISOString(), endOfLastWeek.toISOString());
  
  let response = `📆 *LAST WEEK* (${startOfLastWeek.toLocaleDateString()} - ${endOfLastWeek.toLocaleDateString()})\n\n`;
  response += `💰 Total orders: ${formatMoney(earnings.total)}\n`;
  response += `💵 Your 85%: ${formatMoney(earnings.cookShare)}\n\n`;
  response += `0️⃣ Back to main menu`;
  await sendWasenderMessage(phoneNumber, response);
}

async function showLastTwoWeeksEarnings(phoneNumber, store) {
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(now.getDate() - now.getDay());
  endDate.setHours(0,0,0,0);
  
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 14);
  
  const earnings = await getEarnings(store.Store_ID, startDate.toISOString(), endDate.toISOString());
  
  let response = `📆 *LAST 2 WEEKS* (${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()})\n\n`;
  response += `💰 Total orders: ${formatMoney(earnings.total)}\n`;
  response += `💵 Your 85%: ${formatMoney(earnings.cookShare)}\n\n`;
  response += `0️⃣ Back to main menu`;
  await sendWasenderMessage(phoneNumber, response);
}

async function showThisMonthEarnings(phoneNumber, store) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const earnings = await getEarnings(store.Store_ID, startOfMonth.toISOString(), now.toISOString());
  
  let response = `📆 *THIS MONTH* (${startOfMonth.toLocaleDateString()} - ${now.toLocaleDateString()})\n\n`;
  response += `💰 Total orders: ${formatMoney(earnings.total)}\n`;
  response += `💵 Your 85%: ${formatMoney(earnings.cookShare)}\n\n`;
  response += `0️⃣ Back to main menu`;
  await sendWasenderMessage(phoneNumber, response);
}

// ========== PROMOTER FUNCTIONS ==========
async function hasHumanReplied(phoneNumber) {
  try {
    const { data } = await supabase
      .from('wasender_logs')
      .select('id')
      .eq('customer_phone', phoneNumber)
      .eq('message_type', 'human_reply')
      .limit(1);
    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking human replies:', error);
    return false;
  }
}

async function isWithinActiveWindow(phoneNumber) {
  try {
    const { data } = await supabase
      .from('wasender_logs')
      .select('created_at')
      .eq('customer_phone', phoneNumber)
      .order('created_at', { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return false;
    const lastMessageTime = new Date(data[0].created_at);
    const now = new Date();
    return (now - lastMessageTime) / (1000 * 60 * 60) < 8;
  } catch (error) {
    console.error('Error checking active window:', error);
    return false;
  }
}

async function logMessage(phoneNumber, messageText, messageType, status = 'received') {
  try {
    await supabase.from('wasender_logs').insert([{
      customer_phone: phoneNumber,
      message_content: messageText,
      message_type: messageType,
      status: status,
      created_at: new Date().toISOString()
    }]);
  } catch (error) {
    console.error('Error logging message:', error);
  }
}

async function showMainMenu(phoneNumber, promoter) {
  const { data: stores } = await supabase
    .from('Stores')
    .select('Store_ID, Name')
    .eq('promoter_id', promoter.id);

  if (!stores || stores.length === 0) {
    await sendWasenderMessage(phoneNumber, `👋 *${promoter.promoter_name}*\n\nYou have no stores yet. Add some to start earning!`);
    return;
  }

  const storeIds = stores.map(s => s.Store_ID);
  const lastWeek = getWeekRange(new Date(Date.now() - 7 * 86400000));
  const { data: lastWeekOrders } = await supabase
    .from('Messages')
    .select('Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', lastWeek.start.toISOString())
    .lt('Timestamp', lastWeek.end.toISOString());

  const lastWeekTotal = (lastWeekOrders || []).reduce((s, o) => s + (Number(o.Total_Amount) || 0), 0);
  const lastWeekHubCommission = lastWeekTotal * 0.15;
  const lastWeekPromoterCommission = lastWeekHubCommission * 0.35;

  const thisWeek = getWeekRange(new Date());
  const { data: thisWeekOrders } = await supabase
    .from('Messages')
    .select('Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', thisWeek.start.toISOString())
    .lt('Timestamp', thisWeek.end.toISOString());

  const thisWeekTotal = (thisWeekOrders || []).reduce((s, o) => s + (Number(o.Total_Amount) || 0), 0);
  const thisWeekHubCommission = thisWeekTotal * 0.15;
  const thisWeekPromoterCommission = thisWeekHubCommission * 0.35;

  const { data: storeOrders } = await supabase
    .from('Messages')
    .select('Store_ID, Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', thisWeek.start.toISOString())
    .lt('Timestamp', thisWeek.end.toISOString());

  const storeTotals = {};
  stores.forEach(store => { storeTotals[store.Store_ID] = 0; });
  (storeOrders || []).forEach(order => { storeTotals[order.Store_ID] += Number(order.Total_Amount) || 0; });

  const sortedStores = [...stores].sort((a, b) => (storeTotals[b.Store_ID] || 0) - (storeTotals[a.Store_ID] || 0));

  let response = `👋 *${promoter.promoter_name}*, your earnings:\n\n`;
  response += `📆 *LAST WEEK* (${formatDate(lastWeek.start)}-${formatDate(lastWeek.end)})\n`;
  response += `🍳 Total orders: ${formatMoney(lastWeekTotal)}\n`;
  response += `🏪 Hub commission (15%): ${formatMoney(lastWeekHubCommission)}\n`;
  response += `💰 Your 35% of hub commission: ${formatMoney(lastWeekPromoterCommission)} ${lastWeekPromoterCommission > 0 ? '✅' : ''}\n\n`;
  response += `📆 *THIS WEEK* (${formatDate(thisWeek.start)}-now)\n`;
  response += `🍳 Total orders: ${formatMoney(thisWeekTotal)} so far\n`;
  response += `🏪 Hub commission (15%): ${formatMoney(thisWeekHubCommission)} so far\n`;
  response += `💰 Your 35% of hub commission: ${formatMoney(thisWeekPromoterCommission)} ${thisWeekPromoterCommission > 0 ? '⏳' : ''}\n\n`;
  response += `*Your stores this week:*\n`;
  sortedStores.slice(0, 3).forEach(store => {
    const storeTotal = storeTotals[store.Store_ID] || 0;
    const storeHubCommission = storeTotal * 0.15;
    const storePromoterCommission = storeHubCommission * 0.35;
    response += `🍳 ${store.Name}: ${formatMoney(storeTotal)} total | Your cut: ${formatMoney(storePromoterCommission)}\n`;
  });
  if (stores.length > 3) response += `... and ${stores.length - 3} more stores\n`;
  response += `\n📋 *Reply:*\n1️⃣ This week details\n2️⃣ Last week details\n3️⃣ All stores\n4️⃣ This month`;

  await sendWasenderMessage(phoneNumber, response);
}

async function showThisWeekDetails(phoneNumber, promoter, stores, storeIds) {
  const thisWeek = getWeekRange(new Date());
  const { data: orders } = await supabase
    .from('Messages')
    .select('Store_ID, Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', thisWeek.start.toISOString())
    .lt('Timestamp', thisWeek.end.toISOString());

  const storeTotals = {};
  const storeCounts = {};
  stores.forEach(store => { storeTotals[store.Store_ID] = 0; storeCounts[store.Store_ID] = 0; });
  (orders || []).forEach(order => {
    storeTotals[order.Store_ID] += Number(order.Total_Amount) || 0;
    storeCounts[order.Store_ID] += 1;
  });

  const thisWeekTotal = Object.values(storeTotals).reduce((s, v) => s + v, 0);
  const hubCommission = thisWeekTotal * 0.15;
  const promoterCommission = hubCommission * 0.35;

  if (thisWeekTotal === 0) {
    await sendWasenderMessage(phoneNumber, `📆 *This week* (${formatDate(thisWeek.start)}-now)\n\nNo orders yet this week.\n\n0️⃣ Back to main menu`);
    return;
  }

  const payoutDate = new Date(thisWeek.end);
  payoutDate.setDate(payoutDate.getDate() + 3);

  let response = `📆 *This week* (${formatDate(thisWeek.start)}-now) - in progress\n\n`;
  stores.forEach(store => {
    const storeTotal = storeTotals[store.Store_ID] || 0;
    const storeHubCommission = storeTotal * 0.15;
    const storePromoterCommission = storeHubCommission * 0.35;
    const count = storeCounts[store.Store_ID] || 0;
    if (storeTotal > 0) {
      response += `🍳 *${store.Name}*\n   Total orders: ${formatMoney(storeTotal)}\n   Hub commission (15%): ${formatMoney(storeHubCommission)}\n   Your 35%: ${formatMoney(storePromoterCommission)} (${count} order${count !== 1 ? 's' : ''})\n\n`;
    }
  });
  stores.forEach(store => {
    if ((storeTotals[store.Store_ID] || 0) === 0) response += `🍳 ${store.Name}: No orders yet\n`;
  });
  response += `\n💰 *TOTAL ORDERS*: ${formatMoney(thisWeekTotal)}\n🏪 *HUB COMMISSION (15%)*: ${formatMoney(hubCommission)}\n💵 *YOUR 35%*: ${formatMoney(promoterCommission)}\n⏳ Finalizes Saturday after 7pm\n📅 Payout: Monday ${formatDate(payoutDate)}\n\n0️⃣ Back to main menu`;

  await sendWasenderMessage(phoneNumber, response);
}

async function showLastWeekDetails(phoneNumber, promoter, stores, storeIds) {
  const lastWeek = getWeekRange(new Date(Date.now() - 7 * 86400000));
  const { data: orders } = await supabase
    .from('Messages')
    .select('Store_ID, Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', lastWeek.start.toISOString())
    .lt('Timestamp', lastWeek.end.toISOString());

  const storeTotals = {};
  const storeCounts = {};
  stores.forEach(store => { storeTotals[store.Store_ID] = 0; storeCounts[store.Store_ID] = 0; });
  (orders || []).forEach(order => {
    storeTotals[order.Store_ID] += Number(order.Total_Amount) || 0;
    storeCounts[order.Store_ID] += 1;
  });

  const lastWeekTotal = Object.values(storeTotals).reduce((s, v) => s + v, 0);
  const hubCommission = lastWeekTotal * 0.15;
  const promoterCommission = hubCommission * 0.35;

  if (lastWeekTotal === 0) {
    await sendWasenderMessage(phoneNumber, `📆 *Last week* (${formatDate(lastWeek.start)}-${formatDate(lastWeek.end)})\n\nNo orders for this period.\n\n0️⃣ Back to main menu`);
    return;
  }

  const payoutDate = new Date(lastWeek.end);
  payoutDate.setDate(payoutDate.getDate() + 3);

  let response = `📆 *Last week* (${formatDate(lastWeek.start)}-${formatDate(lastWeek.end)}) - COMPLETED\n\n`;
  stores.forEach(store => {
    const storeTotal = storeTotals[store.Store_ID] || 0;
    const storeHubCommission = storeTotal * 0.15;
    const storePromoterCommission = storeHubCommission * 0.35;
    const count = storeCounts[store.Store_ID] || 0;
    if (storeTotal > 0) {
      response += `🍳 *${store.Name}*\n   Total orders: ${formatMoney(storeTotal)}\n   Hub commission (15%): ${formatMoney(storeHubCommission)}\n   Your 35%: ${formatMoney(storePromoterCommission)} (${count} order${count !== 1 ? 's' : ''})\n\n`;
    }
  });
  response += `💰 *TOTAL ORDERS*: ${formatMoney(lastWeekTotal)}\n🏪 *HUB COMMISSION (15%)*: ${formatMoney(hubCommission)}\n💵 *YOUR 35%*: ${formatMoney(promoterCommission)}\n✅ PAID on Monday ${formatDate(payoutDate)}\n\n0️⃣ Back to main menu`;

  await sendWasenderMessage(phoneNumber, response);
}

async function showAllStores(phoneNumber, promoter, stores, storeIds) {
  const thisWeek = getWeekRange(new Date());
  const lastWeek = getWeekRange(new Date(Date.now() - 7 * 86400000));

  const [thisWeekOrders, lastWeekOrders] = await Promise.all([
    supabase.from('Messages').select('Store_ID, Total_Amount').in('Store_ID', storeIds).gte('Timestamp', thisWeek.start.toISOString()).lt('Timestamp', thisWeek.end.toISOString()),
    supabase.from('Messages').select('Store_ID, Total_Amount').in('Store_ID', storeIds).gte('Timestamp', lastWeek.start.toISOString()).lt('Timestamp', lastWeek.end.toISOString())
  ]);

  const thisWeekTotals = {};
  const lastWeekTotals = {};
  stores.forEach(store => { thisWeekTotals[store.Store_ID] = 0; lastWeekTotals[store.Store_ID] = 0; });
  (thisWeekOrders.data || []).forEach(order => { thisWeekTotals[order.Store_ID] += Number(order.Total_Amount) || 0; });
  (lastWeekOrders.data || []).forEach(order => { lastWeekTotals[order.Store_ID] += Number(order.Total_Amount) || 0; });

  let response = `📋 *ALL YOUR STORES*\n\n`;
  stores.forEach(store => {
    const thisWeekTotal = thisWeekTotals[store.Store_ID] || 0;
    const thisWeekHubCommission = thisWeekTotal * 0.15;
    const thisWeekPromoterCommission = thisWeekHubCommission * 0.35;
    const lastWeekTotal = lastWeekTotals[store.Store_ID] || 0;
    const lastWeekHubCommission = lastWeekTotal * 0.15;
    const lastWeekPromoterCommission = lastWeekHubCommission * 0.35;
    response += `🍳 *${store.Name}*\n   THIS WEEK:\n   • Total: ${formatMoney(thisWeekTotal)}\n   • Hub (15%): ${formatMoney(thisWeekHubCommission)}\n   • Your 35%: ${formatMoney(thisWeekPromoterCommission)}\n   LAST WEEK:\n   • Total: ${formatMoney(lastWeekTotal)}\n   • Hub (15%): ${formatMoney(lastWeekHubCommission)}\n   • Your 35%: ${formatMoney(lastWeekPromoterCommission)}\n\n`;
  });
  response += `0️⃣ Back to main menu`;

  await sendWasenderMessage(phoneNumber, response);
}

async function showThisMonthDetails(phoneNumber, promoter, stores, storeIds) {
  const now = new Date();
  const monthRange = getMonthRange(now);
  const { data: orders } = await supabase
    .from('Messages')
    .select('Timestamp, Total_Amount')
    .in('Store_ID', storeIds)
    .gte('Timestamp', monthRange.start.toISOString())
    .lt('Timestamp', monthRange.end.toISOString());

  const weekTotals = [0, 0, 0, 0, 0];
  const weekStatus = ['', '', '', '', ''];
  (orders || []).forEach(order => {
    const orderDate = new Date(order.Timestamp);
    const weekOfMonth = Math.floor((orderDate.getDate() - 1) / 7);
    if (weekOfMonth < 5) weekTotals[weekOfMonth] += Number(order.Total_Amount) || 0;
  });

  const currentWeek = Math.floor((now.getDate() - 1) / 7);
  for (let i = 0; i < 5; i++) {
    if (i < currentWeek) weekStatus[i] = '✅';
    else if (i === currentWeek) weekStatus[i] = '⏳';
  }

  const monthTotal = weekTotals.reduce((s, v) => s + v, 0);
  const monthHubCommission = monthTotal * 0.15;
  const monthPromoterCommission = monthHubCommission * 0.35;

  if (monthTotal === 0) {
    await sendWasenderMessage(phoneNumber, `📅 *${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}*\n\nNo orders recorded for this month.\n\n0️⃣ Back to main menu`);
    return;
  }

  const monthName = now.toLocaleString('default', { month: 'long' });
  let response = `📅 *${monthName} ${now.getFullYear()}*\n\n`;
  for (let i = 0; i < 5; i++) {
    if (weekTotals[i] > 0) {
      const weekHubCommission = weekTotals[i] * 0.15;
      const weekPromoterCommission = weekHubCommission * 0.35;
      response += `Week ${i + 1}: ${formatMoney(weekTotals[i])} total | Hub: ${formatMoney(weekHubCommission)} | Your cut: ${formatMoney(weekPromoterCommission)} ${weekStatus[i]}\n`;
    }
  }
  response += `\n💰 *MONTH TOTAL ORDERS*: ${formatMoney(monthTotal)}\n🏪 *HUB COMMISSION (15%)*: ${formatMoney(monthHubCommission)}\n💵 *YOUR 35%*: ${formatMoney(monthPromoterCommission)}\n\n0️⃣ Back to main menu`;

  await sendWasenderMessage(phoneNumber, response);
}

// ========== VERCEL HANDLER ==========
module.exports = async (req, res) => {
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
    const payload = req.body;
    console.log('📩 Webhook received');

    const message = payload.data?.messages;
    if (!message) {
      return res.status(200).json({ status: 'OK' });
    }

    if (message.key?.fromMe === true) {
      console.log('⏭️ Ignoring own message');
      return res.status(200).json({ status: 'OK' });
    }

    const messageKey = message.key;
    const messageText = message.message?.conversation || message.messageBody || '';
    const formattedNumber = extractPhoneNumber(messageKey);
    console.log(`📱 From: ${formattedNumber}, Text: "${messageText}"`);

    const ADMIN_NUMBER = '+27726515909';
    const isHumanReply = formattedNumber === ADMIN_NUMBER;

    if (isHumanReply) {
      await logMessage(formattedNumber, messageText, 'human_reply', 'received');
      console.log('👤 Human reply recorded');
    } else {
      await logMessage(formattedNumber, messageText, 'incoming');
    }

    const humanReplied = await hasHumanReplied(formattedNumber);
    const withinWindow = await isWithinActiveWindow(formattedNumber);
    const command = messageText.toUpperCase().trim();

    // ========== COOK DASHBOARD ==========
    const cookStore = await getCookStore(formattedNumber);
    
    if (cookStore) {
      console.log(`👩‍🍳 Cook detected: ${cookStore.Name}`);
      
      if (command === 'DASHBOARD' || command === '0') {
        await showCookMainMenu(formattedNumber, cookStore);
      } else if (command === '1') {
        await showTodayOrders(formattedNumber, cookStore);
      } else if (command === '2') {
        await showThisWeekEarnings(formattedNumber, cookStore);
      } else if (command === '3') {
        await showLastWeekEarnings(formattedNumber, cookStore);
      } else if (command === '4') {
        await showLastTwoWeeksEarnings(formattedNumber, cookStore);
      } else if (command === '5') {
        await showThisMonthEarnings(formattedNumber, cookStore);
      } else {
        await sendWasenderMessage(formattedNumber, 
          `👩‍🍳 *${cookStore.Name}*\n\nReply *DASHBOARD* to see your earnings and orders.\n\nCommands:\n1️⃣ Today's orders\n2️⃣ This week\n3️⃣ Last week\n4️⃣ Last 2 weeks\n5️⃣ This month\n0️⃣ Main menu`);
      }
      return res.status(200).json({ status: 'OK' });
    }

    // ========== PROMOTER DASHBOARD ==========
    const { data: promoter } = await supabase
      .from('promoters')
      .select('*')
      .eq('phone', formattedNumber)
      .maybeSingle();

    if (promoter) {
      console.log('✅ Promoter detected');
      
      if (command === 'EARNINGS') {
        await showMainMenu(formattedNumber, promoter);
      } else if (['0', '1', '2', '3', '4'].includes(command)) {
        const { data: stores } = await supabase
          .from('Stores')
          .select('Store_ID, Name')
          .eq('promoter_id', promoter.id);
        if (!stores || stores.length === 0) {
          await sendWasenderMessage(formattedNumber, `👋 ${promoter.promoter_name}\n\nYou have no stores yet.`);
          return res.status(200).json({ status: 'OK' });
        }
        const storeIds = stores.map(s => s.Store_ID);
        if (command === '0') await showMainMenu(formattedNumber, promoter);
        else if (command === '1') await showThisWeekDetails(formattedNumber, promoter, stores, storeIds);
        else if (command === '2') await showLastWeekDetails(formattedNumber, promoter, stores, storeIds);
        else if (command === '3') await showAllStores(formattedNumber, promoter, stores, storeIds);
        else if (command === '4') await showThisMonthDetails(formattedNumber, promoter, stores, storeIds);
      } else {
        const reminderMsg = `📱 *BEIJU Promoter System*\n\nReply *EARNINGS* to see your earnings.`;
        await sendWasenderMessage(formattedNumber, reminderMsg);
        await logMessage(formattedNumber, reminderMsg, 'auto_response', 'sent');
      }
      return res.status(200).json({ status: 'OK' });
    }

    // ========== RANDOM PERSON — RECEPTIONIST MODE ==========
    console.log('👤 Random person - applying receptionist logic');
    const autoReply = `Thank you for contacting BEIJU.\n\nOne of our team will respond within 8 hours. If you don't hear back, just message again and we'll get right to you.\n\nFor support: beiju.enquiries@gmail.com\n\n🇿 Beiju.co.za`;

    if (!humanReplied) {
      console.log('🤖 No human reply yet - auto-replying');
      await sendWasenderMessage(formattedNumber, autoReply);
      await logMessage(formattedNumber, autoReply, 'auto_response', 'sent');
    } else {
      if (!withinWindow) {
        console.log('⏰ 8-hour window expired - auto-replying again');
        await sendWasenderMessage(formattedNumber, autoReply);
        await logMessage(formattedNumber, autoReply, 'auto_response', 'sent');
      } else {
        console.log('🤫 Within 8-hour window - staying silent');
      }
    }

    return res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).json({ status: 'OK' });
  }
};