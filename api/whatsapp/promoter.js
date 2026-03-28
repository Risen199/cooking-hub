// api/whatsapp/promoter.js
const { supabase, sendWasenderMessage, getWeekRange, getMonthRange, formatMoney, formatDate } = require('./utils');

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

module.exports = {
  showMainMenu,
  showThisWeekDetails,
  showLastWeekDetails,
  showAllStores,
  showThisMonthDetails
};