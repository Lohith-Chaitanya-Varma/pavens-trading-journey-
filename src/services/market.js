export function formatErrorMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || 'An unexpected error occurred.';
  if (typeof err === 'object') {
    if (typeof err.message === 'string') return err.message;
    if (typeof err.error === 'string') return err.error;
    if (err.error && typeof err.error === 'object' && typeof err.error.message === 'string') return err.error.message;
    if (Array.isArray(err.errors) && err.errors.length) {
      const first = err.errors[0];
      return typeof first === 'string' ? first : (first?.message || first?.errorCode || 'Provider error');
    }
    if (typeof err.statusText === 'string' && err.statusText) return err.statusText;
    try {
      const json = JSON.stringify(err);
      return json === '{}' ? 'An unexpected error occurred.' : json;
    } catch {
      return 'An unexpected error occurred.';
    }
  }
  return String(err);
}

async function request(path, signal) {
  let response;
  try {
    response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Network error: Unable to connect to the market server.');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = formatErrorMessage(body) || `Server returned HTTP ${response.status}`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.code = body.code || response.status;
    error.details = body;
    throw error;
  }
  return body;
}

export const marketApi = {
  health: (signal) => request('/api/health', signal),
  overview: (signal) => request('/api/market/overview', signal),
  quotes: (keys, signal) => request(`/api/market/quotes?keys=${encodeURIComponent(keys.join(','))}`, signal),
  search: (query, signal) => request(`/api/market/search?query=${encodeURIComponent(query)}`, signal),
  candles: (key, timeframe, signal) => request(`/api/market/candles?key=${encodeURIComponent(key)}&timeframe=${timeframe}`, signal),
};
