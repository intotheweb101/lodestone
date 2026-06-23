'use client';

import { useState, useEffect } from 'react';

interface PricePoint {
  date: string;
  price_nzd: number;
}

interface Props {
  matchKey: string;
  days?: number;
}

export function PriceSparkline({ matchKey, days = 90 }: Props) {
  const [history, setHistory] = useState<PricePoint[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!matchKey) { setLoading(false); return; }
    fetch(`/api/price/history?match_key=${encodeURIComponent(matchKey)}&days=${days}`)
      .then(r => r.json())
      .then((d: { history: PricePoint[] }) => setHistory(d.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [matchKey, days]);

  if (loading) {
    return (
      <div style={{ height: '48px', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
          Loading price history…
        </span>
      </div>
    );
  }

  if (!history || history.length < 2) {
    return (
      <div style={{ height: '48px', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
          {history?.length === 0 ? 'No price history yet — data accrues after each sync' : 'Collecting price data…'}
        </span>
      </div>
    );
  }

  // Build SVG sparkline
  const W = 240, H = 48, PAD = 4;
  const prices = history.map(p => p.price_nzd);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const latest = prices[prices.length - 1];
  const first = prices[0];
  const trending = latest < first ? 'down' : latest > first ? 'up' : 'flat';

  const toX = (i: number) => PAD + (i / (history.length - 1)) * (W - PAD * 2);
  const toY = (p: number) => PAD + (1 - (p - minP) / range) * (H - PAD * 2);

  const points = history.map((p, i) => `${toX(i)},${toY(p.price_nzd)}`).join(' ');
  // Fill path: close down to baseline
  const fillPath = `M${toX(0)},${toY(history[0].price_nzd)} L${history.map((p, i) => `${toX(i)},${toY(p.price_nzd)}`).join(' L')} L${toX(history.length - 1)},${H} L${toX(0)},${H} Z`;

  const lineColor = trending === 'down' ? '#54c08a' : trending === 'up' ? '#e2645c' : '#e8b14a';
  const fillColor = trending === 'down' ? 'rgba(84,192,138,0.12)' : trending === 'up' ? 'rgba(226,100,92,0.10)' : 'rgba(232,177,74,0.08)';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
          {days}d price trend
        </span>
        <span style={{ fontSize: '11px', color: lineColor, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
          {trending === 'down' ? '↓' : trending === 'up' ? '↑' : '→'} ${latest.toFixed(2)} NZD
        </span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', maxWidth: '100%' }}>
        <path d={fillPath} fill={fillColor} />
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* Latest point dot */}
        <circle cx={toX(history.length - 1)} cy={toY(latest)} r="3" fill={lineColor} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
          {history[0].date}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
          ${minP.toFixed(2)} – ${maxP.toFixed(2)}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
          {history[history.length - 1].date}
        </span>
      </div>
    </div>
  );
}
