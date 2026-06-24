'use client';

import { useState, useEffect } from 'react';
import type { BracketResult } from '@/lib/commander-spellbook/labels';
import { BRACKET_LABELS } from '@/lib/commander-spellbook/labels';

interface BracketBadgeProps {
  deckId: string;
  /** If already fetched (e.g. server-side), pass it directly */
  initial?: BracketResult | null;
  compact?: boolean;
}

export function BracketBadge({ deckId, initial, compact }: BracketBadgeProps) {
  const [data, setData] = useState<BracketResult | null | 'loading'>(
    initial !== undefined ? initial : 'loading'
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (initial !== undefined) return; // already provided
    fetch(`/api/deck/${deckId}/bracket`)
      .then(r => r.ok ? r.json() : null)
      .then((d: BracketResult | null) => setData(d))
      .catch(() => setData(null));
  }, [deckId, initial]);

  if (data === 'loading') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: compact ? '2px 7px' : '3px 10px',
        borderRadius: 20, fontSize: compact ? 11 : 12, fontWeight: 600,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace",
        cursor: 'default',
      }}>
        ⚡ …
      </span>
    );
  }

  if (!data) return null;

  const info = BRACKET_LABELS[data.bracketTag] ?? { num: data.bracketNum, label: data.bracketLabel, color: data.bracketColor, desc: data.bracketDesc };

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title={`Power level: ${info.label} — click for details`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: compact ? '2px 7px' : '3px 10px',
          borderRadius: 20, fontSize: compact ? 11 : 12, fontWeight: 700,
          background: `${info.color}18`,
          border: `1px solid ${info.color}55`,
          color: info.color,
          cursor: 'pointer',
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        ⚡ {info.num} · {info.label}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 6,
            width: 260, background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            zIndex: 200, padding: '12px 14px',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: info.color }}>
              Bracket {info.num} — {info.label}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: 14 }}>×</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
            {info.desc}
          </p>

          {data.reasons.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>Reasons</div>
              {data.reasons.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: info.color }}>•</span> {r}
                </div>
              ))}
            </div>
          )}

          {/* Notable cards */}
          {data.cards.filter(c => c.gameChanger || c.massLandDenial || c.extraTurn).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 5 }}>Notable cards</div>
              {data.cards
                .filter(c => c.gameChanger || c.massLandDenial || c.extraTurn)
                .slice(0, 8)
                .map((c, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text)', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: info.color, background: `${info.color}22`, borderRadius: 3, padding: '1px 4px' }}>
                      {c.gameChanger ? 'GC' : c.massLandDenial ? 'MLD' : c.extraTurn ? 'ET' : ''}
                    </span>
                    {c.name}
                  </div>
                ))
              }
            </div>
          )}

          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-faint)' }}>
            Estimated by Commander Spellbook
          </div>
        </div>
      )}
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setOpen(false)} />}
    </span>
  );
}
