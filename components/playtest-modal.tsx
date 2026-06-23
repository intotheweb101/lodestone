'use client';

import { useState } from 'react';
import type { DeckEntry } from '@/lib/deck/model';
import { oddsOfDrawingByTurn } from '@/lib/deck/hypergeometric';

interface Props {
  entries: DeckEntry[];
  deckName: string;
  onClose: () => void;
}

function buildLibrary(entries: DeckEntry[]): string[] {
  return entries
    .filter(e => !e.board || e.board === 'main')
    .flatMap(e => Array.from({ length: e.quantity }, () => e.card_name));
}

function shuffled(arr: string[]): string[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function PlaytestModal({ entries, deckName, onClose }: Props) {
  const allCards = buildLibrary(entries);

  const [hand, setHand] = useState<string[]>(() => {
    const s = shuffled(allCards);
    return s.slice(0, 7);
  });
  const [library, setLibrary] = useState<string[]>(() => {
    const s = shuffled(allCards);
    return s.slice(7);
  });
  const [mulligans, setMulligans] = useState(0);
  const [turn, setTurn] = useState(1);
  const [tapped, setTapped] = useState<Set<number>>(new Set());
  const [showOdds, setShowOdds] = useState(false);
  const [oddsCopies, setOddsCopies] = useState(4);
  const [oddsMinCopies, setOddsMinCopies] = useState(1);

  function deal(n: number) {
    const s = shuffled(allCards);
    setHand(s.slice(0, n));
    setLibrary(s.slice(n));
    setTapped(new Set());
  }

  function newGame() {
    deal(7);
    setMulligans(0);
    setTurn(1);
  }

  function mulligan() {
    const next = Math.max(0, 7 - mulligans - 1);
    deal(next);
    setMulligans(m => m + 1);
  }

  function draw() {
    if (!library.length) return;
    setHand(h => [...h, library[0]]);
    setLibrary(l => l.slice(1));
  }

  function nextTurn() {
    draw();
    setTapped(new Set());
    setTurn(t => t + 1);
  }

  function toggleTap(i: number) {
    setTapped(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  const isLand = (name: string) =>
    /plains|island|swamp|mountain|forest|wastes|snow-covered|command tower|temple of|triome|tri-land/i.test(name);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(7,21,26,0.92)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: '#0f2a2c', border: '1px solid #1f4c4a', borderRadius: '14px',
        width: '100%', maxWidth: '820px', maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid #1f4c4a',
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
              Playtest — {deckName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", marginTop: '2px' }}>
              Turn {turn} · Hand {hand.length} · Library {library.length}
              {mulligans > 0 && ` · ${mulligans} mulligan${mulligans > 1 ? 's' : ''}`}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-faint)',
            fontSize: '18px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
          }}>✕</button>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex', gap: '8px', padding: '12px 20px',
          borderBottom: '1px solid #1f4c4a', flexWrap: 'wrap',
        }}>
          {[
            { label: '▶ New game', action: newGame },
            { label: `↩ Mulligan to ${Math.max(0, 7 - mulligans - 1)}`, action: mulligan, disabled: 7 - mulligans - 1 <= 0 },
            { label: '+ Draw', action: draw, disabled: library.length === 0 },
            { label: `→ End turn ${turn}`, action: nextTurn, disabled: library.length === 0 },
          ].map(({ label, action, disabled }) => (
            <button key={label} onClick={action} disabled={disabled}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                background: disabled ? '#0c2426' : 'rgba(232,177,74,0.12)',
                border: `1px solid ${disabled ? '#1f4c4a' : 'rgba(232,177,74,0.3)'}`,
                color: disabled ? 'var(--text-faint)' : 'var(--accent)',
                cursor: disabled ? 'default' : 'pointer',
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Hand */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{
            fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase',
            color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace",
            marginBottom: '10px',
          }}>
            Hand ({hand.length})
          </div>
          {hand.length === 0 ? (
            <div style={{ color: 'var(--text-faint)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
              No cards in hand
            </div>
          ) : (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '8px',
            }}>
              {hand.map((name, i) => {
                const land = isLand(name);
                const tap = tapped.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleTap(i)}
                    title={tap ? 'Click to untap' : 'Click to tap'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: tap
                        ? (land ? 'rgba(84,192,138,0.08)' : 'rgba(232,177,74,0.06)')
                        : (land ? 'rgba(84,192,138,0.15)' : 'rgba(232,177,74,0.12)'),
                      border: `1px solid ${tap ? '#1f4c4a' : (land ? 'rgba(84,192,138,0.4)' : 'rgba(232,177,74,0.35)')}`,
                      color: tap ? 'var(--text-faint)' : (land ? '#7fd6a6' : 'var(--accent)'),
                      fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer',
                      transform: tap ? 'rotate(3deg)' : 'none',
                      transition: 'all 0.15s ease',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      textAlign: 'left',
                      maxWidth: '160px',
                      opacity: tap ? 0.6 : 1,
                    }}>
                    {name}
                    {land && (
                      <span style={{ display: 'block', fontSize: '9px', marginTop: '2px', opacity: 0.7 }}>Land</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Deck stats */}
        <div style={{
          padding: '10px 20px 8px',
          display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center',
          borderTop: '1px solid #1f4c4a',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
            {allCards.length} cards
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
            {allCards.filter(c => isLand(c)).length} lands
          </div>
          {tapped.size > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {tapped.size} tapped
            </div>
          )}
          <button
            onClick={() => setShowOdds(v => !v)}
            style={{
              marginLeft: 'auto', fontSize: 11, background: showOdds ? 'var(--surface-3)' : 'none',
              border: '1px solid #1f4c4a', borderRadius: 6, color: 'var(--text-faint)',
              cursor: 'pointer', padding: '3px 10px', fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            Draw odds
          </button>
        </div>

        {/* Hypergeometric odds panel */}
        {showOdds && (
          <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #1f4c4a', background: '#081a1b' }}>
            <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
              Hypergeometric — Draw Odds
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', gap: 6, alignItems: 'center' }}>
                Copies in deck
                <input
                  type="number" min={1} max={allCards.length} value={oddsCopies}
                  onChange={e => setOddsCopies(Math.max(1, Math.min(allCards.length, parseInt(e.target.value) || 1)))}
                  style={{ width: 48, background: '#0e2426', border: '1px solid #1f4c4a', borderRadius: 5, color: 'var(--text)', padding: '3px 6px', fontSize: 12, outline: 'none' }}
                />
              </label>
              <label style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', gap: 6, alignItems: 'center' }}>
                Want at least
                <input
                  type="number" min={1} max={Math.min(oddsCopies, 4)} value={oddsMinCopies}
                  onChange={e => setOddsMinCopies(Math.max(1, Math.min(oddsCopies, parseInt(e.target.value) || 1)))}
                  style={{ width: 36, background: '#0e2426', border: '1px solid #1f4c4a', borderRadius: 5, color: 'var(--text)', padding: '3px 6px', fontSize: 12, outline: 'none' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 7, 10].map(t => {
                const pct = oddsOfDrawingByTurn({ librarySize: allCards.length, copiesInDeck: oddsCopies, minCopies: oddsMinCopies, turn: t }) * 100;
                return (
                  <div key={t} style={{ background: '#0e2426', border: '1px solid #1f4c4a', borderRadius: 8, padding: '8px 12px', minWidth: 56, textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : 'var(--text)' }}>
                      {pct.toFixed(0)}%
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>T{t}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
