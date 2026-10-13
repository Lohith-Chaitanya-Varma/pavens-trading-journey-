import { useCallback, useEffect, useMemo, useState } from 'react';
import './achievements.css';
import {
  Activity, ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpRight, Award, Bell, Bookmark, BriefcaseBusiness, Building2,
  Check, CheckCircle2, ChevronDown, CircleAlert, CircleDollarSign, CircleHelp, Flame, History, Image as ImageIcon,
  LayoutDashboard, LineChart as LineIcon, Menu, MoreHorizontal, PanelTop, Pencil, Plus, RefreshCw, Search,
  Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Sparkles, Tag, CalendarDays, Trash2, TrendingDown,
  TrendingUp, Trophy, Upload, UserRound, WalletCards, Wifi, X,
} from 'lucide-react';
import { AllocationChart, CandleChart, MiniSparkline, PortfolioChart, TimeframeTabs } from './components/Charts';
import { loadState, saveAccount, saveSettings, saveWatchlist } from './lib/storage';
import { listAchievements, readAchievementImage, removeAchievement, saveAchievement } from './lib/achievements';
import { addFunds, calculateAccount, processOrder, validateOrder } from './lib/portfolio';
import { formatErrorMessage, marketApi } from './services/market';

const NAV = [
  ['Overview', LayoutDashboard],
  ['Trade Desk', PanelTop],
  ['Markets', LineIcon],
  ['Watchlist', Bookmark],
  ['Portfolio', BriefcaseBusiness],
  ['Trade History', History],
  ['Achievements', Trophy],
  ['Settings', SettingsIcon],
];

const FALLBACK_INSTRUMENT = {
  symbol: 'RELIANCE',
  name: 'Reliance Industries',
  instrumentKey: 'NSE_EQ|INE002A01018',
  price: 2904.3,
  close: 2881.7,
  change: 22.6,
  changePercent: 0.78,
  status: 'DEMO',
  updatedAt: null,
};

function money(value, currency = 'INR', max = 0) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: max,
    minimumFractionDigits: max,
  }).format(value);
}

function number(value, digits = 2) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
    : '—';
}

function signed(value, currency = 'INR') {
  return `${value >= 0 ? '+' : '−'}${money(Math.abs(value || 0), currency, 2)}`;
}

function timestamp(value) {
  if (!value) return 'Not yet updated';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return 'Not yet updated';
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    }).format(d);
  } catch {
    return 'Not yet updated';
  }
}

function shortDate(value) {
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(d);
  } catch {
    return '—';
  }
}

function trend(quote) {
  const base = Math.abs(quote?.changePercent || 0.4);
  return Array.from({ length: 12 }, (_, i) => 7 + Math.sin(i * 0.92 + base) * 1.5 + i * (quote?.change >= 0 ? 0.16 : -0.12));
}

function StatusBadge({ status = 'UNAVAILABLE' }) {
  const s = String(status || 'UNAVAILABLE').toUpperCase();
  return (
    <span className={`data-badge ${s.toLowerCase()}`}>
      <i />
      {s}
    </span>
  );
}

function Direction({ value, percent = false }) {
  const num = Number(value || 0);
  const up = num >= 0;
  return (
    <span className={`direction ${up ? 'up' : 'down'}`}>
      {up ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
      {percent ? `${Math.abs(num).toFixed(2)}%` : signed(num)}
    </span>
  );
}

function EmptyState({ icon: Icon = CircleHelp, title, body, action }) {
  return (
    <div className="empty-state">
      <Icon size={28} />
      <h3>{title}</h3>
      <p>{formatErrorMessage(body)}</p>
      {action}
    </div>
  );
}

function App() {
  const initial = useMemo(loadState, []);
  const [view, setView] = useState('Overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState(initial.settings);
  const [watchlist, setWatchlist] = useState(initial.watchlist);
  const [account, setAccount] = useState(initial.account);
  const [market, setMarket] = useState({ quotes: [], mode: 'DEMO', marketStatus: null, updatedAt: null, error: null, loading: true });
  const [quoteBook, setQuoteBook] = useState({});
  const [activeInstrument, setActiveInstrument] = useState(FALLBACK_INSTRUMENT);
  const [toast, setToast] = useState(null);

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveWatchlist(watchlist), [watchlist]);
  useEffect(() => saveAccount(account), [account]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  const refreshMarket = useCallback(async () => {
    const controller = new AbortController();
    try {
      const overview = await marketApi.overview(controller.signal);
      setMarket({ ...overview, error: null, loading: false });

      const current = Object.fromEntries(overview.quotes.map((quote) => [quote.instrumentKey, quote]));
      const keys = [...new Set([...account.positions.map((item) => item.instrumentKey), ...watchlist.map((item) => item.instrumentKey)])].filter(
        (key) => !current[key]
      );

      if (keys.length) {
        try {
          const extras = await marketApi.quotes(keys, controller.signal);
          extras.quotes.forEach((quote) => {
            current[quote.instrumentKey] = quote;
          });
        } catch {
          // Keep current quotes if extra lookup fails
        }
      }
      setQuoteBook(current);
    } catch (error) {
      setMarket((old) => ({ ...old, loading: false, error: formatErrorMessage(error) }));
    }
    return () => controller.abort();
  }, [account.positions, watchlist]);

  useEffect(() => {
    refreshMarket();
    const interval = setInterval(refreshMarket, Math.max(30, settings.refreshSeconds) * 1000);
    return () => clearInterval(interval);
  }, [refreshMarket, settings.refreshSeconds]);

  const analytics = useMemo(() => calculateAccount(account, quoteBook), [account, quoteBook]);

  const addWatchlist = (item) => {
    if (watchlist.some((saved) => saved.instrumentKey === item.instrumentKey)) {
      return setToast({ type: 'info', text: `${item.symbol} is already in your watchlist.` });
    }
    setWatchlist([...watchlist, { symbol: item.symbol, name: item.name, instrumentKey: item.instrumentKey }]);
    setToast({ type: 'success', text: `${item.symbol} added to your local watchlist.` });
  };

  const removeWatchlist = (key) => setWatchlist(watchlist.filter((item) => item.instrumentKey !== key));

  const selectInstrument = (item) => {
    setActiveInstrument(item);
    setView('Trade Desk');
  };

  const applyOrder = (order) => {
    try {
      setAccount((previous) => processOrder(previous, order));
      setToast({
        type: 'success',
        text: `${order.side === 'BUY' ? 'Bought' : 'Sold'} ${order.quantity} ${order.instrument.symbol} in simulated trading.`,
      });
    } catch (error) {
      setToast({ type: 'error', text: formatErrorMessage(error) });
      throw error;
    }
  };

  const applyFunding = (amount) => {
    try {
      setAccount((previous) => addFunds(previous, amount));
      setToast({ type: 'success', text: 'Simulated cash balance updated.' });
    } catch (error) {
      setToast({ type: 'error', text: formatErrorMessage(error) });
    }
  };

  const shared = {
    settings,
    setSettings,
    watchlist,
    addWatchlist,
    removeWatchlist,
    market,
    quoteBook,
    analytics,
    account,
    activeInstrument,
    setActiveInstrument,
    selectInstrument,
    applyOrder,
    applyFunding,
    setView,
  };

  return (
    <div className="app-shell">
      <Sidebar
        active={view}
        onChange={(next) => {
          setView(next);
          setSidebarOpen(false);
        }}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        settings={settings}
      />
      <main className="main-content">
        <Topbar
          settings={settings}
          market={market}
          setSidebarOpen={setSidebarOpen}
          onRefresh={refreshMarket}
          onSettings={() => setView('Settings')}
        />
        <div className="page-content">
          {view === 'Overview' && <Overview {...shared} />}
          {view === 'Trade Desk' && <TradeDesk {...shared} />}
          {view === 'Markets' && <Markets {...shared} />}
          {view === 'Watchlist' && <Watchlist {...shared} />}
          {view === 'Portfolio' && <Portfolio {...shared} />}
          {view === 'Trade History' && <TradeHistory account={account} currency={settings.currency} />}
          {view === 'Achievements' && <Achievements setToast={setToast} />}
          {view === 'Settings' && <Settings {...shared} />}
        </div>
      </main>
      <MobileNav active={view} onChange={setView} />
      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.type === 'success' ? <Check size={18} /> : <CircleAlert size={18} />} {formatErrorMessage(toast.text)}
        </div>
      )}
    </div>
  );
}

