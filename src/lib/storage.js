const KEYS = {
  settings: 'pavens-trading-settings-v1',
  watchlist: 'pavens-trading-watchlist-v1',
  account: 'pavens-trading-account-v1',
};

export const defaults = {
  settings: { traderName: '', logo: '', market: 'India (NSE/BSE)', currency: 'INR', chartPreference: '1M', refreshSeconds: 60 },
  watchlist: [],
  account: { cash: 0, positions: [], transactions: [] },
};

function safeJson(value, fallback, validator) {
  try {
    const parsed = JSON.parse(localStorage.getItem(value));
    return validator(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

const validSettings = (v) => v && typeof v === 'object' && typeof v.traderName === 'string' && typeof v.currency === 'string';
const validWatchlist = (v) => Array.isArray(v) && v.every((item) => item && typeof item.instrumentKey === 'string' && typeof item.symbol === 'string');
const validAccount = (v) => v && typeof v === 'object' && Number.isFinite(v.cash) && Array.isArray(v.positions) && Array.isArray(v.transactions);

export function loadState() {
  return {
    settings: { ...defaults.settings, ...safeJson(KEYS.settings, defaults.settings, validSettings) },
    watchlist: safeJson(KEYS.watchlist, defaults.watchlist, validWatchlist),
    account: safeJson(KEYS.account, defaults.account, validAccount),
  };
}

export function saveSettings(value) { localStorage.setItem(KEYS.settings, JSON.stringify(value)); }
export function saveWatchlist(value) { localStorage.setItem(KEYS.watchlist, JSON.stringify(value)); }
export function saveAccount(value) { localStorage.setItem(KEYS.account, JSON.stringify(value)); }
