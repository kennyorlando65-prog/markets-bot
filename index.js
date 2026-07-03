const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const cron = require('node-cron');
const pino = require('pino');
const { fetchAllData } = require('./fetchers');
const { formatAllMessages } = require('./formatter');

const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || '';
const PHONE_NUMBER = process.env.WHATSAPP_PHONE_NUMBER || '';

let sock = null;
let isReady = false;
let groupJid = null;

async function findGroup() {
  if (!sock) return null;
  const groups = await sock.groupFetchAllParticipating();
  const found = Object.values(groups).find(
    (g) => g.subject.toLowerCase().includes(GROUP_NAME.toLowerCase())
  );
  if (found) {
    console.log(`✅ Found group: ${found.subject} (${found.id})`);
    groupJid = found.id;
    return found.id;
  }
  console.error(`❌ Group "${GROUP_NAME}" not found`);
  return null;
}

async function sendMessages(messages) {
  if (!isReady || !sock) throw new Error('WhatsApp not ready yet.');
  if (!groupJid) await findGroup();
  if (!groupJid) throw new Error(`Group "${GROUP_NAME}" not found.`);

  for (let i = 0; i < messages.length; i++) {
    console.log(`📤 Sending message ${i + 1}/${messages.length}...`);
    await sock.sendMessage(groupJid, { text: messages[i] });
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

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
  });

  // Request pairing code if not registered
  if (!sock.authState.creds.registered) {
    await new Promise((r) => setTimeout(r, 3000));
    const code = await sock.requestPairingCode(PHONE_NUMBER);
    console.log('\n──────────────────────────────────────');
    console.log('📲 WHATSAPP PAIRING CODE:');
    console.log(`\n   👉  ${code}  👈\n`);
    console.log('1. Open WhatsApp → 3-dot menu');
    console.log('2. Linked Devices → Link a Device');
    console.log('3. Link with phone number instead');
    console.log('4. Enter the code above');
    console.log('──────────────────────────────────────\n');
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('✅ WhatsApp connected and ready!');
      isReady = true;
      await findGroup();
    }

    if (connection === 'close') {
      isReady = false;
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.warn('⚠️  WhatsApp disconnected. Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        setTimeout(connectWhatsApp, 5000);
      }
    }
  });
}

async function boot() {
  console.log('🤖 Daily Markets WhatsApp Bot starting...');
  console.log(`📍 Group target: "${GROUP_NAME}"`);
  await connectWhatsApp();
  startScheduler();
}

boot();