function Sidebar({ active, onChange, open, onClose }) {
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand-mark">P</div>
        <div>
          <b>Paven’s</b>
          <span>Trading Journey</span>
        </div>
        <button className="icon-button close-mobile" onClick={onClose} aria-label="Close navigation">
          <X size={18} />
        </button>
      </div>
      <nav aria-label="Main navigation">
        {NAV.map(([item, Icon]) => (
          <button
            type="button"
            onClick={() => onChange(item)}
            className={active === item ? 'nav-item active' : 'nav-item'}
            key={item}
          >
            <Icon size={18} />
            <span>{item}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="simulation-badge">
          <CircleDollarSign size={15} /> SIMULATED ONLY
        </div>
        <p>Local browser storage</p>
      </div>
    </aside>
  );
}

function MobileNav({ active, onChange }) {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {NAV.slice(0, 5).map(([item, Icon]) => (
        <button
          type="button"
          onClick={() => onChange(item)}
          className={active === item ? 'active' : ''}
          key={item}
        >
          <Icon size={18} />
          <span>{item === 'Trade Desk' ? 'Trade' : item}</span>
        </button>
      ))}
    </nav>
  );
}

function Topbar({ settings, market, setSidebarOpen, onRefresh, onSettings }) {
  const isLive = market.mode === 'LIVE';
  const isDelayed = market.mode === 'DELAYED';
  const isDemo = market.mode === 'DEMO';

  let statusClass = 'demo';
  let statusText = 'DEMO DATA';
  if (isLive) {
    statusClass = 'live';
    statusText = 'LIVE FEED';
  } else if (isDelayed) {
    statusClass = 'delayed';
    statusText = 'DELAYED FEED';
  } else if (market.error) {
    statusClass = 'unavailable';
    statusText = 'FEED ERROR';
  }

  return (
    <header className="topbar">
      <button className="icon-button menu-mobile" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
        <Menu size={20} />
      </button>
      <div className="page-title">
        <span>{settings.market}</span>
        <strong>
          {isLive ? 'Real-Time Market Terminal' : isDelayed ? 'Market Snapshot (Closed/Delayed)' : 'Demo Simulation Terminal'}
        </strong>
      </div>
      <div className="topbar-actions">
        <button type="button" onClick={onRefresh} className="refresh-button" title="Refresh market data">
          <RefreshCw size={15} />
          <span>Refresh</span>
        </button>
        <div
          className={`market-status ${statusClass}`}
          title={
            isLive
              ? 'Real-time feed connected from Upstox (active market hours)'
              : isDelayed
              ? 'Real market data from Upstox (market is currently closed / session snapshot)'
              : 'Simulated quotes (configure UPSTOX_ACCESS_TOKEN for actual Indian market data)'
          }
        >
          <Wifi size={15} />
          <span>{statusText}</span>
        </div>
        <span className="last-updated">
          {market.error
            ? 'Feed unavailable'
            : `${isDelayed ? 'Session Close: ' : 'Updated: '} ${timestamp(market.updatedAt)}`}
        </span>
        <button className="icon-button hide-small" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <button className="profile-button" onClick={onSettings} aria-label="Open settings">
          <img
            src={settings.logo || '/images/paven-profile.jpg'}
            alt="Paven profile"
            style={{ borderRadius: '50%', objectPosition: 'center 35%' }}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = 'https://ui-avatars.com/api/?name=Paven&background=2a2636&color=c6b6ff';
            }}
          />
          <ChevronDown size={14} />
        </button>
      </div>
    </header>
  );
}

function Overview({ settings, setSettings, market, analytics, account, selectInstrument, setView }) {
  const series = performanceSeries(account, analytics.totalValue);
  const currency = settings.currency;

  return (
    <>
      <PageIntro
        eyebrow="PERSONAL TRADING TERMINAL"
        title={`Good ${greeting()}, ${settings.traderName || 'Trader'}.`}
        description="Your private, simulated trading workspace. Market cards are clearly marked by their data source."
        action={
          <button className="primary-button" onClick={() => setView('Trade Desk')}>
            <PanelTop size={17} />
            Open trade desk
          </button>
        }
      />
      <div className="metric-grid">
        <Metric
          icon={WalletCards}
          label="Portfolio value"
          value={analytics.totalValue ? money(analytics.totalValue, currency) : '—'}
          note={analytics.totalValue ? 'Simulated account value' : 'No simulated account data'}
        />
        <Metric
          icon={TrendingUp}
          label="Total P/L"
          value={analytics.positions.length ? signed(analytics.totalPnl, currency) : '—'}
          trend={analytics.totalPnl}
          note="Realized + unrealized"
        />
        <Metric
          icon={CircleDollarSign}
          label="Available cash"
          value={account.cash ? money(account.cash, currency) : '—'}
          note="Configured simulated cash"
        />
        <Metric
          icon={BriefcaseBusiness}
          label="Open positions"
          value={String(analytics.positions.length)}
          note={analytics.positions.length ? `${money(analytics.invested, currency)} invested` : 'No open positions'}
        />
      </div>
      <div className="overview-grid">
        <PortfolioChart
          values={series}
          timeframe={settings.chartPreference}
          onTimeframe={(chartPreference) => setSettings({ ...settings, chartPreference })}
        />
        <section className="market-summary-panel">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">MARKET PULSE</p>
              <h2>Indian indices</h2>
            </div>
            <button className="text-button" onClick={() => setView('Markets')}>
              View all <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="index-list">
            {market.loading ? (
              <div className="loading-line">Fetching latest Indian market data…</div>
            ) : (
              market.quotes.map((quote) => (
                <button className="index-row" key={quote.instrumentKey} onClick={() => selectInstrument(quote)}>
                  <div>
                    <b>{quote.symbol === 'BANKNIFTY' ? 'NIFTY BANK' : quote.name}</b>
                    <span>
                      <StatusBadge status={quote.status} />
                    </span>
                  </div>
                  <MiniSparkline points={trend(quote)} positive={quote.change >= 0} />
                  <div className="index-value">
                    <b>{number(quote.price)}</b>
                    <Direction value={quote.changePercent} percent />
                  </div>
                </button>
              ))
            )}
          </div>
          {market.error && (
            <div className="inline-error">
              <CircleAlert size={15} />
              {formatErrorMessage(market.error)}
            </div>
          )}
        </section>
      </div>
      <section className="panel positions-preview">
        <div className="panel-head compact">
          <div>
            <p className="eyebrow">OPEN POSITIONS</p>
            <h2>Active simulated positions</h2>
          </div>
          <button className="text-button" onClick={() => setView('Portfolio')}>
            Portfolio <ArrowUpRight size={15} />
          </button>
        </div>
        <PositionsTable positions={analytics.positions.slice(0, 5)} currency={currency} onSelect={selectInstrument} />
        {!analytics.positions.length && (
          <EmptyState
            icon={BriefcaseBusiness}
            title="Your simulated portfolio is empty"
            body="Add a simulated cash balance, then use the Trade Desk to create your first paper position."
            action={
              <button className="secondary-button" onClick={() => setView('Portfolio')}>
                Fund simulated account
              </button>
            }
          />
        )}
      </section>
    </>
  );
}

