import { describe, expect, it } from 'vitest';
import {
  demoQuote,
  getIndianMarketStatus,
  mapLiveQuote,
  safeKeyRegex,
} from '../server-core.mjs';

describe('server-core market functions', () => {
  describe('safeKeyRegex validation', () => {
    it('accepts valid NSE and BSE index and equity keys', () => {
      expect(safeKeyRegex.test('NSE_INDEX|Nifty 50')).toBe(true);
      expect(safeKeyRegex.test('NSE_INDEX|Nifty Bank')).toBe(true);
      expect(safeKeyRegex.test('BSE_INDEX|SENSEX')).toBe(true);
      expect(safeKeyRegex.test('NSE_INDEX|India VIX')).toBe(true);
      expect(safeKeyRegex.test('NSE_EQ|INE002A01018')).toBe(true);
      expect(safeKeyRegex.test('BSE_EQ|500325')).toBe(true);
    });

    it('rejects malicious or invalid instrument keys', () => {
      expect(safeKeyRegex.test('INVALID|key')).toBe(false);
      expect(safeKeyRegex.test('NSE_EQ|../../etc/passwd')).toBe(false);
      expect(safeKeyRegex.test('')).toBe(false);
    });
  });

  describe('getIndianMarketStatus', () => {
    it('accurately identifies market closed on weekend', () => {
      // 2025-02-08 is a Saturday
      const saturday = new Date('2025-02-08T10:00:00Z');
      const status = getIndianMarketStatus(saturday);
      expect(status.isOpen).toBe(false);
      expect(status.isWeekend).toBe(true);
      expect(status.session).toBe('CLOSED');
    });

    it('accurately identifies market open during IST weekday trading hours', () => {
      // 2025-02-10 is a Monday. 05:00 UTC = 10:30 AM IST (market open)
      const mondayTradingHours = new Date('2025-02-10T05:00:00Z');
      const status = getIndianMarketStatus(mondayTradingHours);
      expect(status.isOpen).toBe(true);
      expect(status.isWeekend).toBe(false);
      expect(status.session).toBe('OPEN');
    });

    it('accurately identifies market closed after 15:30 IST on a weekday', () => {
      // 2025-02-10 Monday 11:30 UTC = 17:00 IST (5:00 PM IST, market closed)
      const mondayPostMarket = new Date('2025-02-10T11:30:00Z');
      const status = getIndianMarketStatus(mondayPostMarket);
      expect(status.isOpen).toBe(false);
      expect(status.session).toBe('CLOSED');
    });
  });

  describe('mapLiveQuote mapping logic', () => {
    it('maps an Upstox response with colon-separated key format', () => {
      const data = {
        'NSE_INDEX:Nifty 50': {
          last_price: 24850.5,
          prev_close_price: 24700.0,
          net_change: 150.5,
          ohlc: { open: 24720, high: 24890, low: 24690, close: 24850.5, ts: 1719532800000 },
          timestamp: 1719561000000,
        },
      };

      const result = mapLiveQuote('NSE_INDEX|Nifty 50', data, { symbol: 'NIFTY', name: 'NIFTY 50' }, true);
      expect(result).not.toBeNull();
      expect(result.price).toBe(24850.5);
      expect(result.close).toBe(24700.0);
      expect(result.change).toBe(150.5);
      expect(result.status).toBe('LIVE');
    });

    it('labels data DELAYED when market is closed', () => {
      const data = {
        'BSE_INDEX:SENSEX': {
          last_price: 81200.0,
          prev_close_price: 81000.0,
          net_change: 200.0,
        },
      };

      const result = mapLiveQuote('BSE_INDEX|SENSEX', data, { symbol: 'SENSEX', name: 'SENSEX' }, false);
      expect(result).not.toBeNull();
      expect(result.status).toBe('DELAYED');
      expect(result.price).toBe(81200.0);
    });

    it('matches by trading symbol fallback when ISIN key not directly present', () => {
      const data = {
        'NSE_EQ:RELIANCE': {
          last_price: 2950.0,
          prev_close_price: 2900.0,
          net_change: 50.0,
        },
      };

      const result = mapLiveQuote(
        'NSE_EQ|INE002A01018',
        data,
        { symbol: 'RELIANCE', name: 'Reliance Industries' },
        true
      );
      expect(result).not.toBeNull();
      expect(result.price).toBe(2950.0);
      expect(result.symbol).toBe('RELIANCE');
    });

    it('returns null when instrument is missing or has invalid price', () => {
      const data = {
        'NSE_EQ:OTHER': {
          last_price: null,
        },
      };

      const result = mapLiveQuote('NSE_EQ|INE002A01018', data, { symbol: 'RELIANCE' }, true);
      expect(result).toBeNull();
    });
  });

  describe('demoQuote', () => {
    it('formats a demo instrument quote with status DEMO and proper calculation', () => {
      const demo = demoQuote({
        symbol: 'NIFTY',
        name: 'NIFTY 50',
        instrumentKey: 'NSE_INDEX|Nifty 50',
        price: 24800,
        close: 24600,
      });

      expect(demo.status).toBe('DEMO');
      expect(demo.price).toBe(24800);
      expect(demo.close).toBe(24600);
      expect(demo.change).toBe(200);
      expect(demo.changePercent).toBeCloseTo(0.81, 1);
    });
  });
});
