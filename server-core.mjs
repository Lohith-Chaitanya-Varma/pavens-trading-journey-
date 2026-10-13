import 'dotenv/config';

export const DEMO_INSTRUMENTS = [
  { symbol: 'NIFTY', name: 'NIFTY 50', instrumentKey: 'NSE_INDEX|Nifty 50', price: 24852.15, close: 24730.9 },
  { symbol: 'BANKNIFTY', name: 'NIFTY BANK', instrumentKey: 'NSE_INDEX|Nifty Bank', price: 52410.6, close: 52620.4 },
  { symbol: 'SENSEX', name: 'SENSEX', instrumentKey: 'BSE_INDEX|SENSEX', price: 81342.7, close: 81188.25 },
  { symbol: 'INDIAVIX', name: 'India VIX', instrumentKey: 'NSE_INDEX|India VIX', price: 13.54, close: 13.79 },
  { symbol: 'RELIANCE', name: 'Reliance Industries', instrumentKey: 'NSE_EQ|INE002A01018', price: 2904.3, close: 2881.7 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', instrumentKey: 'NSE_EQ|INE467B01029', price: 3576.5, close: 3601.1 },
  { symbol: 'INFY', name: 'Infosys', instrumentKey: 'NSE_EQ|INE009A01021', price: 1812.65, close: 1784.6 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', instrumentKey: 'NSE_EQ|INE040A01034', price: 1691.4, close: 1704.8 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', instrumentKey: 'NSE_EQ|INE090A01021', price: 1268.2, close: 1252.1 },
  { symbol: 'ITC', name: 'ITC', instrumentKey: 'NSE_EQ|INE154A01025', price: 477.25, close: 470.4 },
  { symbol: 'SBIN', name: 'State Bank of India', instrumentKey: 'NSE_EQ|INE062A01020', price: 812.4, close: 804.8 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', instrumentKey: 'NSE_EQ|INE397D01024', price: 1645.8, close: 1632.1 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', instrumentKey: 'NSE_EQ|INE155A01022', price: 928.6, close: 935.2 },
];

export const INDEX_KEYS = [
  'NSE_INDEX|Nifty 50',
  'NSE_INDEX|Nifty Bank',
  'BSE_INDEX|SENSEX',
  'NSE_INDEX|India VIX',
];

export const safeKeyRegex = /^(NSE_EQ|BSE_EQ|NSE_INDEX|BSE_INDEX)\|[\w .:\-]{1,80}$/i;

const cache = new Map();

export function getCacheConfig() {
  const cacheMs = Math.max(15_000, Number(process.env.MARKET_CACHE_MS || 30_000));
  const timeoutMs = Math.max(2_000, Number(process.env.MARKET_REQUEST_TIMEOUT_MS || 8_000));
  const token = process.env.UPSTOX_ACCESS_TOKEN?.trim() || '';
  return { cacheMs, timeoutMs, token };
}

export function clearServerCache() {
  cache.clear();
}

function cacheKey(name, values) {
  return `${name}:${values.join(',')}`;
}

async function cached(name, values, callback) {
  const { cacheMs } = getCacheConfig();
  const key = cacheKey(name, values);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.createdAt < cacheMs) return hit.value;
  const value = await callback();
  cache.set(key, { createdAt: Date.now(), value });
  return value;
}

/**
 * Determine Indian Market trading session state (IST UTC+5:30).
 * Equity and indices trade Mon-Fri 09:15 to 15:30 IST.
 */
export function getIndianMarketStatus(date = new Date()) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const istDate = new Date(utc + 5.5 * 3600000);
  const day = istDate.getDay(); // 0 is Sunday, 6 is Saturday
  const isWeekend = day === 0 || day === 6;

  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const minutesFromMidnight = hours * 60 + minutes;

  const marketOpen = 9 * 60 + 15; // 09:15
  const marketClose = 15 * 60 + 30; // 15:30

  const isOpen = !isWeekend && minutesFromMidnight >= marketOpen && minutesFromMidnight <= marketClose;

  let sessionLabel = 'Market Open';
  if (isWeekend) {
    sessionLabel = 'Weekend (Market Closed)';
  } else if (minutesFromMidnight < marketOpen) {
    sessionLabel = 'Pre-market (Market Closed)';
  } else if (minutesFromMidnight > marketClose) {
    sessionLabel = 'Post-market (Market Closed)';
  }

  return {
    isOpen,
    isWeekend,
    session: isOpen ? 'OPEN' : 'CLOSED',
    sessionLabel,
    istTime: istDate.toISOString(),
  };
}

