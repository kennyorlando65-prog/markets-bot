const { Client, LocalAuth } = require('whatsapp-web.js');
const cron = require('node-cron');
const { fetchAllData } = require('./fetchers');
const { formatAllMessages } = require('./formatter');

const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || '';

let waClient = null;
let isReady = false;

function initWhatsApp() {
  const phoneNumber = process.env.WHATSAPP_PHONE_NUMBER;
  if (!phoneNumber) {
    throw new Error('WHATSAPP_PHONE_NUMBER is required. Format: 2348012345678');
  }

  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    },
  });

  waClient.on('qr', async () => {
    try {
      const code = await waClient.requestPairingCode(phoneNumber);
      console.log('\n──────────────────────────────────────');
      console.log('📲 WHATSAPP PAIRING CODE:');
      console.log(`\n   👉  ${code}  👈\n`);
      console.log('1. Open WhatsApp on your phone');
      console.log('2. Tap 3-dot menu → Linked Devices');
      console.log('3. Tap Link a Device');
      console.log('4. Tap "Link with phone number instead"');
      console.log('5. Enter the code above');
      console.log('──────────────────────────────────────\n');
    } catch (err) {
      console.error('Failed to get pairing code:', err.message);
    }
  });

  waClient.on('ready', () => {
    console.log('✅ WhatsApp connected and ready!');
    isReady = true;
  });

  waClient.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp auth failed:', msg);
    isReady = false;
  });

  waClient.on('disconnected', (reason) => {
    console.warn('⚠️  WhatsApp disconnected:', reason);
    isReady = false;
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
  if (process.env.RUN_NOW === 'true') {
    console.log('⚡ RUN_NOW=true — waiting 20s then broadcasting...');
    await new Promise((r) => setTimeout(r, 20000));
    await runBroadcast();
  }
}

boot();
