'use client';
import { useState, useTransition } from 'react';
import { actionEstimateBracket } from './actions';
import type { BracketResult } from '@/lib/commander-spellbook/labels';

const PLACEHOLDER = `1 Thassa's Oracle *
1 Demonic Consultation
1 Cyclonic Rift
1 Counterspell
...rest of deck`;

const NOTABLE_FLAGS = ['gameChanger', 'massLandDenial', 'extraTurn', 'banned'] as const;
type NotableFlag = typeof NOTABLE_FLAGS[number];

const FLAG_LABELS: Record<NotableFlag, string> = {
  gameChanger: 'Game Changer',
  massLandDenial: 'Mass Land Denial',
  extraTurn: 'Extra Turn',
  banned: 'Banned',
};

const FLAG_COLORS: Record<NotableFlag, string> = {
  gameChanger: '#e8b14a',
  massLandDenial: '#e05b3c',
  extraTurn: '#9b8fba',
  banned: '#e2645c',
};

export function BracketCalcClient() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<BracketResult | null | 'error'>(null);
  const [isPending, startTransition] = useTransition();

  function calculate() {
    if (!text.trim() || isPending) return;
    setResult(null);
    startTransition(async () => {
      try {
        const r = await actionEstimateBracket(text);
        setResult(r ?? 'error');
      } catch {
        setResult('error');
      }
    });
  }

  function reset() {
    setText('');
    setResult(null);
  }

  const mono = { fontFamily: "'IBM Plex Mono', monospace" } as const;
  const notableCards = result && result !== 'error'
    ? result.cards.filter(c => NOTABLE_FLAGS.some(f => c[f]))
    : [];

  return (
    <div style={{ maxWidth: 720 }}>
      {result === null || result === 'error' ? (
        <>
          {result === 'error' && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'rgba(226,100,92,0.1)', border: '1px solid rgba(226,100,92,0.3)',
              borderRadius: 8, fontSize: 13, color: '#e2645c',
            }}>
              Could not estimate bracket. Check your list format and try again.
            </div>
          )}

          <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-faint)' }}>
            Paste a Commander decklist in Arena/MTGO format. Mark your commander with{' '}
            <code style={{ ...mono, background: 'var(--surface)', padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>*</code>
            {' '}at the end of the line (optional).
          </div>

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={14}
            disabled={isPending}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px',
              color: 'var(--text)', fontSize: 13,
              ...mono,
              resize: 'vertical', outline: 'none', lineHeight: 1.7,
              opacity: isPending ? 0.6 : 1,
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <button
              onClick={calculate}
              disabled={!text.trim() || isPending}
              style={{
                padding: '9px 22px', borderRadius: 9, fontSize: 13.5, fontWeight: 700,
                cursor: text.trim() && !isPending ? 'pointer' : 'not-allowed',
                background: text.trim() && !isPending ? 'var(--accent)' : 'var(--surface)',
                border: `1px solid ${text.trim() && !isPending ? 'var(--accent)' : 'var(--border)'}`,
                color: text.trim() && !isPending ? '#0a1f22' : 'var(--text-faint)',
                fontFamily: "'IBM Plex Sans', sans-serif",
                transition: 'all 0.12s',
              }}
            >
              {isPending ? 'Checking…' : 'Estimate Bracket'}
            </button>
            {isPending && (
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                Checking with Commander Spellbook…
              </span>
            )}
          </div>
        </>
      ) : (
        <div>
          {/* Bracket result card */}
          <div style={{
            background: 'var(--surface)', border: `1px solid ${result.bracketColor}44`,
            borderRadius: 14, padding: '24px 28px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              {/* Big number */}
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: `${result.bracketColor}22`,
                border: `3px solid ${result.bracketColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{ ...mono, fontSize: 32, fontWeight: 900, color: result.bracketColor }}>
                  {result.bracketNum}
                </span>
              </div>

              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: result.bracketColor, letterSpacing: '-0.02em' }}>
                  {result.bracketLabel}
                </div>
                {result.bracketDesc && (
                  <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.5 }}>
                    {result.bracketDesc}
                  </div>
                )}
              </div>
            </div>

            {/* Reasons */}
            {result.reasons.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.reasons.map((r, i) => (
                  <span key={i} style={{
                    padding: '4px 12px', borderRadius: 6,
                    background: `${result.bracketColor}18`,
                    border: `1px solid ${result.bracketColor}44`,
                    fontSize: 12, fontWeight: 600, color: result.bracketColor,
                    ...mono,
                  }}>
                    {r}
                  </span>
                ))}
              </div>
            )}

            {result.reasons.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>
                No bracket concerns found — this deck is Bracket 1 or 2.
              </div>
            )}
          </div>

          {/* Notable cards grid */}
          {notableCards.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...mono, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 12 }}>
                Notable cards ({notableCards.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {notableCards.map((card, i) => {
                  const flag = NOTABLE_FLAGS.find(f => card[f]);
                  const flagColor = flag ? FLAG_COLORS[flag] : 'var(--accent)';
                  const flagLabel = flag ? FLAG_LABELS[flag] : '';
                  return (
                    <div key={i} title={card.name} style={{ position: 'relative', width: 68, flexShrink: 0 }}>
                      {card.image ? (
                        <img
                          src={card.image}
                          alt={card.name}
                          style={{ width: '100%', borderRadius: 5, display: 'block', border: `1px solid ${flagColor}66` }}
                        />
                      ) : (
                        <div style={{
                          width: '100%', aspectRatio: '0.717',
                          background: 'var(--surface)', border: `1px solid ${flagColor}44`,
                          borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8, color: 'var(--text-faint)', textAlign: 'center', padding: 4,
                        }}>
                          {card.name}
                        </div>
                      )}
                      {flagLabel && (
                        <div style={{
                          position: 'absolute', bottom: 3, left: 2, right: 2,
                          background: `${flagColor}ee`, borderRadius: 3,
                          fontSize: 7, fontWeight: 700, color: '#0a1f22',
                          textAlign: 'center', padding: '1px 2px',
                          ...mono,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {flagLabel}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={reset}
            style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text-faint)',
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            ← Try another list
          </button>
        </div>
      )}
    </div>
  );
}
