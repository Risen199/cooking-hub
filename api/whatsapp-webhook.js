// api/whatsapp-webhook.js — Main handler
const { sendWasenderMessage, extractPhoneNumber, hasHumanReplied, isWithinActiveWindow, logMessage } = require('./whatsapp/utils');
const { getCookStore, showCookMainMenu, showTodayOrders, showThisWeekEarnings, showLastWeekEarnings, showLastTwoWeeksEarnings, showThisMonthEarnings, handleCookCommand, handleCookMenu } = require('./whatsapp/cook');
const { showMainMenu, showThisWeekDetails, showLastWeekDetails, showAllStores, showThisMonthDetails } = require('./whatsapp/promoter');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const payload = req.body;
    console.log('📩 Webhook received');

    const message = payload.data?.messages;
    if (!message) return res.status(200).json({ status: 'OK' });

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
      
      // First check for CLOSE/OPEN commands
      const handled = await handleCookCommand(formattedNumber, command, cookStore);
      if (handled) return res.status(200).json({ status: 'OK' });
      
      // Then handle menu navigation (including confirmation responses)
      const menuHandled = await handleCookMenu(formattedNumber, command, cookStore);
      if (menuHandled) return res.status(200).json({ status: 'OK' });
      
      // If nothing handled, show help
      await sendWasenderMessage(formattedNumber, 
        `👩‍🍳 *${cookStore.Name}*\n\nReply DASHBOARD or 0 to see menu\n\nCLOSE - Close store\nOPEN - Open store`);
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