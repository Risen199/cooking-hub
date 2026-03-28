// api/whatsapp/utils.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to send WhatsApp messages
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

// Format currency
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

// Check if human has ever replied
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

// Check if conversation within 8-hour window
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

// Log message to wasender_logs
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

module.exports = {
  supabase,
  sendWasenderMessage,
  getWeekRange,
  getMonthRange,
  formatMoney,
  formatDate,
  extractPhoneNumber,
  extractPhoneNumber,
  hasHumanReplied,
  isWithinActiveWindow,
  logMessage
};