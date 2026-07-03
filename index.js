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
let codeSent = false;

async function findGroup() {
  if (!sock) return null;
  const groups = await sock.groupFetchAllParticipating();
  const found = Object.values(groups).find(
    (g) => g.subject.toLowerCase().includes(GROUP_NAME.toLowerCase())
  );
  if (found) {
    console.log(`✅ Found group: ${found.subject}`);
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
    const data = await fetchAllData();
    const messages = await formatAllMessages(data);
    await sendMessages(messages);
  } catch (err) {
    console.error('❌ Broadcast failed:', err.message);
  }
}

function startScheduler() {
  cron.schedule('0 7 * * *', () => {
    console.log('⏰ Cron triggered');
    runBroadcast();
  }, { timezone: 'UTC' });
  console.log('📅 Scheduler active — 8:00 AM WAT daily');
}

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
  });

  // Only request pairing code ONCE
  if (!sock.authState.creds.registered && !codeSent) {
    codeSent = true;
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const code = await sock.requestPairingCode(PHONE_NUMBER);
      console.log('\n──────────────────────────────────────');
      console.log('📲 WHATSAPP PAIRING CODE:');
      console.log(`\n   👉  ${code}  👈\n`);
      console.log('Steps:');
      console.log('1. Open WhatsApp → 3-dot menu');
      console.log('2. Linked Devices → Link a Device');
      console.log('3. "Link with phone number instead"');
      console.log('4. Enter the code above');
      console.log('\n⏳ Waiting for you to enter the code...');
      console.log('──────────────────────────────────────\n');
    } catch (err) {
      console.error('❌ Pairing code error:', err.message);
      codeSent = false;
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('✅ WhatsApp connected!');
      isReady = true;
      codeSent = false;
      await findGroup();
    }

    if (connection === 'close') {
      isReady = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.warn('⚠️  Disconnected. Code:', code);
      // Only reconnect if not logged out — don't reconnect during pairing
      if (!loggedOut && isReady) {
        console.log('🔄 Reconnecting in 5s...');
        setTimeout(connectWhatsApp, 5000);
      }
    }
  });
}

async function boot() {
  console.log('🤖 Daily Markets WhatsApp Bot starting...');
  console.log(`📍 Group: "${GROUP_NAME}"`);
  await connectWhatsApp();
  startScheduler();
}

boot();
