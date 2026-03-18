const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client = null;
let qrDataUrl = null;
let status = 'disconnected'; // disconnected | qr_ready | connecting | ready
let recentMessages = [];
const MAX_MESSAGES = 50;

function getStatus() {
  return { status, qr: qrDataUrl };
}

function getRecentMessages(contact = null, limit = 10) {
  let msgs = recentMessages;
  if (contact) {
    const searchTerm = contact.toLowerCase();
    msgs = msgs.filter(m =>
      m.from.toLowerCase().includes(searchTerm) ||
      (m.contact_name && m.contact_name.toLowerCase().includes(searchTerm))
    );
  }
  return msgs.slice(-limit);
}

async function initWhatsApp(broadcast) {
  if (client) return;

  status = 'connecting';
  broadcast?.({ type: 'whatsapp_status', status });

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './data/.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
    },
  });

  client.on('qr', async (qr) => {
    console.log('WhatsApp QR code generated. Scan with your phone.');
    status = 'qr_ready';
    try {
      qrDataUrl = await qrcode.toDataURL(qr);
      broadcast?.({ type: 'whatsapp_qr', qr: qrDataUrl, status });
    } catch (e) {
      console.error('QR generation error:', e);
    }
  });

  client.on('ready', () => {
    console.log('WhatsApp client ready!');
    status = 'ready';
    qrDataUrl = null;
    broadcast?.({ type: 'whatsapp_status', status });
  });

  client.on('disconnected', () => {
    console.log('WhatsApp disconnected');
    status = 'disconnected';
    client = null;
    broadcast?.({ type: 'whatsapp_status', status });
  });

  client.on('message', async (msg) => {
    if (msg.fromMe) return;
    let contactName = null;
    try {
      const contact = await msg.getContact();
      contactName = contact.pushname || contact.name || null;
    } catch (e) {
      // ignore
    }

    const message = {
      id: msg.id._serialized,
      from: msg.from,
      contact_name: contactName,
      body: msg.body,
      timestamp: msg.timestamp,
      time: new Date(msg.timestamp * 1000).toLocaleString(),
    };

    recentMessages.push(message);
    if (recentMessages.length > MAX_MESSAGES) {
      recentMessages = recentMessages.slice(-MAX_MESSAGES);
    }

    broadcast?.({ type: 'whatsapp_message', message });
  });

  try {
    await client.initialize();
  } catch (err) {
    console.error('WhatsApp init error:', err.message);
    status = 'error';
    client = null;
    broadcast?.({ type: 'whatsapp_status', status: 'error', error: err.message });
  }
}

async function sendMessage(to, message) {
  if (!client || status !== 'ready') {
    return { error: 'WhatsApp is not connected. Please scan the QR code first.' };
  }

  try {
    // Format number: add @c.us if not already formatted
    const chatId = to.includes('@') ? to : `${to.replace(/\D/g, '')}@c.us`;
    await client.sendMessage(chatId, message);
    return { success: true, to, message };
  } catch (err) {
    return { error: `Failed to send message: ${err.message}` };
  }
}

module.exports = {
  initWhatsApp,
  getStatus,
  getRecentMessages,
  sendMessage,
};