function PageIntro({ eyebrow, title, description, action }) {
  return (
    <div className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Metric({ icon: Icon, label, value, note, trend: tr }) {
  return (
    <section className="metric-card">
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={Number.isFinite(tr) ? (tr >= 0 ? 'positive-text' : 'negative-text') : ''}>
        {Number.isFinite(tr) ? (
          <>
            {tr >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {note}
          </>
        ) : (
          note
        )}
      </small>
    </section>
  );
}

function TradeDesk({ activeInstrument, setActiveInstrument, watchlist, addWatchlist, applyOrder, settings, account }) {
  const [timeframe, setTimeframe] = useState('1M');
  const [candles, setCandles] = useState({ loading: true, data: [], status: 'DEMO', error: null });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setCandles((old) => ({ ...old, loading: true }));
    marketApi
      .candles(activeInstrument.instrumentKey, timeframe, controller.signal)
      .then((response) => {
        if (active) {
          setCandles({
            loading: false,
            data: response.candles,
            status: response.status,
            error: null,
          });
        }
      })
      .catch((error) => {
        if (active) {
          setCandles({
            loading: false,
            data: [],
            status: 'UNAVAILABLE',
            error: formatErrorMessage(error),
          });
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeInstrument.instrumentKey, timeframe]);

  const watched = watchlist.some((item) => item.instrumentKey === activeInstrument.instrumentKey);

  return (
    <>
      <PageIntro
        eyebrow="SIMULATED TRADING ONLY"
        title="Trade desk"
        description="Orders update your local simulated account only. No broker order can be placed from this app."
      />
      <div className="trade-layout">
        <section className="chart-panel trade-chart">
          <div className="trade-heading">
            <InstrumentFinder compact onPick={setActiveInstrument} />
            <button
              className={watched ? 'watch-button active' : 'watch-button'}
              onClick={() => !watched && addWatchlist(activeInstrument)}
              disabled={watched}
            >
              <Bookmark size={16} />
              {watched ? 'Watching' : 'Watch'}
            </button>
          </div>
          <div className="instrument-quote">
            <div>
              <span>{activeInstrument.name}</span>
              <h2>{money(activeInstrument.price, settings.currency, 2)}</h2>
            </div>
            <div>
              <Direction value={activeInstrument.change} />
              <Direction value={activeInstrument.changePercent} percent />
              <StatusBadge status={activeInstrument.status} />
            </div>
          </div>
          <div className="chart-tools">
            <TimeframeTabs value={timeframe} onChange={setTimeframe} />
            <span className="subtle">{candles.error ? formatErrorMessage(candles.error) : `${candles.status} CANDLE DATA`}</span>
          </div>
          {candles.loading ? (
            <div className="chart-empty">Loading chart data…</div>
          ) : (
            <CandleChart candles={candles.data} status={candles.status} />
          )}
        </section>
        <OrderTicket instrument={activeInstrument} currency={settings.currency} account={account} onSubmit={applyOrder} />
      </div>
    </>
  );
}

function OrderTicket({ instrument, currency, account, onSubmit }) {
  const [side, setSide] = useState('BUY');
  const [quantity, setQuantity] = useState('1');
  const [target, setTarget] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError('');
    setReviewing(false);
  }, [instrument.instrumentKey]);

  const qty = Number(quantity);
  const price = instrument.price;
  const total = qty * price;
  const targetValue = Number(target);
  const stopValue = Number(stopLoss);
  const reward = side === 'BUY' ? targetValue - price : price - targetValue;
  const risk = side === 'BUY' ? price - stopValue : stopValue - price;
  const ratio = target && stopLoss && risk > 0 && reward > 0 ? reward / risk : null;

  const startReview = () => {
    const existing = account.positions.find((item) => item.instrumentKey === instrument.instrumentKey);
    const basic = validateOrder({ side, quantity: qty, price, account, position: existing });
    if (basic) return setError(basic);
    if (target && !Number.isFinite(targetValue)) return setError('Enter a valid target price.');
    if (stopLoss && !Number.isFinite(stopValue)) return setError('Enter a valid stop-loss price.');
    setError('');
    setReviewing(true);
  };

  const confirm = () => {
    setBusy(true);
    try {
      onSubmit({ side, quantity: qty, price, instrument, target: targetValue || null, stopLoss: stopValue || null });
      setReviewing(false);
      setQuantity('1');
    } catch (caught) {
      setError(formatErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="order-ticket">
      <div className="ticket-head">
        <div>
          <p className="eyebrow">ORDER ENTRY</p>
          <h2>Simulated order</h2>
        </div>
        <span className="sim-label">PAPER</span>
      </div>
      <div className="side-switch">
        <button className={side === 'BUY' ? 'buy selected' : 'buy'} onClick={() => setSide('BUY')}>
          Buy
        </button>
        <button className={side === 'SELL' ? 'sell selected' : 'sell'} onClick={() => setSide('SELL')}>
          Sell
        </button>
      </div>
      <label>
        Instrument{' '}
        <div className="readonly-field">
          <b>{instrument.symbol}</b>
          <span>{instrument.status}</span>
        </div>
      </label>
      <label>
        Latest available price{' '}
        <div className="readonly-field">
          <b>{money(price, currency, 2)}</b>
          <span>{instrument.status}</span>
        </div>
      </label>
      <label>
        Quantity
        <input
          value={quantity}
          inputMode="numeric"
          type="number"
          min="1"
          step="1"
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      <div className="order-total">
        <span>Estimated order value</span>
        <b>{money(total, currency, 2)}</b>
      </div>
      <div className="optional-prices">
        <label>
          Target price{' '}
          <input
            value={target}
            inputMode="decimal"
            type="number"
            min="0"
            placeholder="Optional"
            onChange={(event) => setTarget(event.target.value)}
          />
        </label>
        <label>
          Stop-loss{' '}
          <input
            value={stopLoss}
            inputMode="decimal"
            type="number"
            min="0"
            placeholder="Optional"
            onChange={(event) => setStopLoss(event.target.value)}
          />
        </label>
      </div>
      {ratio && (
        <div className="risk-row">
          <span>Risk / reward</span>
          <b>1 : {ratio.toFixed(2)}</b>
        </div>
      )}
      {error && (
        <div className="inline-error" role="alert">
          <CircleAlert size={15} />
          {formatErrorMessage(error)}
        </div>
      )}
      <button
        className={`order-submit ${side.toLowerCase()}`}
        disabled={busy || !Number.isFinite(price)}
        onClick={startReview}
      >
        {side === 'BUY' ? <ArrowUp size={17} /> : <ArrowDown size={17} />}
        Review simulated {side.toLowerCase()}
      </button>
      <p className="ticket-disclaimer">This does not submit an order to any broker or exchange.</p>
      {reviewing && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Confirm simulated order">
          <div>
            <button className="icon-button modal-close" onClick={() => setReviewing(false)} aria-label="Close confirmation">
              <X size={16} />
            </button>
            <p className="eyebrow">CONFIRM SIMULATION</p>
            <h3>
              {side} {qty} {instrument.symbol}
            </h3>
            <p>
              {money(total, currency, 2)} at {money(price, currency, 2)}. Your local cash and positions will update
              immediately.
            </p>
            {error && (
              <div className="inline-error" role="alert">
                <CircleAlert size={15} />
                {formatErrorMessage(error)}
              </div>
            )}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setReviewing(false)}>
                Cancel
              </button>
              <button className="primary-button" onClick={confirm} disabled={busy}>
                {busy ? 'Processing…' : 'Confirm order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function Markets({ market, selectInstrument, setView }) {
  return (
    <>
      <PageIntro
        eyebrow="MARKET OVERVIEW"
        title="India market pulse"
        description="Supported Indian indices and stocks snapshot. Clear badges identify live, delayed, or demo data."
        action={
          <button className="secondary-button" onClick={() => setView('Trade Desk')}>
            <PanelTop size={16} />
            Trade an instrument
          </button>
        }
      />
      <section className="panel market-table-panel">
        <div className="market-table-head">
          <span>Instrument</span>
          <span>Trend</span>
          <span>Latest value</span>
          <span>Daily change</span>
          <span>Data status</span>
          <span />
        </div>
        {market.loading ? (
          <div className="loading-line">Requesting Indian market overview…</div>
        ) : (
          market.quotes.map((quote) => (
            <div className="market-table-row" key={quote.instrumentKey}>
              <div>
                <b>{quote.symbol === 'BANKNIFTY' ? 'NIFTY BANK' : quote.name}</b>
                <span>{quote.instrumentKey.split('|')[0].replace('_', ' ')}</span>
              </div>
              <MiniSparkline points={trend(quote)} positive={quote.change >= 0} />
              <b>{number(quote.price)}</b>
              <div>
                <Direction value={quote.change} />
                <Direction value={quote.changePercent} percent />
              </div>
              <StatusBadge status={quote.status} />
              <button
                className="icon-button"
                onClick={() => selectInstrument(quote)}
                aria-label={`Open ${quote.name} in trade desk`}
              >
                <ArrowUpRight size={17} />
              </button>
            </div>
          ))
        )}
        {market.error && <EmptyState icon={Wifi} title="Market data is unavailable" body={formatErrorMessage(market.error)} />}
      </section>
      <section className="info-panel">
        <CircleAlert size={18} />
        <p>
          <b>Indian Market Schedule:</b> Standard equity hours run Mon–Fri 09:15 to 15:30 IST. When configured with{' '}
          <code>UPSTOX_ACCESS_TOKEN</code>, quotes are tagged <b>LIVE</b> during trading hours and <b>DELAYED</b> after
          session close. Data is never replaced with fake prices.
        </p>
      </section>
    </>
  );
}

function Watchlist({ watchlist, quoteBook, addWatchlist, removeWatchlist, selectInstrument, settings }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('symbol');

  const search = async (event) => {
    event?.preventDefault();
    if (query.trim().length < 2) return setError('Enter at least two characters.');
    setSearching(true);
    setError('');
    try {
      const data = await marketApi.search(query.trim());
      setResults(data.results || []);
    } catch (caught) {
      setError(formatErrorMessage(caught));
    } finally {
      setSearching(false);
    }
  };

  const rows = watchlist
    .map((item) => quoteBook[item.instrumentKey] || { ...item, price: null, change: null, changePercent: null, status: 'UNAVAILABLE' })
    .sort((a, b) => (sort === 'price' ? (b.price || -Infinity) - (a.price || -Infinity) : a.symbol.localeCompare(b.symbol)));

  return (
    <>
      <PageIntro
        eyebrow="LOCAL WATCHLIST"
        title="Watchlist"
        description="Symbols are saved locally in this browser. When real market data is available, actual quotes are displayed."
      />
      <section className="panel watch-search">
        <form onSubmit={search}>
          <label>
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search symbol or company (e.g. RELIANCE, TCS, NIFTY)"
              aria-label="Search instruments"
            />
          </label>
          <button className="primary-button" type="submit" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        {error && (
          <div className="inline-error" role="alert">
            <CircleAlert size={15} />
            {formatErrorMessage(error)}
          </div>
        )}
        {results.length > 0 && (
          <div className="search-results">
            {results.map((item) => (
              <div className="search-result" key={item.instrumentKey}>
                <div>
                  <b>{item.symbol}</b>
                  <span>{item.name}</span>
                </div>
                <div>
                  <strong>{money(item.price, settings.currency, 2)}</strong>
                  <StatusBadge status={item.status} />
                </div>
                <button className="secondary-button" onClick={() => addWatchlist(item)}>
                  <Plus size={15} />
                  Watch
                </button>
                <button
                  className="icon-button"
                  onClick={() => selectInstrument(item)}
                  aria-label={`Trade ${item.symbol}`}
                >
                  <ArrowUpRight size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-head compact">
          <div>
            <p className="eyebrow">SAVED LOCALLY</p>
            <h2>Your instruments</h2>
          </div>
          <label className="sort-select">
            Sort{' '}
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="symbol">Symbol</option>
              <option value="price">Price</option>
            </select>
          </label>
        </div>
        {rows.length ? (
          <div className="watch-grid">
            {rows.map((item) => (
              <article className="watch-card" key={item.instrumentKey}>
                <div className="watch-card-head">
                  <div>
                    <span>{item.symbol}</span>
                    <b>{item.name}</b>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => removeWatchlist(item.instrumentKey)}
                    aria-label={`Remove ${item.symbol} from watchlist`}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="watch-price">
                  <strong>{money(item.price, settings.currency, 2)}</strong>
                  <Direction value={item.changePercent} percent />
                </div>
                <div className="watch-card-foot">
                  <StatusBadge status={item.status} />
                  <button className="text-button" onClick={() => selectInstrument(item)}>
                    Trade <ArrowUpRight size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Bookmark}
            title="No symbols watched yet"
            body="Use search above to add a supported NSE or BSE instrument to this browser’s watchlist."
          />
        )}
      </section>
    </>
  );
}

function Portfolio({ analytics, account, settings, applyFunding, selectInstrument }) {
  const [funds, setFunds] = useState('');
  const submitFunds = (event) => {
    event.preventDefault();
    applyFunding(Number(funds));
    setFunds('');
  };

  return (
    <>
      <PageIntro
        eyebrow="SIMULATED PORTFOLIO"
        title="Portfolio analytics"
        description="Local paper-trading statistics. They are not broker holdings or actual account performance."
      />
      <div className="portfolio-top">
        <section className="portfolio-balance">
          <p>Simulated portfolio value</p>
          <h1>{analytics.totalValue ? money(analytics.totalValue, settings.currency) : '—'}</h1>
          <div>
            <Direction value={analytics.totalPnl} />
            <span>Total P/L · realized + unrealized</span>
          </div>
          <dl>
            <div>
              <dt>Total invested</dt>
              <dd>{money(analytics.invested, settings.currency)}</dd>
            </div>
            <div>
              <dt>Available cash</dt>
              <dd>{money(account.cash, settings.currency)}</dd>
            </div>
          </dl>
          <form onSubmit={submitFunds} className="fund-form">
            <label>
              <span>Add simulated cash</span>
              <input
                value={funds}
                onChange={(event) => setFunds(event.target.value)}
                inputMode="decimal"
                type="number"
                min="1"
                placeholder="e.g. 100000"
              />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} />
              Add funds
            </button>
          </form>
        </section>
        <section className="panel allocation-panel">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">ALLOCATION</p>
              <h2>Position distribution</h2>
            </div>
            <span>{analytics.positions.length} positions</span>
          </div>
          <AllocationChart positions={analytics.positions} />
        </section>
      </div>
      <div className="analytics-row">
        <Metric
          icon={TrendingUp}
          label="Unrealized P/L"
          value={signed(analytics.unrealized, settings.currency)}
          trend={analytics.unrealized}
          note="Using latest available market price"
        />
        <Metric
          icon={History}
          label="Realized P/L"
          value={signed(analytics.realized, settings.currency)}
          trend={analytics.realized}
          note="From closed simulated trades"
        />
        <Metric
          icon={Building2}
          label="Asset distribution"
          value={analytics.positions.length ? `${analytics.positions.length} equity` : '—'}
          note="Active paper positions"
        />
      </div>
      <section className="panel">
        <div className="panel-head compact">
          <div>
            <p className="eyebrow">OPEN POSITIONS</p>
            <h2>Position ledger</h2>
          </div>
        </div>
        {analytics.positions.length ? (
          <PositionsTable positions={analytics.positions} currency={settings.currency} onSelect={selectInstrument} />
        ) : (
          <EmptyState
            icon={BriefcaseBusiness}
            title="No positions to analyse"
            body="Fund the paper account and submit a simulated buy order to see allocation and P/L."
          />
        )}
      </section>
    </>
  );
}

function PositionsTable({ positions, currency, onSelect }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('symbol');
  const rows = positions
    .filter((item) => `${item.symbol} ${item.name}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (sort === 'pnl' ? (b.unrealized || -Infinity) - (a.unrealized || -Infinity) : a.symbol.localeCompare(b.symbol)));

  if (!positions.length) return null;

  return (
    <>
      <div className="table-controls">
        <label>
          <Search size={15} />
          <input placeholder="Filter positions" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="symbol">Sort: Symbol</option>
          <option value="pnl">Sort: P/L</option>
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Avg. entry</th>
              <th>Latest price</th>
              <th>Market value</th>
              <th>Unrealized P/L</th>
              <th>Return</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((position) => (
              <tr key={position.instrumentKey}>
                <td>
                  <b>{position.symbol}</b>
                  <small>{position.name}</small>
                </td>
                <td>
                  <span className="long-pill">LONG</span>
                </td>
                <td>{position.quantity}</td>
                <td>{money(position.averageEntry, currency, 2)}</td>
                <td>
                  {money(position.currentPrice, currency, 2)}
                  <small>
                    <StatusBadge status={position.priceStatus} />
                  </small>
                </td>
                <td>{money(position.marketValue, currency)}</td>
                <td className={position.unrealized >= 0 ? 'positive-text' : 'negative-text'}>
                  {signed(position.unrealized, currency)}
                </td>
                <td className={position.returnPct >= 0 ? 'positive-text' : 'negative-text'}>
                  {position.returnPct == null ? '—' : `${position.returnPct >= 0 ? '+' : ''}${position.returnPct.toFixed(2)}%`}
                </td>
                <td>
                  <button
                    className="icon-button"
                    onClick={() =>
                      onSelect({
                        ...position,
                        price: position.currentPrice,
                        change: 0,
                        changePercent: 0,
                        status: position.priceStatus,
                      })
                    }
                    aria-label={`Open ${position.symbol} in trade desk`}
                  >
                    <ArrowUpRight size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TradeHistory({ account, currency }) {
  const [query, setQuery] = useState('');
  const [side, setSide] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const rows = account.transactions.filter(
    (item) => (side === 'ALL' || item.side === side) && `${item.symbol} ${item.name}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <PageIntro
        eyebrow="SIMULATED TRANSACTIONS"
        title="Trade history"
        description="Filled local paper orders persist across reloads in this browser. There are no broker imports in this version."
      />
      <section className="panel history-panel">
        <div className="history-controls">
          <label>
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search trades" />
          </label>
          <select value={side} onChange={(event) => setSide(event.target.value)}>
            <option value="ALL">All sides</option>
            <option value="BUY">Buys</option>
            <option value="SELL">Sells</option>
          </select>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Instrument</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Realized P/L</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((trade) => (
                  <tr key={trade.id}>
                    <td>{timestamp(trade.createdAt)}</td>
                    <td>
                      <b>{trade.symbol}</b>
                      <small>{trade.dataMode}</small>
                    </td>
                    <td>
                      <span className={trade.side === 'BUY' ? 'buy-pill' : 'sell-pill'}>{trade.side}</span>
                    </td>
                    <td>{trade.quantity}</td>
                    <td>{money(trade.entryPrice, currency, 2)}</td>
                    <td>{money(trade.exitPrice, currency, 2)}</td>
                    <td className={trade.realizedPnl >= 0 ? 'positive-text' : 'negative-text'}>
                      {trade.realizedPnl == null ? '—' : signed(trade.realizedPnl, currency)}
                    </td>
                    <td>
                      <span className="filled-pill">{trade.status}</span>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        onClick={() => setSelected(trade)}
                        aria-label={`Inspect ${trade.symbol} transaction`}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={History}
            title="No simulated transactions"
            body="Paper orders placed from the Trade Desk will appear here with their stored execution details."
          />
        )}
      </section>
      {selected && (
        <div className="details-drawer" role="dialog" aria-modal="true" aria-label="Transaction details">
          <div>
            <button className="icon-button modal-close" onClick={() => setSelected(null)} aria-label="Close transaction details">
              <X size={17} />
            </button>
            <p className="eyebrow">SIMULATED TRANSACTION</p>
            <h2>
              {selected.side} {selected.quantity} {selected.symbol}
            </h2>
            <dl>
              <div>
                <dt>Timestamp</dt>
                <dd>{timestamp(selected.createdAt)}</dd>
              </div>
              <div>
                <dt>Execution price</dt>
                <dd>{money(selected.price, currency, 2)}</dd>
              </div>
              <div>
                <dt>Order value</dt>
                <dd>{money(selected.price * selected.quantity, currency, 2)}</dd>
              </div>
              <div>
                <dt>Realized P/L</dt>
                <dd>{selected.realizedPnl == null ? '—' : signed(selected.realizedPnl, currency)}</dd>
              </div>
              <div>
                <dt>Data basis</dt>
                <dd>{selected.dataMode}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </>
  );
}

const ACHIEVEMENT_CATEGORIES = [
  'Trading Milestone',
  'Learning',
  'Consistency',
  'Risk Management',
  'Personal Best',
];

function getCategoryClass(category) {
  switch (category) {
    case 'Trading Milestone':
      return 'milestone';
    case 'Learning':
      return 'learning';
    case 'Consistency':
      return 'consistency';
    case 'Risk Management':
      return 'risk';
    case 'Personal Best':
      return 'personal';
    default:
      return 'milestone';
  }
}

function getCategoryIcon(category) {
  switch (category) {
    case 'Trading Milestone':
      return Award;
    case 'Learning':
      return Sparkles;
    case 'Consistency':
      return CheckCircle2;
    case 'Risk Management':
      return ShieldCheck;
    case 'Personal Best':
      return Flame;
    default:
      return Tag;
  }
}

function createAchievementBannerSvg(title, category) {
  const safeTitle = (title || 'Trading Achievement').replace(/[<>&"']/g, '');
  const accent =
    category === 'Risk Management'
      ? '%23fde047'
      : category === 'Learning'
      ? '%2393c5fd'
      : category === 'Consistency'
      ? '%236ee7b7'
      : category === 'Personal Best'
      ? '%23f472b6'
      : '%23a690fb';

  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="%230f1417"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%231a2228"/><stop offset="100%" stop-color="%230f1417"/></linearGradient></defs><rect width="640" height="400" fill="url(%23g)"/><circle cx="520" cy="100" r="140" fill="${accent}" opacity="0.08"/><circle cx="120" cy="300" r="100" fill="%238c6df6" opacity="0.05"/><path d="M 60 300 Q 180 260 280 200 T 480 140 T 580 80" fill="none" stroke="${accent}" stroke-width="4" stroke-dasharray="6 4" opacity="0.6"/><rect x="40" y="40" width="80" height="80" rx="16" fill="%23182025" stroke="%232b363d" stroke-width="2"/><text x="80" y="90" text-anchor="middle" font-size="34">🏆</text><text x="40" y="170" fill="${accent}" font-size="12" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="700" letter-spacing="2">${encodeURIComponent(
    (category || 'MILESTONE').toUpperCase()
  )}</text><text x="40" y="215" fill="%23edf1f3" font-size="24" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-weight="700">${encodeURIComponent(
    safeTitle.length > 32 ? safeTitle.slice(0, 30) + '…' : safeTitle
  )}</text><text x="40" y="245" fill="%237b8891" font-size="13" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">Paven's Trading Journey • Wall of Fame</text></svg>`;
}

const SEED_ACHIEVEMENTS = [
  {
    id: 'blueberry-funded-paven',
    title: 'Blueberry.Funded Payout ($277.65)',
    category: 'Personal Best',
    date: '2025-10-29',
    pnl: '+$277.65 (+5.55%)',
    description: 'Achieved +5.55% return trading USDJPY.pi on Blueberry.Funded funded account. Maintained disciplined execution and risk management throughout the challenge.',
    imageData: '/images/paven-first-achievement.jpg',
    updatedAt: '2025-10-29T18:00:00.000Z',
  },
  {
    id: 'seed-1',
    title: 'First Consistent Profitable Month',
    category: 'Trading Milestone',
    date: '2025-02-28',
    pnl: '+₹42,500',
    description: 'Maintained positive net P/L across 22 trading sessions by following strict 1:2 risk/reward ratio on NIFTY index setups.',
    imageData: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23131a1e"/><path d="M 40 320 Q 150 280 250 200 T 450 120 T 560 60" fill="none" stroke="%2336d79b" stroke-width="6"/><circle cx="560" cy="60" r="12" fill="%23d5ffe9"/><text x="50" y="80" fill="%23edf1f3" font-size="26" font-family="sans-serif" font-weight="bold">First Profitable Month</text><text x="50" y="120" fill="%2336d79b" font-size="20" font-family="sans-serif">+14.2% Net Gain (₹42,500)</text></svg>',
    updatedAt: '2025-02-28T18:00:00.000Z',
  },
  {
    id: 'seed-2',
    title: 'Disciplined Stop-Loss Streak (20 Trades)',
    category: 'Risk Management',
    date: '2025-01-15',
    pnl: '',
    description: 'Executed 20 consecutive trades without moving or cancelling initial stop-loss orders. Eliminated emotional revenge trading completely.',
    imageData: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23171524"/><circle cx="300" cy="180" r="100" fill="none" stroke="%23fde047" stroke-width="8" stroke-dasharray="16 8"/><polygon points="300,120 360,240 240,240" fill="%23fde047" opacity="0.3"/><text x="300" y="330" text-anchor="middle" fill="%23fef08a" font-size="24" font-family="sans-serif" font-weight="bold">Strict Risk Protocol</text></svg>',
    updatedAt: '2025-01-15T18:00:00.000Z',
  },
  {
    id: 'seed-3',
    title: 'Options Greeks & Hedging Mastery',
    category: 'Learning',
    date: '2024-12-10',
    pnl: '',
    description: 'Completed 60+ hours studying Delta neutral adjustments, implied volatility crush mechanics, and institutional hedging structures.',
    imageData: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23121921"/><rect x="100" y="60" width="400" height="280" rx="16" fill="%231a2430" stroke="%23384a5e" stroke-width="4"/><line x1="140" y1="120" x2="380" y2="120" stroke="%2360a5fa" stroke-width="6" stroke-linecap="round"/><line x1="140" y1="160" x2="320" y2="160" stroke="%2393c5fd" stroke-width="4"/><line x1="140" y1="200" x2="420" y2="200" stroke="%2393c5fd" stroke-width="4"/><text x="140" y="270" fill="%23edf1f3" font-size="22" font-family="sans-serif">Options Greeks Framework</text></svg>',
    updatedAt: '2024-12-10T18:00:00.000Z',
  },
  {
    id: 'seed-4',
    title: '30-Day Pre-Market Journaling Streak',
    category: 'Consistency',
    date: '2024-11-05',
    pnl: '',
    description: 'Completed 30 consecutive days of thorough pre-market analysis, key support/resistance level identification, and trade planning.',
    imageData: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%2310211a"/><rect x="120" y="70" width="360" height="260" rx="16" fill="%23143228" stroke="%23225644" stroke-width="4"/><path d="M 220 200 L 280 250 L 390 140" fill="none" stroke="%236ee7b7" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><text x="300" y="300" text-anchor="middle" fill="%23a7f3d0" font-size="22" font-family="sans-serif" font-weight="bold">30 Sessions Logged</text></svg>',
    updatedAt: '2024-11-05T18:00:00.000Z',
  },
  {
    id: 'seed-5',
    title: 'Bank Nifty Expiry Reversal Setup',
    category: 'Personal Best',
    date: '2024-09-18',
    pnl: '+₹87,200',
    description: 'Flawless execution on a confirmed reversal at major weekly demand. Scaled out portions into institutional liquidity pools without hesitation.',
    imageData: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%2324121d"/><path d="M 60 320 Q 180 300 260 220 T 440 120 T 540 60" fill="none" stroke="%23f472b6" stroke-width="6"/><circle cx="540" cy="60" r="12" fill="%23fbcfe8"/><text x="60" y="80" fill="%23fdf2f8" font-size="26" font-family="sans-serif" font-weight="bold">Personal Best Trade</text><text x="60" y="120" fill="%23f472b6" font-size="20" font-family="sans-serif">+₹87,200 Realized Gain</text></svg>',
    updatedAt: '2024-09-18T18:00:00.000Z',
  },
];

export function Achievements({ setToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [inspecting, setInspecting] = useState(null);
  const [editing, setEditing] = useState(null); // null, 'NEW', or an existing item object
  const [deleteTarget, setDeleteTarget] = useState(null); // item to delete with confirmation
  const [formDraft, setFormDraft] = useState({
    title: '',
    category: 'Trading Milestone',
    date: '',
    pnl: '',
    description: '',
    imageData: '',
  });
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      let stored = await listAchievements();
      if (!stored.length) {
        // Save initial seeds to IndexedDB
        for (const seed of SEED_ACHIEVEMENTS) {
          try {
            await saveAchievement(seed);
          } catch {}
        }
        stored = await listAchievements();
      }
      setItems(stored.length ? stored : SEED_ACHIEVEMENTS);
    } catch {
      setItems(SEED_ACHIEVEMENTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openNewForm = () => {
    setFormDraft({
      title: '',
      category: 'Trading Milestone',
      date: new Date().toISOString().slice(0, 10),
      pnl: '',
      description: '',
      imageData: '',
    });
    setEditing('NEW');
  };

  const openEditForm = (item) => {
    setFormDraft({
      title: item.title,
      category: item.category || 'Trading Milestone',
      date: item.date,
      pnl: item.pnl || '',
      description: item.description || '',
      imageData: item.imageData || '',
    });
    setEditing(item);
    setInspecting(null);
  };

  const handleImageFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await readAchievementImage(file);
      setFormDraft((old) => ({ ...old, imageData: data }));
      setToast({ type: 'success', text: `Loaded image "${file.name}" (${(file.size / 1024).toFixed(0)} KB).` });
    } catch (err) {
      setToast({ type: 'error', text: formatErrorMessage(err) });
    }
  };

  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!formDraft.title.trim()) return setToast({ type: 'error', text: 'Enter an achievement title.' });
    if (!formDraft.date) return setToast({ type: 'error', text: 'Select a valid date.' });

    let finalImage = formDraft.imageData;
    if (!finalImage) {
      // Generate stylized terminal graphic if no image was uploaded
      finalImage = createAchievementBannerSvg(formDraft.title.trim(), formDraft.category);
    }

    setSaving(true);
    try {
      const id = editing === 'NEW' ? crypto.randomUUID() : editing.id;
      const record = {
        id,
        title: formDraft.title.trim(),
        category: formDraft.category,
        date: formDraft.date,
        pnl: formDraft.pnl.trim(),
        description: formDraft.description.trim(),
        imageData: finalImage,
        updatedAt: new Date().toISOString(),
      };
      await saveAchievement(record);
      setToast({ type: 'success', text: `Achievement "${record.title}" saved successfully.` });
      setEditing(null);
      await loadAll();
    } catch (err) {
      setToast({ type: 'error', text: formatErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteAction = async () => {
    if (!deleteTarget) return;
    const itemToDelete = deleteTarget;
    try {
      await removeAchievement(itemToDelete.id);
      setToast({ type: 'success', text: `Removed "${itemToDelete.title}".` });
      setDeleteTarget(null);
      if (inspecting?.id === itemToDelete.id) {
        setInspecting(null);
      }
      await loadAll();
    } catch (err) {
      setToast({ type: 'error', text: formatErrorMessage(err) });
    }
  };

  const totalCount = items.length;
  const milestonesCount = items.filter((item) => item.category === 'Trading Milestone').length;
  const latestItem = items[0] || null;

  const filtered = items.filter((item) => filter === 'ALL' || item.category === filter);

  return (
    <>
      <PageIntro
        eyebrow="MILESTONES & WALL OF FAME"
        title="Trading Achievements"
        description="Every milestone tells a story of discipline, patience, and consistency."
        action={
          <button className="primary-button" onClick={openNewForm} id="add-achievement-btn">
            <Plus size={16} />
            Add Achievement
          </button>
        }
      />

      {/* Summary Metrics Cards */}
      <div className="achievement-summary-grid">
        <div className="achievement-summary-card">
          <div className="summary-icon">
            <Trophy size={16} />
          </div>
          <span>Total Achievements</span>
          <strong>{totalCount}</strong>
          <small>{totalCount === 1 ? '1 milestone documented' : `${totalCount} milestones documented`}</small>
        </div>
        <div className="achievement-summary-card">
          <div className="summary-icon">
            <Award size={16} />
          </div>
          <span>Milestones Completed</span>
          <strong>{milestonesCount}</strong>
          <small>Core trading goals accomplished</small>
        </div>
        <div className="achievement-summary-card">
          <div className="summary-icon">
            <Sparkles size={16} />
          </div>
          <span>Latest Achievement</span>
          <strong title={latestItem ? latestItem.title : 'None yet'}>
            {latestItem ? latestItem.title : 'None yet'}
          </strong>
          <small>{latestItem ? (latestItem.date ? shortDate(latestItem.date) : 'Recent') : 'Document your first win'}</small>
        </div>
      </div>

      {/* Category Filter Toolbar */}
      <div className="achievement-toolbar">
        <div className="timeframe-tabs" role="tablist">
          {['ALL', ...ACHIEVEMENT_CATEGORIES].map((cat) => (
            <button
              type="button"
              className={filter === cat ? 'active' : ''}
              onClick={() => setFilter(cat)}
              key={cat}
            >
              {cat === 'ALL' ? 'All' : cat}
            </button>
          ))}
        </div>
        <p>{filtered.length} documented milestone{filtered.length === 1 ? '' : 's'}</p>
      </div>

      {/* Grid or Empty State */}
      {loading ? (
        <div className="loading-line">Loading your trading achievements…</div>
      ) : filtered.length ? (
        <div className="achievement-grid">
          {filtered.map((item) => {
            const CatIcon = getCategoryIcon(item.category);
            const catClass = getCategoryClass(item.category);
            return (
              <button
                className="achievement-card"
                key={item.id}
                onClick={() => setInspecting(item)}
                aria-label={`View achievement ${item.title}`}
              >
                <div className="achievement-card-media">
                  <div
                    className="achievement-card-media-blur"
                    style={{ backgroundImage: `url("${item.imageData}")` }}
                    aria-hidden="true"
                  />
                  <img className="achievement-card-image" src={item.imageData} alt={item.title} loading="lazy" />
                </div>
                <div className="achievement-card-copy">
                  <div className="achievement-card-meta">
                    <span className={`achievement-category ${catClass}`}>
                      <CatIcon size={11} />
                      {item.category || 'Trading Milestone'}
                    </span>
                    <span>
                      <CalendarDays size={11} />
                      {item.date ? shortDate(item.date) : '—'}
                    </span>
                  </div>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                  <div className="achievement-card-footer">
                    {item.pnl ? (
                      <span className={`achievement-pnl ${item.pnl.includes('-') || item.pnl.includes('−') ? 'negative' : 'positive'}`}>
                        {item.pnl}
                      </span>
                    ) : (
                      <span>{item.date}</span>
                    )}
                    <span className="card-view-text">
                      View details <ArrowUpRight size={13} />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Trophy}
          title={filter === 'ALL' ? 'No achievements yet' : `No achievements under "${filter}"`}
          body={
            filter === 'ALL'
              ? 'Every milestone tells a story of discipline, patience, and consistency. Document your first breakthrough or rule adherence to start your wall of fame.'
              : `You haven't logged any milestones in "${filter}" yet. Click below to add one or select another category.`
          }
          action={
            <button className="secondary-button" onClick={openNewForm}>
              <Plus size={16} />
              {filter === 'ALL' ? 'Add first achievement' : `Add ${filter} achievement`}
            </button>
          }
        />
      )}

      {/* Inspect Detail Modal */}
      {inspecting && (
        <div className="achievement-dialog" role="dialog" aria-modal="true" aria-label="Achievement details">
          <div>
            <button className="icon-button modal-close" onClick={() => setInspecting(null)} aria-label="Close details">
              <X size={17} />
            </button>
            <div className="achievement-detail">
              <div className="achievement-detail-media">
                <div
                  className="achievement-detail-media-blur"
                  style={{ backgroundImage: `url("${inspecting.imageData}")` }}
                  aria-hidden="true"
                />
                <img className="achievement-detail-image" src={inspecting.imageData} alt={inspecting.title} />
              </div>
              <div className="achievement-detail-copy">
                <p className="eyebrow">MILESTONE HIGHLIGHT</p>
                <div className="achievement-card-meta">
                  <span className={`achievement-category ${getCategoryClass(inspecting.category)}`}>
                    {inspecting.category || 'Trading Milestone'}
                  </span>
                  <span>
                    <CalendarDays size={11} />
                    {inspecting.date}
                  </span>
                  {inspecting.pnl && (
                    <span className={`achievement-pnl ${inspecting.pnl.includes('-') || inspecting.pnl.includes('−') ? 'negative' : 'positive'}`}>
                      {inspecting.pnl}
                    </span>
                  )}
                </div>
                <h2>{inspecting.title}</h2>
                <p>{inspecting.description}</p>
                <div className="achievement-detail-actions">
                  <button className="secondary-button" onClick={() => openEditForm(inspecting)}>
                    <Pencil size={15} />
                    Edit
                  </button>
                  <button className="secondary-button danger-button" onClick={() => setDeleteTarget(inspecting)}>
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Form Modal */}
      {editing && (
        <div className="achievement-dialog" role="dialog" aria-modal="true" aria-label="Achievement form">
          <div>
            <button className="icon-button modal-close" onClick={() => setEditing(null)} aria-label="Close form">
              <X size={17} />
            </button>
            <form onSubmit={handleSaveForm}>
              <p className="eyebrow">{editing === 'NEW' ? 'NEW MILESTONE' : 'EDIT ACHIEVEMENT'}</p>
              <h2>{editing === 'NEW' ? 'Document an achievement' : 'Update milestone'}</h2>

              <label>
                Achievement Title *
                <input
                  value={formDraft.title}
                  placeholder="e.g. First 100 Profitable Index Trades"
                  maxLength="100"
                  required
                  onChange={(e) => setFormDraft({ ...formDraft, title: e.target.value })}
                />
              </label>

              <div className="two-fields">
                <label>
                  Category *
                  <select
                    value={formDraft.category}
                    onChange={(e) => setFormDraft({ ...formDraft, category: e.target.value })}
                  >
                    {ACHIEVEMENT_CATEGORIES.map((cat) => (
                      <option value={cat} key={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Achievement Date *
                  <input
                    type="date"
                    value={formDraft.date}
                    required
                    onChange={(e) => setFormDraft({ ...formDraft, date: e.target.value })}
                  />
                </label>
              </div>

              <label>
                Profit / Loss Amount (Optional)
                <input
                  type="text"
                  value={formDraft.pnl}
                  placeholder="e.g. +₹24,500 or -₹2,500"
                  onChange={(e) => setFormDraft({ ...formDraft, pnl: e.target.value })}
                />
              </label>

              <label>
                Description & Trading Journal Notes
                <textarea
                  value={formDraft.description}
                  placeholder="What setup did you follow? What risk rules did you adhere to? What did you learn?"
                  rows={4}
                  onChange={(e) => setFormDraft({ ...formDraft, description: e.target.value })}
                />
              </label>

              <label>
                Screenshot / Chart Image (PNG, JPG, WebP &lt; 3 MB)
                <div className="achievement-upload-container">
                  <label className="achievement-upload-trigger">
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp, image/svg+xml"
                      className="achievement-file-input"
                      onChange={handleImageFile}
                    />
                    <ImageIcon size={16} />
                    <span>{formDraft.imageData ? 'Change image from device' : 'Choose image from device'}</span>
                  </label>
                  {formDraft.imageData && (
                    <div className="achievement-preview-wrap">
                      <img className="achievement-image-preview" src={formDraft.imageData} alt="Achievement Preview" />
                      <button
                        type="button"
                        className="icon-button achievement-remove-image"
                        onClick={() => setFormDraft((prev) => ({ ...prev, imageData: '' }))}
                        title="Remove image"
                        aria-label="Remove image"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </label>

              <p className="achievement-note">
                Images are saved in local browser storage (IndexedDB) and remain strictly private to your device. Recommended file size is under 3 MB.
              </p>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? 'Saving…' : 'Save achievement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="achievement-dialog" role="dialog" aria-modal="true" aria-label="Confirm deletion">
          <div className="achievement-confirm-card">
            <button className="icon-button modal-close" onClick={() => setDeleteTarget(null)} aria-label="Cancel">
              <X size={17} />
            </button>
            <div className="confirm-icon-wrap">
              <Trash2 size={24} />
            </div>
            <h3>Delete Achievement?</h3>
            <p>
              Are you sure you want to delete <strong>"{deleteTarget.title}"</strong>? This milestone will be permanently removed from your browser storage.
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="secondary-button danger-button"
                onClick={confirmDeleteAction}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local Storage Information Footer */}
      <div className="achievement-storage-info">
        <CircleAlert size={16} />
        <span>
          <strong>Local Browser Persistence:</strong> Your achievements and uploaded charts are stored securely inside your browser's IndexedDB storage. Data remains persistent across page refreshes on this device, but does not sync across different browsers or devices without a remote backend.
        </span>
      </div>
    </>
  );
}

function Settings({ settings, setSettings, watchlist, applyFunding }) {
  const [draft, setDraft] = useState(settings);
  const [funds, setFunds] = useState('');

  const save = (event) => {
    event.preventDefault();
    setSettings({
      ...draft,
      refreshSeconds: Math.max(30, Math.min(300, Number(draft.refreshSeconds) || 60)),
    });
  };

  return (
    <>
      <PageIntro
        eyebrow="PREFERENCES"
        title="Settings"
        description="Your name, display preferences, and watchlist remain on this device only. API tokens are never stored in the browser."
      />
      <div className="settings-layout">
        <form className="panel settings-form" onSubmit={save}>
          <div className="panel-head">
            <div>
              <p className="eyebrow">TRADER PROFILE</p>
              <h2>Workspace preferences</h2>
            </div>
          </div>
          <label>
            Trader display name
            <input
              value={draft.traderName}
              maxLength="40"
              onChange={(event) => setDraft({ ...draft, traderName: event.target.value })}
              placeholder="Add a display name"
            />
          </label>
          <label>
            Profile image URL
            <input
              value={draft.logo}
              type="url"
              onChange={(event) => setDraft({ ...draft, logo: event.target.value })}
              placeholder="https://… (optional)"
            />
            <small>Leave empty to use your default profile photo; saved locally in browser.</small>
          </label>
          <div className="two-fields">
            <label>
              Preferred market
              <select value={draft.market} onChange={(event) => setDraft({ ...draft, market: event.target.value })}>
                <option>India (NSE/BSE)</option>
                <option>India (NSE)</option>
              </select>
            </label>
            <label>
              Currency
              <select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })}>
                <option value="INR">INR (₹)</option>
              </select>
            </label>
          </div>
          <div className="two-fields">
            <label>
              Default chart range
              <select
                value={draft.chartPreference}
                onChange={(event) => setDraft({ ...draft, chartPreference: event.target.value })}
              >
                {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((value) => (
                  <option value={value} key={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Refresh interval (seconds)
              <input
                value={draft.refreshSeconds}
                min="30"
                max="300"
                type="number"
                onChange={(event) => setDraft({ ...draft, refreshSeconds: event.target.value })}
              />
              <small>Minimum 30 seconds to respect standard API limits.</small>
            </label>
          </div>
          <button className="primary-button" type="submit">
            <Check size={16} />
            Save preferences
          </button>
        </form>
        <aside>
          <section className="panel settings-summary">
            <p className="eyebrow">SIMULATION</p>
            <h2>Account setup</h2>
            <p>Begin with an amount you are comfortable using as a paper-trading balance. No real money is transferred.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                applyFunding(Number(funds));
                setFunds('');
              }}
            >
              <input
                value={funds}
                type="number"
                min="1"
                placeholder="Add simulated cash"
                onChange={(event) => setFunds(event.target.value)}
              />
              <button className="secondary-button" type="submit">
                <Plus size={16} />
                Add cash
              </button>
            </form>
          </section>
          <section className="info-panel">
            <CircleAlert size={18} />
            <p>
              <b>Browser-local data:</b> preferences, watchlist, achievements, and paper transactions do not sync across devices.
            </p>
          </section>
          <section className="info-panel">
            <Wifi size={18} />
            <p>
              <b>Market credentials:</b> Configure <code>UPSTOX_ACCESS_TOKEN</code> strictly on the server or in Vercel
              environment variables. Never paste secrets in client settings.
            </p>
          </section>
          <p className="settings-watch-count">
            <Bookmark size={16} />
            {watchlist.length} locally saved watchlist symbols
          </p>
        </aside>
      </div>
    </>
  );
}

function InstrumentFinder({ compact = false, onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async (event) => {
    event?.preventDefault();
    if (query.trim().length < 2) return setError('Enter 2+ characters.');
    setLoading(true);
    setError('');
    try {
      const data = await marketApi.search(query.trim());
      setResults(data.results || []);
      setOpen(true);
    } catch (caught) {
      setError(formatErrorMessage(caught));
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`instrument-finder ${compact ? 'compact' : ''}`}>
      <form onSubmit={run}>
        <Search size={17} />
        <input
          value={query}
          onFocus={() => results.length && setOpen(true)}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search symbol (e.g. RELIANCE, TCS, NIFTY)"
        />
        <button type="submit" aria-label="Search instrument">
          {loading ? <RefreshCw size={15} className="spin" /> : <Search size={15} />}
        </button>
      </form>
      {open && (
        <div className="finder-menu">
          {error && <p className="finder-error">{formatErrorMessage(error)}</p>}
          {results.map((item) => (
            <button
              key={item.instrumentKey}
              onClick={() => {
                onPick(item);
                setOpen(false);
                setQuery(item.symbol);
              }}
            >
              <span>
                <b>{item.symbol}</b>
                <small>{item.name}</small>
              </span>
              <span>
                <b>{money(item.price, 'INR', 2)}</b>
                <StatusBadge status={item.status} />
              </span>
            </button>
          ))}
          {!error && !results.length && <p>No supported instrument found.</p>}
        </div>
      )}
    </div>
  );
}

function performanceSeries(account, currentValue) {
  if (!account.transactions.length) return [];
  const chronological = [...account.transactions].reverse();
  let value = 0;
  return chronological.map((trade, index) => {
    value =
      index === chronological.length - 1
        ? currentValue
        : Math.max(0, value + (trade.side === 'BUY' ? trade.price * trade.quantity : -trade.price * trade.quantity));
    return { date: trade.createdAt, label: shortDate(trade.createdAt), value };
  });
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

export default App;
