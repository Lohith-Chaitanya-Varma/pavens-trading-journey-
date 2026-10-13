import { useMemo, useState } from 'react';
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const moneyShort = (value) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);

function formatCandleDate(time) {
  if (!time) return '—';
  try {
    const d = new Date(time);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      });
    }
  } catch {}
  return String(time);
}

export function MiniSparkline({ points = [], positive = true }) {
  const values = points.length ? points : [4, 7, 6, 8, 6, 9, 10];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const line = values
    .map((value, index) => `${(index / (values.length - 1)) * 100},${38 - ((value - min) / range) * 32}`)
    .join(' ');
  return (
    <svg className={`sparkline ${positive ? 'positive' : 'negative'}`} viewBox="0 0 100 40" aria-label="Illustrative market trend">
      <polyline points={line} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function PortfolioChart({ values, timeframe, onTimeframe }) {
  const [tooltip, setTooltip] = useState(null);
  const safe = useMemo(() => {
    if (!values?.length || timeframe === 'ALL') return values || [];
    const days = { '1D': 1, '1W': 7, '1M': 31, '3M': 92, '1Y': 366 }[timeframe] || 31;
    const cutoff = Date.now() - days * 86400000;
    return values.filter((item) => new Date(item.date).getTime() >= cutoff);
  }, [values, timeframe]);

  return (
    <section className="chart-panel performance-panel" aria-label="Simulated portfolio performance">
      <div className="panel-head">
        <div>
          <p className="eyebrow">SIMULATED ACCOUNT</p>
          <h2>Portfolio checkpoints</h2>
          <p className="subtle">Balance checkpoints from saved local transactions—not historical market performance.</p>
        </div>
        <TimeframeTabs value={timeframe} onChange={onTimeframe} />
      </div>
      {safe.length ? (
        <div className="chart-wrap" aria-live="polite">
          <ResponsiveContainer width="100%" height={305}>
            <AreaChart
              data={safe}
              margin={{ top: 18, right: 8, left: -18, bottom: 0 }}
              onMouseMove={(event) => setTooltip(event?.activePayload?.[0]?.payload || null)}
              onMouseLeave={() => setTooltip(null)}
            >
              <defs>
                <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#27c58b" stopOpacity={0.23} />
                  <stop offset="100%" stopColor="#27c58b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#77808b', fontSize: 11 }} minTickGap={32} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#77808b', fontSize: 11 }}
                tickFormatter={(v) => `₹${moneyShort(v)}`}
                width={58}
              />
              <Tooltip content={() => null} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#36d79b"
                strokeWidth={2.25}
                fill="url(#portfolioFill)"
                activeDot={{ r: 4, fill: '#d5ffe9', stroke: '#36d79b', strokeWidth: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
          {tooltip && (
            <div className="chart-readout">
              <span>{tooltip.label}</span>
              <strong>₹{moneyShort(tooltip.value)}</strong>
            </div>
          )}
        </div>
      ) : (
        <div className="chart-empty">Place simulated trades or add funds to begin your personal performance timeline.</div>
      )}
    </section>
  );
}

export function TimeframeTabs({ value, onChange }) {
  return (
    <div className="timeframe-tabs" role="tablist" aria-label="Chart timeframe">
      {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((item) => (
        <button
          type="button"
          className={value === item ? 'active' : ''}
          aria-selected={value === item}
          key={item}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function CandleChart({ candles, status }) {
  const [hovered, setHovered] = useState(null);
  const view = useMemo(() => {
    if (!candles?.length) return null;
    const prices = candles.flatMap((item) => [item.high, item.low]).filter(Number.isFinite);
    if (!prices.length) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = (max - min) * 0.08 || 1;
    return { min: min - pad, max: max + pad };
  }, [candles]);

  if (!view || !candles?.length) {
    return (
      <div className="chart-empty">
        {status === 'UNAVAILABLE'
          ? 'Historical candle data is currently unavailable for this instrument.'
          : 'No historical chart data found.'}
      </div>
    );
  }

  const scaleY = (price) => 240 - ((price - view.min) / (view.max - view.min)) * 220;
  const visible = candles.slice(-55);

  return (
    <div className="candle-area">
      <svg viewBox="0 0 760 260" role="img" aria-label={`${status} candlestick chart`} preserveAspectRatio="none">
        {[45, 100, 155, 210].map((y) => (
          <line key={y} x1="0" x2="760" y1={y} y2={y} className="chart-grid" />
        ))}
        {visible.map((candle, index) => {
          const x = 10 + index * (740 / visible.length);
          const width = Math.max(3, 520 / visible.length);
          const rising = candle.close >= candle.open;
          const yOpen = scaleY(candle.open);
          const yClose = scaleY(candle.close);
          const yHigh = scaleY(candle.high);
          const yLow = scaleY(candle.low);
          const dateStr = formatCandleDate(candle.time);

          return (
            <g
              className="candle"
              key={candle.time || index}
              tabIndex="0"
              role="graphics-symbol"
              aria-label={`${dateStr}: O ${candle.open}, H ${candle.high}, L ${candle.low}, C ${candle.close}`}
              onMouseEnter={() => setHovered(candle)}
              onFocus={() => setHovered(candle)}
            >
              <line x1={x} x2={x} y1={yHigh} y2={yLow} className={rising ? 'up' : 'down'} />
              <rect
                x={x - width / 2}
                y={Math.min(yOpen, yClose)}
                width={width}
                height={Math.max(2, Math.abs(yOpen - yClose))}
                className={rising ? 'up' : 'down'}
              />
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div className="candle-tooltip">
          <span>{formatCandleDate(hovered.time)}</span>
          <b>
            O {Number(hovered.open || 0).toFixed(2)} · H {Number(hovered.high || 0).toFixed(2)} · L{' '}
            {Number(hovered.low || 0).toFixed(2)} · C {Number(hovered.close || 0).toFixed(2)}
          </b>
        </div>
      )}
      <div className="candle-legend">
        <span className={`status-dot ${status?.toLowerCase() || 'unavailable'}`} />
        {status || 'DATA'} CANDLES
      </div>
    </div>
  );
}

export function AllocationChart({ positions }) {
  const chartData = (positions || [])
    .filter((p) => p.marketValue)
    .map((p, index) => ({
      name: p.symbol,
      value: p.marketValue,
      color: ['#36d79b', '#8c6df6', '#44a4ff', '#f2b95c', '#e98b9a'][index % 5],
    }));

  if (!chartData.length) {
    return <div className="allocation-empty">Allocation appears when you hold simulated positions.</div>;
  }

  return (
    <div className="allocation-layout">
      <ResponsiveContainer width="48%" height={180}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={72} paddingAngle={4} stroke="none">
            {chartData.map((entry) => (
              <Cell fill={entry.color} key={entry.name} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="allocation-legend">
        {chartData.map((item) => (
          <div key={item.name}>
            <i style={{ background: item.color }} />
            <span>{item.name}</span>
            <b>{moneyShort(item.value)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