async function providerFetch(url) {
  const { timeoutMs, token } = getCacheConfig();
  if (!token) {
    const error = new Error('Upstox access token is not configured on the server.');
    error.status = 401;
    error.code = 'NO_TOKEN';
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorBody = null;
      try {
        errorBody = await response.json();
      } catch {
        // Non-JSON response
      }

      let message = `Upstox API returned HTTP ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        message = 'Upstox access token is expired or unauthorized. Please renew UPSTOX_ACCESS_TOKEN.';
      } else if (response.status === 429) {
        message = 'Upstox rate limit reached. Upstox is throttling requests.';
      } else if (errorBody) {
        if (typeof errorBody.message === 'string') {
          message = errorBody.message;
        } else if (Array.isArray(errorBody.errors) && errorBody.errors.length) {
          const first = errorBody.errors[0];
          message = typeof first === 'string' ? first : (first?.message || first?.errorCode || message);
        } else if (typeof errorBody.error === 'string') {
          message = errorBody.error;
        }
      }

      const error = new Error(message);
      error.status = response.status;
      error.details = errorBody;
      throw error;
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Upstox request timed out after ${timeoutMs}ms.`);
      timeoutError.status = 504;
      timeoutError.code = 'TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function demoQuote(item) {
  if (!item || !Number.isFinite(item.price) || !Number.isFinite(item.close)) {
    return {
      symbol: item?.symbol || 'UNKNOWN',
      name: item?.name || 'Unknown Instrument',
      instrumentKey: item?.instrumentKey || '',
      price: null,
      close: null,
      change: null,
      changePercent: null,
      status: 'UNAVAILABLE',
      updatedAt: null,
    };
  }
  const change = Number((item.price - item.close).toFixed(2));
  const changePercent = Number(((change / item.close) * 100).toFixed(2));
  return {
    symbol: item.symbol,
    name: item.name,
    instrumentKey: item.instrumentKey,
    price: item.price,
    close: item.close,
    change,
    changePercent,
    status: 'DEMO',
    updatedAt: new Date().toISOString(),
  };
}

function findQuoteInPayload(instrumentKey, data, fallback = {}) {
  if (!data || typeof data !== 'object') return null;

  // 1. Direct match: e.g. data["NSE_INDEX|Nifty 50"]
  if (data[instrumentKey]) return data[instrumentKey];

  // 2. Colon match: Upstox typically indexes by "NSE_INDEX:Nifty 50" or "NSE_EQ:INE002A01018"
  const colonKey = instrumentKey.replace('|', ':');
  if (data[colonKey]) return data[colonKey];

  // 3. Pipe match if colon was provided
  const pipeKey = instrumentKey.replace(':', '|');
  if (data[pipeKey]) return data[pipeKey];

  // 4. By trading symbol: e.g. NSE_EQ:RELIANCE
  if (fallback?.symbol) {
    const symbolVariants = [
      `NSE_EQ:${fallback.symbol}`,
      `NSE_EQ|${fallback.symbol}`,
      `BSE_EQ:${fallback.symbol}`,
      `BSE_EQ|${fallback.symbol}`,
      `NSE_INDEX:${fallback.symbol}`,
      `NSE_INDEX|${fallback.symbol}`,
    ];
    for (const v of symbolVariants) {
      if (data[v]) return data[v];
    }
  }

  // 5. Case-insensitive key comparison
  const lowerKey = instrumentKey.toLowerCase();
  const lowerColon = colonKey.toLowerCase();
  for (const [k, v] of Object.entries(data)) {
    const lk = k.toLowerCase();
    if (lk === lowerKey || lk === lowerColon) return v;
  }

  return null;
}

