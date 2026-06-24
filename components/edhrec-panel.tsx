'use client';

import { useState, useEffect } from 'react';
import type { EdhrecCardData } from '@/lib/edhrec/client';

interface EdhrecPanelProps {
  oracleId: string;
  cardName: string;
  /** Called when user clicks "Add" on a synergy card. Card name is passed. */
  onAddCard?: (cardName: string) => void;
}

function SaltBar({ salt }: { salt: number }) {
  // Salt ranges: 0–0.5 low (green), 0.5–1.5 medium (amber), 1.5+ high (red)
  const pct = Math.min(100, (salt / 3) * 100);
  const color = salt < 0.5 ? '#54c08a' : salt < 1.5 ? '#e8b14a' : '#e2645c';
  const label = salt < 0.5 ? 'Low' : salt < 1.5 ? 'Medium' : 'High';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Salt score</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px', fontWeight: 700, color }}>
          {salt.toFixed(2)} <span style={{ fontSize: '11px', fontWeight: 400 }}>({label})</span>
        </span>
      </div>
      <div style={{ height: '5px', borderRadius: '3px', background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '3px' }}>
        How "unfun" other players find this card (0 = fine, 3 = oppressive)
      </div>
    </div>
  );
}

export function EdhrecPanel({ oracleId, cardName, onAddCard }: EdhrecPanelProps) {
  const [data, setData] = useState<EdhrecCardData | null | 'loading'>('loading');

  useEffect(() => {
    fetch(`/api/edhrec?oracleId=${encodeURIComponent(oracleId)}&cardName=${encodeURIComponent(cardName)}`)
      .then(r => r.json())
      .then((d: EdhrecCardData | null) => setData(d ?? null))
      .catch(() => setData(null));
  }, [oracleId, cardName]);

  if (data === 'loading') {
    return (
      <div style={{ padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-faint)', fontSize: '12px' }}>
        Loading EDHREC data…
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
        <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>EDHREC</div>
        <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: 0 }}>
          No EDHREC data found for this card.{' '}
          <a href={`https://edhrec.com/cards/${cardName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            View on EDHREC ↗
          </a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          EDHREC data
        </span>
        <a href={`https://edhrec.com/cards/${data.slug}`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace", textDecoration: 'none' }}>
          edhrec.com ↗
        </a>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Stats row */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {data.num_decks != null && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', minWidth: '90px' }}>
              <div style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>Decks</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
                {data.num_decks.toLocaleString()}
              </div>
            </div>
          )}
          {data.inclusion_pct != null && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', minWidth: '90px' }}>
              <div style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>Inclusion</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '16px', fontWeight: 700, color: 'var(--accent)' }}>
                {data.inclusion_pct.toFixed(1)}%
              </div>
            </div>
          )}
          {data.potential_decks != null && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', minWidth: '90px' }}>
              <div style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>Eligible</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '16px', fontWeight: 700, color: 'var(--text-muted)' }}>
                {data.potential_decks.toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* Salt bar */}
        {data.salt != null && <SaltBar salt={data.salt} />}

        {/* Top commanders */}
        {data.top_commanders.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Top commanders
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {data.top_commanders.slice(0, 6).map((c, i) => (
                <a key={i}
                  href={`/search?q=${encodeURIComponent(c.name)}`}
                  title={`${c.name} — ${c.num_decks.toLocaleString()} decks`}
                  style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '60px' }}>
                  {c.image ? (
                    <img src={c.image} alt={c.name} style={{ width: '60px', height: '42px', objectFit: 'cover', borderRadius: '5px', border: '1px solid var(--border)' }} />
                  ) : (
                    <div style={{ width: '60px', height: '42px', borderRadius: '5px', background: 'var(--surface-2)', border: '1px solid var(--border)' }} />
                  )}
                  <span style={{ fontSize: '9px', color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {c.name}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Synergy cards */}
        {data.synergy_cards.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
              High synergy cards
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {data.synergy_cards.slice(0, 10).map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  {c.image ? (
                    <img src={c.image} alt={c.name} style={{ width: '32px', height: '23px', objectFit: 'cover', borderRadius: '3px', border: '1px solid var(--border)', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '32px', height: '23px', borderRadius: '3px', background: 'var(--surface-2)', border: '1px solid var(--border)', flexShrink: 0 }} />
                  )}
                  <a href={`/search?q=${encodeURIComponent(c.name)}`} style={{ flex: 1, fontSize: '12px', color: 'var(--text)', textDecoration: 'none', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {c.name}
                  </a>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: c.synergy > 0 ? '#54c08a' : 'var(--text-faint)', flexShrink: 0 }}>
                    {c.synergy > 0 ? '+' : ''}{(c.synergy * 100).toFixed(0)}%
                  </span>
                  {onAddCard && (
                    <button
                      onClick={() => onAddCard(c.name)}
                      title={`Add ${c.name} to deck`}
                      style={{
                        padding: '2px 7px', fontSize: '10px', borderRadius: 4,
                        background: 'rgba(84,192,138,0.12)', border: '1px solid rgba(84,192,138,0.35)',
                        color: '#54c08a', cursor: 'pointer', flexShrink: 0, fontWeight: 600,
                      }}
                    >
                      + Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
