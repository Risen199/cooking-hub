// api/whatsapp/cook.js
const { supabase, sendWasenderMessage, getWeekRange, formatMoney, formatDate } = require('./utils');

// Track user session state (which menu they're in)
const userSessions = {};

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

// Store Settings Menu
async function showStoreSettings(phoneNumber, store) {
  userSessions[phoneNumber] = { state: 'store_settings' };
  const response = `⚙️ *Store Settings* — ${store.Name}\n\n` +
    `Current status: ${store.Temporarily_Closed ? '🔴 CLOSED' : '🟢 OPEN'}\n\n` +
    `1️⃣ Open Store\n` +
    `2️⃣ Close Store\n` +
    `0️⃣ Back to main menu`;
  await sendWasenderMessage(phoneNumber, response);
}

// Ask for confirmation before changing store status
async function askConfirmation(phoneNumber, store, action) {
  userSessions[phoneNumber] = { state: 'confirm_action', action: action };
  const actionText = action === 'open' ? 'OPEN' : 'CLOSE';
  const confirmMsg = `⚠️ Are you sure you want to ${actionText} your store?\n\n` +
    `1️⃣ Yes, confirm\n` +
    `2️⃣ No, cancel\n` +
    `0️⃣ Back`;
  await sendWasenderMessage(phoneNumber, confirmMsg);
}

// Execute the store status change
async function executeStoreAction(phoneNumber, store, action) {
  const isOpen = action === 'open';
  await supabase
    .from('Stores')
    .update({ Temporarily_Closed: !isOpen })
    .eq('Store_ID', store.Store_ID);
  
  const statusMsg = isOpen ? 'OPEN' : 'CLOSED';
  const emoji = isOpen ? '🟢' : '🔴';
  await sendWasenderMessage(phoneNumber, `${emoji} ${store.Name} is now ${statusMSG}.\n\n0️⃣ Back to main menu`);
  
  // Clear session
  delete userSessions[phoneNumber];
}

// Show main menu with option 6
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
  response += `6️⃣ Store Settings\n`;
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

// Handle menu navigation for cooks
async function handleCookMenu(phoneNumber, command, store) {
  const session = userSessions[phoneNumber];
  
  // Handle store settings menu
  if (session?.state === 'store_settings') {
    if (command === '1') {
      await askConfirmation(phoneNumber, store, 'open');
    } else if (command === '2') {
      await askConfirmation(phoneNumber, store, 'close');
    } else if (command === '0') {
      delete userSessions[phoneNumber];
      await showCookMainMenu(phoneNumber, store);
    }
    return true;
  }
  
  // Handle confirmation menu
  if (session?.state === 'confirm_action') {
    if (command === '1') {
      await executeStoreAction(phoneNumber, store, session.action);
    } else if (command === '2') {
      delete userSessions[phoneNumber];
      await showStoreSettings(phoneNumber, store);
    } else if (command === '0') {
      delete userSessions[phoneNumber];
      await showCookMainMenu(phoneNumber, store);
    }
    return true;
  }
  
  // Main menu navigation
  if (command === '0') {
    await showCookMainMenu(phoneNumber, store);
  } else if (command === '1') {
    await showTodayOrders(phoneNumber, store);
  } else if (command === '2') {
    await showThisWeekEarnings(phoneNumber, store);
  } else if (command === '3') {
    await showLastWeekEarnings(phoneNumber, store);
  } else if (command === '4') {
    await showLastTwoWeeksEarnings(phoneNumber, store);
  } else if (command === '5') {
    await showThisMonthEarnings(phoneNumber, store);
  } else if (command === '6') {
    await showStoreSettings(phoneNumber, store);
  } else {
    await sendWasenderMessage(phoneNumber, `Invalid option. Reply with a number from the menu.`);
  }
  return true;
}

// Legacy command handler (CLOSE/OPEN text commands still work)
async function handleCookCommand(phoneNumber, command, store) {
  if (command === 'CLOSE') {
    await askConfirmation(phoneNumber, store, 'close');
    return true;
  }
  if (command === 'OPEN') {
    await askConfirmation(phoneNumber, store, 'open');
    return true;
  }
  return false;
}

module.exports = {
  getCookStore,
  showCookMainMenu,
  handleCookMenu,
  handleCookCommand
};