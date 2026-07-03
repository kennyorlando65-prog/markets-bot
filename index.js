const { Client, LocalAuth } = require('whatsapp-web.js');
const cron = require('node-cron');
const { fetchAllData } = require('./fetchers');
const { formatAllMessages } = require('./formatter');

const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || '';
const CHROMIUM_PATH = '/nix/var/nix/profiles/default/bin/chromium';

let waClient = null;
let isReady = false;
let pairingRequested = false;

function initWhatsApp() {
  const phoneNumber = process.env.WHATSAPP_PHONE_NUMBER;
  if (!phoneNumber) {
    throw new Error('WHATSAPP_PHONE_NUMBER is required.');
  }

  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
      ],
    },
  });

  waClient.on('qr', async () => {
    if (pairingRequested) return;
    pairingRequested = true;
    console.log('⏳ WhatsApp ready — requesting pairing code in 15s...');
    await new Promise((r) => setTimeout(r, 15000));
    try {
      const code = await waClient.requestPairingCode(phoneNumber);
      console.log('\n──────────────────────────────────────');
      console.log('📲 WHATSAPP PAIRING CODE:');
      console.log(`\n   👉  ${code}  👈\n`);
      console.log('1. Open WhatsApp → 3-dot menu');
      console.log('2. Linked Devices → Link a Device');
      console.log('3. Link with phone number instead');
      console.log('4. Enter the code above');
      console.log('──────────────────────────────────────\n');
    } catch (err) {
      console.error('Failed to get pairing code:', err.message || JSON.stringify(err));
      pairingRequested = false;
    }
  });

  waClient.on('ready', () => {
    console.log('✅ WhatsApp connected and ready!');
    isReady = true;
    pairingRequested = false;
  });

  waClient.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp auth failed:', msg);
    isReady = false;
  });

  waClient.on('disconnected', (reason) => {
    console.warn('⚠️  WhatsApp disconnected:', reason);
    isReady = false;
    pairingRequested = false;
    setTimeout(() => waClient.initialize(), 5000);
  });

  waClient.initialize();
}

async function getGroupChatId() {
  const chats = await waClient.getChats();
  const group = chats.find(
    (c) => c.isGroup && c.name.toLowerCase().includes(GROUP_NAME.toLowerCase())
  );
  if (!group) throw new Error(`Group "${GROUP_NAME}" not found.`);
  return group.id._serialized;
}

async function sendMessages(messages) {
  if (!isReady) throw new Error('WhatsApp not ready yet.');
  const chatId = await getGroupChatId();
  for (let i = 0; i < messages.length; i++) {
    console.log(`📤 Sending message ${i + 1}/${messages.length}...`);
    await waClient.sendMessage(chatId, messages[i]);
    if (i < messages.length - 1) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.log('✅ All messages sent!');
}

async function runBroadcast() {
  console.log(`\n🚀 Broadcast started at ${new Date().toISOString()}`);
  try {
    console.log('📡 Fetching market data...');
    const data = await fetchAllData();
    console.log('🤖 Formatting messages with Groq...');
    const messages = await formatAllMessages(data);
    console.log('📲 Sending to WhatsApp group...');
    await sendMessages(messages);
  } catch (err) {
    console.error('❌ Broadcast failed:', err.message);
  }
}

function startScheduler() {
  cron.schedule('0 7 * * *', () => {
    console.log('⏰ Cron triggered — running daily broadcast');
    runBroadcast();
  }, { timezone: 'UTC' });
  console.log('📅 Scheduler active — broadcasts daily at 8:00 AM WAT');
}

async function boot() {
  console.log('🤖 Daily Markets WhatsApp Bot starting...');
  console.log(`📍 Group target: "${GROUP_NAME}"`);
  initWhatsApp();
  startScheduler();
}

boot();
