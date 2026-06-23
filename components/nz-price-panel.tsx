'use client';

import { useState, useEffect } from 'react';

interface ShopPrice {
  shop_name: string;
  shop_url: string;
  product_url: string | null;
  price_nzd: number;
  condition: string;
  finish: string;
  confidence: string;
  available: boolean;
}

interface NzPricePanelProps {
  setCode: string;
  collectorNumber: string;
  finishes: string[];
}

const CONF_STYLE: Record<string, { bg: string; border: string; color: string; dot: string }> = {
  exact:    { bg: 'rgba(84,192,138,0.12)',  border: 'rgba(84,192,138,0.4)',  color: '#7fd6a6', dot: '#54c08a' },
  probable: { bg: 'rgba(240,207,91,0.10)',  border: 'rgba(240,207,91,0.38)', color: '#e6ce7a', dot: '#f0cf5b' },
  weak:     { bg: 'rgba(224,145,58,0.10)',  border: 'rgba(224,145,58,0.35)', color: '#d4955a', dot: '#e0913a' },
  none:     { bg: 'rgba(226,100,92,0.10)',  border: 'rgba(226,100,92,0.35)', color: '#d07070', dot: '#e2645c' },
};

export function NzPricePanel({ setCode, collectorNumber, finishes }: NzPricePanelProps) {
  const defaultFinish = finishes.includes('nonfoil') ? 'nonfoil' : finishes[0] ?? 'nonfoil';
  const [finish, setFinish] = useState<string>(defaultFinish);
  const [prices, setPrices] = useState<ShopPrice[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setPrices(null);
    const key = `${setCode.toLowerCase()}::${collectorNumber}::${finish}`;
    fetch('/api/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_key: key, condition_floor: 'lp' }),
    })
      .then(r => r.json())
      .then((d: { prices: ShopPrice[] }) => { setPrices(d.prices ?? []); })
      .catch(() => setPrices([]))
      .finally(() => setLoading(false));
  }, [setCode, collectorNumber, finish]);

  const available = (prices ?? []).filter(p => p.available);
  const best = available[0] ?? prices?.[0] ?? null;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          NZ shop prices
        </span>
        {finishes.length > 1 && (
          <div style={{ display: 'flex', gap: '4px' }}>
            {finishes.filter(f => f === 'nonfoil' || f === 'foil' || f === 'etched').map(f => (
              <button
                key={f}
                onClick={() => setFinish(f)}
                style={{
                  padding: '2px 8px', borderRadius: '4px', fontSize: '10px',
                  fontFamily: "'IBM Plex Mono', monospace", cursor: 'pointer',
                  border: finish === f ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: finish === f ? 'var(--accent-glow)' : 'transparent',
                  color: finish === f ? 'var(--accent)' : 'var(--text-faint)',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '12px' }}>
          Checking shops…
        </div>
      ) : !prices || prices.length === 0 ? (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '12px' }}>
          Not stocked at our tracked NZ shops for this printing.
        </div>
      ) : (
        <>
          {best && (
            <div style={{ padding: '10px 14px', background: 'rgba(232,177,74,0.06)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginBottom: '2px' }}>Best price · {best.shop_name}</div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '22px', fontWeight: 700, color: best.available ? 'var(--accent)' : 'var(--text-faint)' }}>
                  ${best.price_nzd.toFixed(2)} NZD
                </div>
              </div>
              {best.available && best.product_url && (
                <a href={best.product_url} target="_blank" rel="noopener noreferrer"
                  style={{ padding: '8px 16px', background: 'var(--accent)', color: '#0a1f22', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 700 }}>
                  Buy →
                </a>
              )}
            </div>
          )}
          <div>
            {prices.map((p, i) => {
              const cs = CONF_STYLE[p.confidence] ?? CONF_STYLE.none;
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                  alignItems: 'center', gap: '8px',
                  padding: '8px 14px',
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                  opacity: p.available ? 1 : 0.6,
                }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{p.shop_name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-faint)', marginLeft: '6px' }}>{p.condition}</span>
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                    background: cs.bg, border: `1px solid ${cs.border}`, color: cs.color,
                  }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: cs.dot, flexShrink: 0 }} />
                    {p.confidence}
                  </span>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px', fontWeight: 600,
                    color: 'var(--text)', textDecoration: p.available ? 'none' : 'line-through',
                  }}>
                    ${p.price_nzd.toFixed(2)}
                  </span>
                  <div style={{ width: '60px', textAlign: 'right' }}>
                    {p.available && p.product_url ? (
                      <a href={p.product_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}>
                        Buy →
                      </a>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Out of stock</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