export function mapLiveQuote(instrumentKey, data, fallback = {}, isMarketOpen = false) {
  const quote = findQuoteInPayload(instrumentKey, data, fallback);
  if (!quote || quote.last_price == null || !Number.isFinite(Number(quote.last_price))) {
    return null;
  }

  const price = Number(quote.last_price);
  const close = Number(
    quote.prev_close_price ??
    quote.ohlc?.close ??
    (Number.isFinite(quote.net_change) ? price - Number(quote.net_change) : null)
  );

  const change = Number.isFinite(quote.net_change)
    ? Number(Number(quote.net_change).toFixed(2))
    : (Number.isFinite(close) ? Number((price - close).toFixed(2)) : null);

  const changePercent = Number.isFinite(close) && close !== 0 && change != null
    ? Number(((change / close) * 100).toFixed(2))
    : (Number.isFinite(Number(quote.percentage_change)) ? Number(Number(quote.percentage_change).toFixed(2)) : null);

  // Extract timestamp
  const rawTs = quote.timestamp || quote.ohlc?.ts;
  let quoteDate = null;
  if (rawTs) {
    const numTs = Number(rawTs);
    if (!isNaN(numTs)) {
      quoteDate = new Date(numTs > 1e11 ? numTs : numTs * 1000);
    } else {
      quoteDate = new Date(rawTs);
    }
  }
  if (!quoteDate || isNaN(quoteDate.getTime())) {
    quoteDate = new Date();
  }

  const status = isMarketOpen ? 'LIVE' : 'DELAYED';
  const symbol = fallback.symbol || quote.symbol || quote.trading_symbol || instrumentKey.split('|')[1]?.split(':')[0] || instrumentKey;
  const name = fallback.name || quote.name || quote.short_name || symbol;

  return {
    symbol,
    name,
    instrumentKey,
    price,
    close: Number.isFinite(close) ? close : null,
    change,
    changePercent,
    status,
    updatedAt: quoteDate.toISOString(),
  };
}

export async function getQuotes(keys) {
  const valid = [...new Set(keys)].filter((key) => safeKeyRegex.test(key)).slice(0, 50);
  if (!valid.length) return [];

  const { token } = getCacheConfig();
  if (!token) {
    return valid.map((key) =>
      demoQuote(DEMO_INSTRUMENTS.find((item) => item.instrumentKey === key) || {
        symbol: key.split('|')[1],
        name: key.split('|')[1],
        instrumentKey: key,
        price: null,
        close: null,
      })
    );
  }

  const marketStatus = getIndianMarketStatus();

  return cached('quotes', valid.sort(), async () => {
    // Upstox V3 Full Market Quote endpoint
    const url = `https://api.upstox.com/v3/market-quote/quotes?instrument_key=${encodeURIComponent(valid.join(','))}`;
    const payload = await providerFetch(url);
    const data = payload?.data || {};

    return valid.map((key) => {
      const fallback = DEMO_INSTRUMENTS.find((item) => item.instrumentKey === key);
      const mapped = mapLiveQuote(key, data, fallback, marketStatus.isOpen);
      if (mapped) return mapped;

      // When in live mode and instrument has no provider data, mark explicitly as UNAVAILABLE
      return {
        symbol: fallback?.symbol || key.split('|')[1],
        name: fallback?.name || key.split('|')[1],
        instrumentKey: key,
        price: null,
        close: null,
        change: null,
        changePercent: null,
        status: 'UNAVAILABLE',
        updatedAt: null,
      };
    });
  });
}

function demoCandles(key, timeframe) {
  const base = DEMO_INSTRUMENTS.find((item) => item.instrumentKey === key)?.price || 100;
  const length = { '1D': 28, '1W': 35, '1M': 30, '3M': 42, '1Y': 52, ALL: 60 }[timeframe] || 30;
  const seed = [...key].reduce((acc, char) => acc + char.charCodeAt(0), 0);

  return Array.from({ length }, (_, index) => {
    const drift = (index - length / 2) * (base * 0.0012);
    const wave = Math.sin((index + seed) * 0.77) * base * 0.019 + Math.cos((index + seed) * 0.31) * base * 0.009;
    const open = base + drift + wave;
    const close = open + Math.sin((index + seed) * 1.4) * base * 0.012;
    return {
      time: new Date(Date.now() - (length - index) * 86400000).toISOString(),
      open: Number(open.toFixed(2)),
      close: Number(close.toFixed(2)),
      high: Number((Math.max(open, close) + base * 0.008).toFixed(2)),
      low: Number((Math.min(open, close) - base * 0.008).toFixed(2)),
      volume: Math.round(100000 + ((index * 1307) % 300000)),
      status: 'DEMO',
    };
  });
}

