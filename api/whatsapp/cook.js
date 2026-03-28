// api/whatsapp/cook.js
const { supabase, sendWasenderMessage, getWeekRange, formatMoney, formatDate } = require('./utils');

// Get cook's store by phone number
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

async function handleCloseStore(phoneNumber, store) {
  await supabase.from('Stores').update({ Temporarily_Closed: true }).eq('Store_ID', store.Store_ID);
  await sendWasenderMessage(phoneNumber, `👩‍🍳 ${store.Name}, your store is now CLOSED. No new orders will be accepted.`);
}

async function handleOpenStore(phoneNumber, store) {
  await supabase.from('Stores').update({ Temporarily_Closed: false }).eq('Store_ID', store.Store_ID);
  await sendWasenderMessage(phoneNumber, `👩‍🍳 ${store.Name}, your store is now OPEN. Customers can order again!`);
}

async function handleCookCommand(phoneNumber, command, store) {
  if (command === 'CLOSE') {
    await handleCloseStore(phoneNumber, store);
    return true;
  }
  if (command === 'OPEN') {
    await handleOpenStore(phoneNumber, store);
    return true;
  }
  return false;
}

module.exports = {
  getCookStore,
  showCookMainMenu,
  showTodayOrders,
  showThisWeekEarnings,
  showLastWeekEarnings,
  showLastTwoWeeksEarnings,
  showThisMonthEarnings,
  handleCookCommand
};