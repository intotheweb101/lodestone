'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { actionListDecks, actionAddCard } from '@/app/actions';

const FORMAT_COLOR: Record<string, string> = {
  commander: '#e8b14a', standard: '#54c08a', modern: '#a9def9',
  pioneer: '#c4a8f0', legacy: '#e2645c', pauper: '#a9c0ba',
};

interface Deck { id: string; name: string; format: string }

interface Props {
  oracleId: string;
  scryfallId: string | null;
  cardName: string;
}

export function AddToDeckButton({ oracleId, scryfallId, cardName }: Props) {
  const [open, setOpen] = useState(false);
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [added, setAdded] = useState<string | null>(null); // deckId last added to
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Load decks lazily on first open
  useEffect(() => {
    if (open && decks === null) {
      actionListDecks().then(d => setDecks(d as Deck[])).catch(() => setDecks([]));
    }
  }, [open, decks]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function addToDeck(deckId: string) {
    startTransition(async () => {
      await actionAddCard(deckId, { oracle_id: oracleId, scryfall_id: scryfallId, card_name: cardName });
      setAdded(deckId);
      setTimeout(() => { setAdded(null); setOpen(false); }, 1400);
    });
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '7px 14px', borderRadius: 8,
          background: open ? 'rgba(232,177,74,0.12)' : 'var(--surface)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          color: open ? 'var(--accent)' : 'var(--text)',
          cursor: 'pointer', fontSize: 12, fontWeight: 600,
          fontFamily: "'IBM Plex Sans', sans-serif",
          display: 'flex', alignItems: 'center', gap: 6,
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        Add to deck
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, minWidth: 220, maxWidth: 280,
          boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '8px 12px 6px',
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
            color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase',
            borderBottom: '1px solid var(--border)',
          }}>
            Add to deck
          </div>

          {decks === null ? (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
              Loading…
            </div>
          ) : decks.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-faint)' }}>
              No decks yet.{' '}
              <a href="/decks" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Create one →</a>
            </div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {decks.map(deck => {
                const isAdded = added === deck.id;
                const color = FORMAT_COLOR[deck.format] ?? '#a9c0ba';
                return (
                  <button
                    key={deck.id}
                    onClick={() => !isAdded && addToDeck(deck.id)}
                    disabled={isPending}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                      padding: '8px 12px', background: isAdded ? 'rgba(84,192,138,0.08)' : 'transparent',
                      border: 'none', textAlign: 'left', cursor: isPending ? 'wait' : 'pointer',
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { if (!isAdded) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={e => { if (!isAdded) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Format dot */}
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />

                    {/* Deck name */}
                    <span style={{
                      flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                    }}>
                      {deck.name}
                    </span>

                    {/* Confirmation tick or format badge */}
                    {isAdded ? (
                      <span style={{ fontSize: 11, color: '#54c08a', fontWeight: 700, flexShrink: 0 }}>✓ Added</span>
                    ) : (
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 3,
                        background: `${color}1a`, color, border: `1px solid ${color}44`,
                        fontFamily: "'IBM Plex Mono', monospace", textTransform: 'capitalize', flexShrink: 0,
                      }}>
                        {deck.format}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