function dateRange(timeframe) {
  const today = new Date();
  const stamp = (date) => date.toISOString().slice(0, 10);

  if (timeframe === '1D') {
    const from = new Date(today.getTime() - 4 * 86400000);
    return { to: stamp(today), from: stamp(from), unit: 'minutes', interval: 15 };
  }
  if (timeframe === '1W') {
    const from = new Date(today.getTime() - 10 * 86400000);
    return { to: stamp(today), from: stamp(from), unit: 'hours', interval: 1 };
  }
  if (timeframe === '1M') {
    const from = new Date(today.getTime() - 35 * 86400000);
    return { to: stamp(today), from: stamp(from), unit: 'days', interval: 1 };
  }
  if (timeframe === '3M') {
    const from = new Date(today.getTime() - 100 * 86400000);
    return { to: stamp(today), from: stamp(from), unit: 'days', interval: 1 };
  }
  if (timeframe === '1Y') {
    const from = new Date(today.getTime() - 370 * 86400000);
    return { to: stamp(today), from: stamp(from), unit: 'weeks', interval: 1 };
  }
  if (timeframe === 'ALL') {
    const from = new Date(today.getTime() - 1825 * 86400000);
    return { to: stamp(today), from: stamp(from), unit: 'months', interval: 1 };
  }

  const from = new Date(today.getTime() - 35 * 86400000);
  return { to: stamp(today), from: stamp(from), unit: 'days', interval: 1 };
}

