const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.3-70b-versatile';

function groqChat(systemPrompt, userContent, maxTokens = 400) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });

    const req = https.request(
      {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(parsed.error.message));
            resolve(parsed.choices[0].message.content.trim());
          } catch (e) {
            reject(new Error('Groq parse error: ' + e.message));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const SYSTEM = `You format financial market data into WhatsApp messages for a Nigerian business/trading group.

STRICT RULES:
- Use *bold* (single asterisk) for numbers, coin names, key terms
- Use ▸ for bullet points
- No markdown headers, no URLs, no code blocks
- Keep total message under 950 characters
- End with a short one-line takeaway or market mood
- Nigerian audience: mention NGN context where relevant
- Be factual, concise, energetic`;

async function formatCrypto(data, timeStr) {
  if (!data) return `🪙 *CRYPTO UPDATE* — ${timeStr}\n▸ Data unavailable at this time.`;
  const { coins, fng, topGainer, topLoser } = data;
  const raw = `
BTC: $${coins.BTC?.usd?.toLocaleString()} (${coins.BTC?.usd_24h_change?.toFixed(2)}%)
ETH: $${coins.ETH?.usd?.toLocaleString()} (${coins.ETH?.usd_24h_change?.toFixed(2)}%)
BNB: $${coins.BNB?.usd?.toLocaleString()} (${coins.BNB?.usd_24h_change?.toFixed(2)}%)
SOL: $${coins.SOL?.usd?.toLocaleString()} (${coins.SOL?.usd_24h_change?.toFixed(2)}%)
XRP: $${coins.XRP?.usd?.toFixed(4)} (${coins.XRP?.usd_24h_change?.toFixed(2)}%)
Fear & Greed Index: ${fng.value} — ${fng.label}
Top Gainer: ${topGainer.name} +${topGainer.change}%
Top Loser: ${topLoser.name} ${topLoser.change}%
  `.trim();
  return groqChat(SYSTEM, `Format this into a WhatsApp message. Start with exactly: 🪙 *CRYPTO UPDATE* — ${timeStr}\n\nDATA:\n${raw}`);
}

async function formatStocks(data, timeStr) {
  if (!data) return `📈 *STOCK MARKET* — ${timeStr}\n▸ Data unavailable at this time.`;
  const { stocks } = data;
  const raw = stocks.map((s) => `${s.name}: ${s.price} (${s.change !== null ? s.change + '%' : 'N/A'})`).join('\n');
  return groqChat(SYSTEM, `Format this into a WhatsApp message. Start with exactly: 📈 *STOCK MARKET* — ${timeStr}\n\nDATA:\n${raw}`);
}

async function formatForex(data, timeStr) {
  if (!data) return `💱 *FOREX SIGNALS* — ${timeStr}\n▸ Data unavailable at this time.`;
  const raw = `
USD/NGN: ${data.USD_NGN}
EUR/NGN: ${data.EUR_NGN}
GBP/NGN: ${data.GBP_NGN}
EUR/USD: ${data.EUR_USD}
GBP/USD: ${data.GBP_USD}
USD/JPY: ${data.USD_JPY}
Updated: ${data.updated}
  `.trim();
  return groqChat(SYSTEM, `Format this into a WhatsApp message. Start with exactly: 💱 *FOREX SIGNALS* — ${timeStr}\nShow NGN pairs first. Add brief directional bias for EUR/USD and GBP/USD.\n\nDATA:\n${raw}`);
}

async function formatNews(headlines, timeStr) {
  if (!headlines || headlines.length === 0)
    return `📰 *BUSINESS NEWS* — ${timeStr}\n▸ Headlines unavailable at this time.`;
  const raw = headlines.map((h, i) => `${i + 1}. ${h.isAfrica ? '🇳🇬 ' : ''}${h.title} — ${h.summary}`).join('\n');
  return groqChat(SYSTEM, `Format this into a WhatsApp message. Start with exactly: 📰 *BUSINESS NEWS* — ${timeStr}\nFormat as 5 numbered headlines. Flag Nigerian stories with 🇳🇬\n\nHEADLINES:\n${raw}`, 500);
}

async function generateAndFormatIdea(timeStr) {
  const today = new Date().toLocaleDateString('en-NG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const idea = await groqChat(
    `You are a sharp Nigerian business advisor generating a daily business idea for Lagos entrepreneurs.
Generate ONE unique actionable business idea relevant to today. Include:
- The business concept (2-3 sentences)
- Target audience
- Startup cost in NGN
- Revenue model
- Why it is timely right now
Keep it under 250 words. Be exciting and practical.`,
    `Today is ${today}. Generate the daily business idea.`,
    350
  );
  return groqChat(SYSTEM, `Format this business idea into a WhatsApp message. Start with exactly: 🚀 *DAILY BUSINESS IDEA 💡* — ${timeStr}\n\nIDEA:\n${idea}`, 400);
}

async function formatAllMessages({ crypto, forex, news, stocks }) {
  const now = new Date(Date.now() + 60 * 60 * 1000);
  const timeStr = now.toLocaleString('en-NG', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Africa/Lagos',
  }) + ' WAT';

  const [cryptoMsg, stocksMsg, forexMsg, newsMsg, ideaMsg] = await Promise.all([
    formatCrypto(crypto, timeStr),
    formatStocks(stocks, timeStr),
    formatForex(forex, timeStr),
    formatNews(news, timeStr),
    generateAndFormatIdea(timeStr),
  ]);

  return [cryptoMsg, stocksMsg, forexMsg, newsMsg, ideaMsg];
}

module.exports = { formatAllMessages };
