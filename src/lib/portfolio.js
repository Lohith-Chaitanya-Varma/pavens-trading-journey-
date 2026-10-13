export function calculateAccount(account, quotes = {}) {
  const positionDetails = account.positions.map((position) => {
    const quote = quotes[position.instrumentKey];
    const price = Number.isFinite(quote?.price) ? quote.price : position.lastPrice;
    const marketValue = Number.isFinite(price) ? position.quantity * price : null;
    const unrealized = Number.isFinite(price) ? position.quantity * (price - position.averageEntry) : null;
    return { ...position, currentPrice: price, priceStatus: quote?.status || position.priceStatus || 'UNAVAILABLE', marketValue, unrealized, returnPct: unrealized == null ? null : (unrealized / (position.quantity * position.averageEntry)) * 100 };
  });
  const invested = positionDetails.reduce((sum, item) => sum + item.quantity * item.averageEntry, 0);
  const marketValue = positionDetails.reduce((sum, item) => sum + (item.marketValue || 0), 0);
  const unrealized = positionDetails.reduce((sum, item) => sum + (item.unrealized || 0), 0);
  const realized = account.transactions.reduce((sum, trade) => sum + (Number.isFinite(trade.realizedPnl) ? trade.realizedPnl : 0), 0);
  return { positions: positionDetails, invested, marketValue, unrealized, realized, totalValue: account.cash + marketValue, totalPnl: unrealized + realized };
}

export function validateOrder({ side, quantity, price, account, position }) {
  if (!Number.isInteger(quantity) || quantity <= 0) return 'Quantity must be a whole number greater than zero.';
  if (!Number.isFinite(price) || price <= 0) return 'A valid latest price is required before an order can be simulated.';
  if (side === 'BUY' && quantity * price > account.cash + 0.0001) return 'Insufficient simulated cash. Add funds in Portfolio or Settings first.';
  if (side === 'SELL' && (!position || quantity > position.quantity)) return 'You cannot sell more than the simulated position you hold.';
  return null;
}

export function processOrder(account, order) {
  const { side, instrument, quantity, price } = order;
  const existing = account.positions.find((item) => item.instrumentKey === instrument.instrumentKey);
  const error = validateOrder({ side, quantity, price, account, position: existing });
  if (error) throw new Error(error);
  const now = new Date().toISOString();
  let positions = [...account.positions];
  let cash = account.cash;
  let realizedPnl = null;
  if (side === 'BUY') {
    cash -= quantity * price;
    if (existing) {
      const nextQuantity = existing.quantity + quantity;
      positions = positions.map((item) => item.instrumentKey === instrument.instrumentKey ? { ...item, quantity: nextQuantity, averageEntry: ((item.quantity * item.averageEntry) + (quantity * price)) / nextQuantity, lastPrice: price, priceStatus: instrument.status, lastPriceUpdatedAt: instrument.updatedAt || now } : item);
    } else {
      positions.push({ instrumentKey: instrument.instrumentKey, symbol: instrument.symbol, name: instrument.name, quantity, averageEntry: price, lastPrice: price, priceStatus: instrument.status, openedAt: now, lastPriceUpdatedAt: instrument.updatedAt || now });
    }
  } else {
    cash += quantity * price;
    realizedPnl = quantity * (price - existing.averageEntry);
    if (quantity === existing.quantity) positions = positions.filter((item) => item.instrumentKey !== instrument.instrumentKey);
    else positions = positions.map((item) => item.instrumentKey === instrument.instrumentKey ? { ...item, quantity: item.quantity - quantity, lastPrice: price, priceStatus: instrument.status, lastPriceUpdatedAt: instrument.updatedAt || now } : item);
  }
  const transaction = { id: crypto.randomUUID(), createdAt: now, side, instrumentKey: instrument.instrumentKey, symbol: instrument.symbol, name: instrument.name, quantity, entryPrice: side === 'BUY' ? price : existing.averageEntry, exitPrice: side === 'SELL' ? price : null, price, realizedPnl, status: 'FILLED', dataMode: instrument.status === 'LIVE' ? 'LIVE MARKET DATA' : (instrument.status === 'DELAYED' ? 'DELAYED MARKET DATA' : 'DEMO DATA'), target: order.target || null, stopLoss: order.stopLoss || null };
  return { cash: Number(cash.toFixed(2)), positions, transactions: [transaction, ...account.transactions] };
}

export function addFunds(account, amount) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) throw new Error('Enter a funding amount between ₹1 and ₹1,00,00,000.');
  return { ...account, cash: Number((account.cash + amount).toFixed(2)) };
}