export async function getCandles(key, timeframe) {
  if (!safeKeyRegex.test(key)) {
    const error = new Error('Unsupported instrument key format');
    error.status = 400;
    throw error;
  }

  const { token } = getCacheConfig();
  if (!token) {
    return {
      candles: demoCandles(key, timeframe),
      status: 'DEMO',
      updatedAt: new Date().toISOString(),
    };
  }

  const marketStatus = getIndianMarketStatus();
  const statusLabel = marketStatus.isOpen ? 'LIVE' : 'DELAYED';
  const range = dateRange(timeframe);

  return cached('candles', [key, timeframe], async () => {
    let rawCandles = [];
    const endpoint = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(key)}/${range.unit}/${range.interval}/${range.to}/${range.from}`;

    try {
      const payload = await providerFetch(endpoint);
      if (Array.isArray(payload?.data?.candles) && payload.data.candles.length > 0) {
        rawCandles = payload.data.candles;
      }
    } catch (err) {
      // If intraday unit failed, try daily fallback
      if (range.unit !== 'days') {
        try {
          const fallbackEndpoint = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(key)}/days/1/${range.to}/${range.from}`;
          const fallbackPayload = await providerFetch(fallbackEndpoint);
          if (Array.isArray(fallbackPayload?.data?.candles)) {
            rawCandles = fallbackPayload.data.candles;
          }
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    }

    const candles = rawCandles.map(([time, open, high, low, close, volume]) => ({
      time,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume || 0),
      status: statusLabel,
    })).reverse();

    return {
      candles,
      status: candles.length ? statusLabel : 'UNAVAILABLE',
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function searchInstruments(query) {
  const cleanQuery = String(query || '').trim();
  if (cleanQuery.length < 2 || cleanQuery.length > 50) {
    const error = new Error('Enter 2–50 characters to search.');
    error.status = 400;
    throw error;
  }

  const { token } = getCacheConfig();
  if (!token) {
    const matches = DEMO_INSTRUMENTS.filter((item) =>
      `${item.symbol} ${item.name}`.toLowerCase().includes(cleanQuery.toLowerCase())
    ).map(demoQuote);
    return { results: matches, mode: 'DEMO' };
  }

  const marketStatus = getIndianMarketStatus();

  return cached('search', [cleanQuery.toUpperCase()], async () => {
    // Check if query matches our standard index keys
    const matchingIndices = DEMO_INSTRUMENTS.filter((item) =>
      item.instrumentKey.includes('INDEX') &&
      `${item.symbol} ${item.name}`.toLowerCase().includes(cleanQuery.toLowerCase())
    );

    const searchUrl = `https://api.upstox.com/v2/instruments/search?query=${encodeURIComponent(cleanQuery)}&exchanges=NSE,BSE&records=12`;
    let instruments = [];

    try {
      const source = await providerFetch(searchUrl);
      instruments = Array.isArray(source?.data) ? source.data.slice(0, 12) : [];
    } catch (err) {
      if (!matchingIndices.length) throw err;
    }

    // Combine matching indices with search results
    const combinedKeys = [
      ...matchingIndices.map((i) => i.instrumentKey),
      ...instruments.map((i) => i.instrument_key),
    ].filter(Boolean);

    const uniqueKeys = [...new Set(combinedKeys)];
    const quotes = await getQuotes(uniqueKeys);
    const quoteMap = new Map(quotes.map((item) => [item.instrumentKey, item]));

    const indexResults = matchingIndices.map((item) => {
      const q = quoteMap.get(item.instrumentKey);
      return {
        symbol: item.symbol,
        name: item.name,
        instrumentKey: item.instrumentKey,
        price: q?.price ?? null,
        close: q?.close ?? null,
        change: q?.change ?? null,
        changePercent: q?.changePercent ?? null,
        status: q?.status ?? (marketStatus.isOpen ? 'LIVE' : 'DELAYED'),
        updatedAt: q?.updatedAt ?? null,
      };
    });

    const stockResults = instruments.map((item) => {
      const q = quoteMap.get(item.instrument_key);
      return {
        symbol: item.trading_symbol || item.short_name || item.name,
        name: item.name || item.short_name || item.trading_symbol,
        instrumentKey: item.instrument_key,
        price: q?.price ?? null,
        close: q?.close ?? null,
        change: q?.change ?? null,
        changePercent: q?.changePercent ?? null,
        status: q?.status ?? (marketStatus.isOpen ? 'LIVE' : 'DELAYED'),
        updatedAt: q?.updatedAt ?? null,
      };
    });

    return {
      results: [...indexResults, ...stockResults],
      mode: marketStatus.isOpen ? 'LIVE' : 'DELAYED',
    };
  });
}

/**
 * Express Route Setup for market endpoints
 */
export function setupMarketRoutes(app) {
  app.get('/api/health', (_req, res) => {
    const { cacheMs, token } = getCacheConfig();
    const marketStatus = getIndianMarketStatus();
    res.json({
      configured: Boolean(token),
      provider: 'Upstox',
      mode: token ? (marketStatus.isOpen ? 'LIVE' : 'DELAYED') : 'DEMO',
      marketStatus,
      cacheMs,
    });
  });

  app.get('/api/market/overview', async (_req, res) => {
    const { token } = getCacheConfig();
    const marketStatus = getIndianMarketStatus();
    try {
      const quotes = await getQuotes(INDEX_KEYS);
      const mode = token ? (marketStatus.isOpen ? 'LIVE' : 'DELAYED') : 'DEMO';
      res.json({
        quotes,
        mode,
        provider: 'Upstox',
        marketStatus,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const status = error.status === 401 ? 401 : (error.status === 429 ? 429 : 503);
      res.status(status).json({
        error: error.message || 'Market data is temporarily unavailable. Please retry later.',
        code: error.code || error.status || 'UNAVAILABLE',
      });
    }
  });

  app.get('/api/market/quotes', async (req, res) => {
    const { token } = getCacheConfig();
    const marketStatus = getIndianMarketStatus();
    const keys = String(req.query.keys || '').split(',').map((k) => k.trim()).filter(Boolean);
    try {
      const quotes = await getQuotes(keys);
      const mode = token ? (marketStatus.isOpen ? 'LIVE' : 'DELAYED') : 'DEMO';
      res.json({
        quotes,
        mode,
        marketStatus,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const status = error.status === 401 ? 401 : (error.status === 429 ? 429 : 503);
      res.status(status).json({
        error: error.message || 'Quotes unavailable.',
        code: error.code || error.status || 'UNAVAILABLE',
      });
    }
  });

  app.get('/api/market/search', async (req, res) => {
    const query = String(req.query.query || '').trim();
    try {
      const result = await searchInstruments(query);
      res.json(result);
    } catch (error) {
      const status = error.status || 503;
      res.status(status).json({
        error: error.message || 'Search is unavailable. Please retry later.',
        code: error.code || error.status || 'UNAVAILABLE',
      });
    }
  });

  app.get('/api/market/candles', async (req, res) => {
    const key = String(req.query.key || '');
    const timeframe = ['1D', '1W', '1M', '3M', '1Y', 'ALL'].includes(req.query.timeframe)
      ? req.query.timeframe
      : '1M';
    try {
      const data = await getCandles(key, timeframe);
      res.json(data);
    } catch (error) {
      const status = error.status === 401 ? 401 : (error.status === 429 ? 429 : 503);
      res.status(status).json({
        error: error.message || 'Chart candle data is unavailable.',
        code: error.code || error.status || 'UNAVAILABLE',
      });
    }
  });
}
