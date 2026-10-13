import { describe, expect, it } from 'vitest';
import { addFunds, calculateAccount, processOrder, validateOrder } from './portfolio';

const reliance = { symbol: 'RELIANCE', name: 'Reliance Industries', instrumentKey: 'NSE_EQ|INE002A01018', status: 'DEMO' };

describe('simulated portfolio processing', () => {
  it('rejects a buy which exceeds simulated cash', () => {
    expect(validateOrder({ side: 'BUY', quantity: 2, price: 100, account: { cash: 150, positions: [] } })).toMatch(/Insufficient/);
  });

  it('updates cash and weighted average after simulated buys', () => {
    const funded = addFunds({ cash: 0, positions: [], transactions: [] }, 1_000);
    const first = processOrder(funded, { side: 'BUY', quantity: 2, price: 100, instrument: reliance });
    const second = processOrder(first, { side: 'BUY', quantity: 2, price: 200, instrument: reliance });
    expect(second.cash).toBe(400);
    expect(second.positions[0]).toMatchObject({ quantity: 4, averageEntry: 150 });
    expect(second.transactions).toHaveLength(2);
  });

  it('calculates realized and unrealized P/L consistently after a sale', () => {
    const account = { cash: 600, positions: [{ ...reliance, quantity: 4, averageEntry: 150, lastPrice: 150, priceStatus: 'DEMO' }], transactions: [] };
    const sold = processOrder(account, { side: 'SELL', quantity: 2, price: 175, instrument: reliance });
    const analytics = calculateAccount(sold, { [reliance.instrumentKey]: { price: 180, status: 'DEMO' } });
    expect(sold.cash).toBe(950);
    expect(sold.positions[0].quantity).toBe(2);
    expect(sold.transactions[0].realizedPnl).toBe(50);
    expect(analytics.unrealized).toBe(60);
    expect(analytics.totalPnl).toBe(110);
  });
});
