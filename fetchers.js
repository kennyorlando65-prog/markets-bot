const https = require('https');

function fetchJSON(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'MarketsBot/1.0', ...extraHeaders };
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function fetchCryptoData() {
  const cgKey = process.env.COINGECKO_API_KEY || '';
  const cgHeaders = cgKey ? { 'x-cg-demo-api-key': cgKey } : {};

  const [prices, fng, topCoins] = await Promise.all([
    fetchJSON(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,solana,ripple&vs_currencies=usd&include_24hr_change=true',
      cgHeaders
    ),
    fetchJSON('https://api.alternative.me/fng/?limit=1'),
    fetchJSON(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h',
      cgHeaders
    ),
  ]);

  const coins = {
    BTC: prices.bitcoin,
    ETH: prices.ethereum,
    BNB: prices.binancecoin,
    SOL: prices.solana,
    XRP: prices.ripple,
  };

  const fngValue = fng.data[0].value;
  const fngLabel = fng.data[0].value_classification;

  const sorted = [...topCoins].sort(
    (a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0)
  );
  const topGainer = sorted[0];
  const topLoser = sorted[sorted.length - 1];

  return {
    coins,
    fng: { value: fngValue, label: fngLabel },
    topGainer: { name: topGainer.symbol.toUpperCase(), change: topGainer.price_change_percentage_24h?.toFixed(2) },
    topLoser: { name: topLoser.symbol.toUpperCase(), change: topLoser.price_change_percentage_24h?.toFixed(2) },
  };
}

async function fetchForexData() {
  const data = await fetchJSON('https://open.er-api.com/v6/latest/USD');
  const rates = data.rates;
  return {
    USD_NGN: rates.NGN?.toFixed(2),
    EUR_NGN: (rates.NGN / rates.EUR)?.toFixed(2),
    GBP_NGN: (rates.NGN / rates.GBP)?.toFixed(2),
    EUR_USD: (1 / rates.EUR)?.toFixed(4),
    GBP_USD: (1 / rates.GBP)?.toFixed(4),
    USD_JPY: rates.JPY?.toFixed(2),
    updated: data.time_last_update_utc,
  };
}

async function fetchBusinessNews() {
  const apiKey = process.env.GNEWS_API_KEY || '';
  let headlines = [];

  if (apiKey) {
    try {
      const global = await fetchJSON(
        `https://gnews.io/api/v4/search?q=business+market+economy&lang=en&max=3&token=${apiKey}`
      );
      const africa = await fetchJSON(
        `https://gnews.io/api/v4/search?q=Nigeria+Africa+business&lang=en&max=2&token=${apiKey}`
      );
      const globalArticles = (global.articles || []).map((a) => ({
        title: a.title,
        summary: a.description,
        isAfrica: false,
      }));
      const africaArticles = (africa.articles || []).map((a) => ({
        title: a.title,
        summary: a.description,
        isAfrica: true,
      }));
      headlines = [...africaArticles, ...globalArticles].slice(0, 5);
    } catch (e) {
      console.warn('GNews fetch failed, using fallback:', e.message);
    }
  }

  if (headlines.length === 0) {
    headlines = [
      { title: 'Global markets cautious ahead of Fed decision', summary: 'Investors watch interest rate signals', isAfrica: false },
      { title: 'Nigeria forex reserves strengthen this week', summary: 'CBN reports improved dollar inflows', isAfrica: true },
      { title: 'Oil prices hold steady amid OPEC signals', summary: 'Brent crude trades near recent highs', isAfrica: false },
      { title: 'African startup funding hits quarterly high', summary: 'Fintech and agritech lead investment rounds', isAfrica: true },
      { title: 'Tech stocks drive global equity rally', summary: 'AI sector spending boosts major indices', isAfrica: false },
    ];
  }

  return headlines;
}

async function fetchStocksData() {
  const symbols = ['%5EGSPC', '%5EIXIC', '%5EDJI'];
  const names = ['S&P 500', 'NASDAQ', 'Dow Jones'];

  const results = await Promise.allSettled(
    symbols.map((sym) =>
      fetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`)
    )
  );

  const stocks = results.map((r, i) => {
    if (r.status === 'fulfilled') {
      const meta = r.value?.chart?.result?.[0]?.meta;
      if (meta) {
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose || meta.previousClose;
        const change = prev ? (((price - prev) / prev) * 100).toFixed(2) : null;
        return { name: names[i], price: price?.toFixed(2), change };
      }
    }
    return { name: names[i], price: 'N/A', change: null };
  });

  return { stocks };
}

async function fetchAllData() {
  const [crypto, forex, news, stocks] = await Promise.allSettled([
    fetchCryptoData(),
    fetchForexData(),
    fetchBusinessNews(),
    fetchStocksData(),
  ]);

  return {
    crypto: crypto.status === 'fulfilled' ? crypto.value : null,
    forex: forex.status === 'fulfilled' ? forex.value : null,
    news: news.status === 'fulfilled' ? news.value : [],
    stocks: stocks.status === 'fulfilled' ? stocks.value : null,
  };
}

module.exports = { fetchAllData };
