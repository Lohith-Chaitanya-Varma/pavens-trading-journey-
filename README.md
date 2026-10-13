# Paven's Trading Journey

A private, desktop-first personal trading terminal designed for **simulated paper trading only** with genuine Indian stock market data integration (NSE & BSE) powered by Upstox.

---

## Features

- **Eight functional views:** Overview, Trade Desk, Markets, Watchlist, Portfolio, Trade History, Achievements, and Settings.
- **Genuine Indian Market Data:** Direct integration with official Upstox APIs for NIFTY 50, NIFTY BANK, SENSEX, India VIX, and NSE/BSE equities.
- **Market Schedule & Data State Awareness:**
  - `LIVE`: Displayed during active Indian trading hours (Mon–Fri 09:15 to 15:30 IST) with real-time ticks.
  - `DELAYED`: Displayed outside active market hours (pre-market, post-market, weekends) showing genuine session closing snapshots.
  - `DEMO`: Explicitly labeled simulated data mode when no provider token is configured. Never confuses demo data with real prices.
  - `UNAVAILABLE`: Clearly surfaced when an instrument or provider request fails, without ever substituting invented prices.
- **Interactive Trade Desk:** Historical candlestick charts with multiple timeframes (`1D`, `1W`, `1M`, `3M`, `1Y`, `ALL`), OHLC tooltips, and dynamic price feeds.
- **Simulated Order Entry:** Paper trading with buy/sell tickets, target and stop-loss inputs, risk/reward calculations, confirmation modal, and portfolio balance ledger.
- **Trading Achievements:** Private, local wall of fame for documenting milestones, risk management streaks, and screenshots stored safely in IndexedDB.
- **Watchlist & Portfolio Analytics:** Searchable stock scanner, real-time unrealized and realized P/L, asset allocation donut chart, and transaction history.
- **Zero Client-Side Secrets:** Upstox API credentials (`UPSTOX_ACCESS_TOKEN`) stay strictly on the server or serverless backend.

---

## Market Data Modes & Provider Architecture

### 1. Provider APIs Targeted
The terminal integrates directly with the official [Upstox API](https://upstox.com/developer/api-documentation/):
- **Full Market Quotes V3:** `GET https://api.upstox.com/v3/market-quote/quotes?instrument_key=...`
  - Retrieves real-time LTP, previous close, net change, OHLC session stats, and timestamps for up to 500 instruments.
  - Handled via `findQuoteInPayload` in `server-core.mjs` supporting colon keys (`NSE_INDEX:Nifty 50`), pipe keys (`NSE_INDEX|Nifty 50`), ISIN keys, and trading symbols.
- **Historical Candle Data V3:** `GET https://api.upstox.com/v3/historical-candle/{instrument_key}/{unit}/{interval}/{to_date}/{from_date}`
  - Fetches true historical OHLC candle data for the chart.
  - Automatically falls back to daily candles if intraday timeframes are not available.
- **Instrument Search V2:** `GET https://api.upstox.com/v2/instruments/search?query=...&records=12`
  - Dynamically searches NSE and BSE equities and indices.

### 2. Rate Limiting & Server-Side Cache
- Standard Upstox rate limits are 50 req/sec, 500 req/min, and 2,000 req/30 min.
- The backend enforces a 30-second in-memory cache (`MARKET_CACHE_MS=30000`) and a minimum 30-second client refresh interval to protect API quotas.
- Network requests use an 8-second timeout (`MARKET_REQUEST_TIMEOUT_MS=8000`) with abort signals.

---

## Running Locally

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the local server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

3. **Run tests and build:**
   ```bash
   npm test
   npm run build
   ```

---

## Live Indian Market Data Setup (Upstox)

1. Create a developer account at [Upstox Developer Apps](https://upstox.com/developer/apps/).
2. Create an App in your dashboard.
3. Generate your personal access token (via OAuth or manual token generator in the dashboard).
4. Create a `.env` file in the project root (copied from `.env.example`):
   ```env
   UPSTOX_ACCESS_TOKEN=your_upstox_access_token_here
   MARKET_CACHE_MS=30000
   MARKET_REQUEST_TIMEOUT_MS=8000
   ```
5. Restart `npm run dev`. The topbar status will immediately switch from `DEMO DATA` to `LIVE FEED` (or `DELAYED FEED` if outside exchange hours).

> [!NOTE]
> **Token Expiry Notice:** Upstox access tokens expire daily at **3:30 AM IST**. For continuous live data, generate a fresh token each trading morning or implement an automated OAuth token renewal service.

---

## Deployment Guide

### Option A: Vercel Deployment (Recommended Serverless Setup)

The repository includes a ready-to-deploy Vercel configuration (`vercel.json`) and serverless API entrypoint (`api/index.js`).

1. **Push your code to a private GitHub repository.**
   *(Ensure `.env` is in `.gitignore` so your access token is never committed).*
2. **Import the repository into Vercel:**
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. **Configure Environment Variables in Vercel:**
   - In your Vercel Project Settings → **Environment Variables**, add:
     - `UPSTOX_ACCESS_TOKEN` = `your_upstox_access_token`
     - `MARKET_CACHE_MS` = `30000` *(optional)*
     - `MARKET_REQUEST_TIMEOUT_MS` = `8000` *(optional)*
4. **Deploy.**
   - Vercel automatically routes `/api/*` to `api/index.js` (Serverless Function).
   - Vercel serves the static frontend from `dist/` with full SPA client-side routing.
   - When you need to renew your token, update `UPSTOX_ACCESS_TOKEN` in Vercel Settings → Environment Variables.

### Option B: Node Server Hosting (Render / Railway / Fly.io / VPS)

For continuous in-memory cache and a long-running Node server:

1. **Build & Start command:**
   ```bash
   npm run build
   npm start
   ```
2. **Environment Variables:**
   Set `UPSTOX_ACCESS_TOKEN` in your platform's dashboard.
3. The server runs `node server.mjs`, serving both `/api/*` routes and the static production `dist/` bundle on `process.env.PORT`.

---

## Important Rules & Guarantees

- **Simulated Trading Only:** No real-money orders are ever placed. No brokerage trade execution endpoints are used.
- **No Fabricated Live Data:** If a live-data request fails or an instrument is not found, the terminal marks it `UNAVAILABLE` rather than showing fake prices as real.
- **Privacy:** Profile data, watchlists, paper portfolio, and achievements are stored strictly in local browser storage (`localStorage` and `IndexedDB`) on your device.
