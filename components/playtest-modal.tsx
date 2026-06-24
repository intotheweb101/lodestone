'use client';

import { useState, useMemo } from 'react';
import type { DeckEntry } from '@/lib/deck/model';
import { oddsOfDrawingByTurn } from '@/lib/deck/hypergeometric';
import { actionLogGame } from '@/app/actions';
import type { GameResult } from '@/lib/games/store';

interface CardItem {
  name: string;
  isLand: boolean;
}

interface Props {
  entries: DeckEntry[];
  deckName: string;
  deckId: string;
  onClose: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const LAND_REGEX = /plains|island|swamp|mountain|forest|wastes|snow-covered|command tower|temple of|triome|tri-land/i;

function isLandEntry(entry: DeckEntry): boolean {
  if (entry.category === 'Lands') return true;
  return LAND_REGEX.test(entry.card_name);
}

function buildLibrary(entries: DeckEntry[]): CardItem[] {
  return entries
    .filter(e => !e.board || e.board === 'main')
    .flatMap(e => Array.from({ length: e.quantity }, () => ({
      name: e.card_name,
      isLand: isLandEntry(e),
    })));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Auto-bottom N cards from a 7-card hand using a simple heuristic:
 *  - If hand has > 4 lands → bottom excess lands first
 *  - Else if hand has < 2 lands → bottom excess spells (keep remaining lands)
 *  - Else → bottom last N (arbitrary)
 */
function autoBottom(hand: CardItem[], n: number): CardItem[] {
  if (n <= 0) return hand;
  const lands = hand.filter(c => c.isLand);
  const spells = hand.filter(c => !c.isLand);

  let toRemove: CardItem[];
  if (lands.length > 4) {
    // Flooded — bottom extra lands
    toRemove = lands.slice(0, n);
  } else if (lands.length < 2) {
    // Screwed — bottom excess spells
    toRemove = spells.slice(0, n);
  } else {
    // Balanced — bottom last N cards
    toRemove = hand.slice(-n);
  }

  const result = [...hand];
  for (const card of toRemove) {
    const idx = result.indexOf(card);
    if (idx !== -1) result.splice(idx, 1);
  }
  return result;
}

interface HandStats {
  landDistribution: number[]; // index = land count, value = probability
  pKeepable: number;          // P(2–4 lands in 7-card opener)
  avgLands: number;
}

/** Monte-Carlo over `iterations` 7-card openers. ~2ms for 1000 iterations. */
function computeHandStats(library: CardItem[], iterations = 1500): HandStats {
  if (!library.length) return { landDistribution: [], pKeepable: 0, avgLands: 0 };

  const counts = new Array(8).fill(0); // 0..7 lands
  for (let i = 0; i < iterations; i++) {
    const s = shuffle(library);
    const hand = s.slice(0, 7);
    const landCount = Math.min(7, hand.filter(c => c.isLand).length);
    counts[landCount]++;
  }

  const landDistribution = counts.map(c => c / iterations);
  const pKeepable = (counts[2] + counts[3] + counts[4]) / iterations;
  const avgLands = landDistribution.reduce((s, p, i) => s + p * i, 0);

  return { landDistribution, pKeepable, avgLands };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PlaytestModal({ entries, deckName, deckId, onClose }: Props) {
  const allCards = useMemo(() => buildLibrary(entries), [entries]);
  const handStats = useMemo(() => computeHandStats(allCards), [allCards]);

  const [hand, setHand] = useState<CardItem[]>(() => shuffle(allCards).slice(0, 7));
  const [library, setLibrary] = useState<CardItem[]>(() => shuffle(allCards).slice(7));
  const [mulligans, setMulligans] = useState(0);
  const [turn, setTurn] = useState(1);
  const [tapped, setTapped] = useState<Set<number>>(new Set());
  const [showOdds, setShowOdds] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [oddsCopies, setOddsCopies] = useState(4);
  const [oddsMinCopies, setOddsMinCopies] = useState(1);

  // Logging
  const [logResult, setLogResult] = useState<GameResult | null>(null);
  const [logTurns, setLogTurns] = useState<string>('');
  const [logOpponent, setLogOpponent] = useState('');
  const [logArchetype, setLogArchetype] = useState('');
  const [logPending, setLogPending] = useState(false);
  const [logSent, setLogSent] = useState(false);

  function deal(n: number, muls = mulligans) {
    const s = shuffle(allCards);
    const raw7 = s.slice(0, 7);
    const hand = muls > 0 ? autoBottom(raw7, muls) : raw7;
    setHand(hand);
    setLibrary(s.slice(7));
    setTapped(new Set());
  }

  function newGame() {
    deal(7, 0);
    setMulligans(0);
    setTurn(1);
    setLogResult(null);
    setLogSent(false);
    setLogTurns('');
    setLogOpponent('');
    setLogArchetype('');
  }

  function mulligan() {
    const nextMuls = mulligans + 1;
    const nextHandSize = Math.max(0, 7 - nextMuls);
    if (nextHandSize === 0) return;
    setMulligans(nextMuls);
    deal(nextHandSize, nextMuls);
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

  async function handleLogGame() {
    if (!logResult) return;
    setLogPending(true);
    try {
      await actionLogGame(deckId, {
        result: logResult,
        turns: logTurns ? parseInt(logTurns, 10) : undefined,
        opponent: logOpponent || undefined,
        opponentArchetype: logArchetype || undefined,
      });
      setLogSent(true);
    } catch {}
    setLogPending(false);
  }

  const landCount = hand.filter(c => c.isLand).length;
  const deckLandCount = allCards.filter(c => c.isLand).length;
  const nextHandSize = Math.max(0, 7 - mulligans - 1);

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
              {mulligans > 0 && ` (London — auto-bottomed ${mulligans})`}
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
            { label: `↩ Mulligan to ${nextHandSize}`, action: mulligan, disabled: nextHandSize <= 0 },
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
            Hand ({hand.length}) · {landCount} land{landCount !== 1 ? 's' : ''}
            {landCount < 2 && <span style={{ color: '#e2645c', marginLeft: 8 }}>⚠ land-light</span>}
            {landCount > 4 && <span style={{ color: '#e09a3a', marginLeft: 8 }}>⚠ flooded</span>}
          </div>
          {hand.length === 0 ? (
            <div style={{ color: 'var(--text-faint)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
              No cards in hand
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {hand.map((card, i) => {
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
                        ? (card.isLand ? 'rgba(84,192,138,0.08)' : 'rgba(232,177,74,0.06)')
                        : (card.isLand ? 'rgba(84,192,138,0.15)' : 'rgba(232,177,74,0.12)'),
                      border: `1px solid ${tap ? '#1f4c4a' : (card.isLand ? 'rgba(84,192,138,0.4)' : 'rgba(232,177,74,0.35)')}`,
                      color: tap ? 'var(--text-faint)' : (card.isLand ? '#7fd6a6' : 'var(--accent)'),
                      fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer',
                      transform: tap ? 'rotate(3deg)' : 'none',
                      transition: 'all 0.15s ease',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      textAlign: 'left',
                      maxWidth: '160px',
                      opacity: tap ? 0.6 : 1,
                    }}>
                    {card.name}
                    {card.isLand && <span style={{ display: 'block', fontSize: '9px', marginTop: '2px', opacity: 0.7 }}>Land</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div style={{
          padding: '10px 20px 8px',
          display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center',
          borderTop: '1px solid #1f4c4a',
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
            {allCards.length} cards · {deckLandCount} lands ({Math.round(deckLandCount / allCards.length * 100)}%)
          </div>
          {tapped.size > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {tapped.size} tapped
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button onClick={() => { setShowStats(v => !v); setShowOdds(false); }}
              style={{ fontSize: 11, background: showStats ? 'var(--surface-3)' : 'none', border: '1px solid #1f4c4a', borderRadius: 6, color: 'var(--text-faint)', cursor: 'pointer', padding: '3px 10px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
              Opening stats
            </button>
            <button onClick={() => { setShowOdds(v => !v); setShowStats(false); }}
              style={{ fontSize: 11, background: showOdds ? 'var(--surface-3)' : 'none', border: '1px solid #1f4c4a', borderRadius: 6, color: 'var(--text-faint)', cursor: 'pointer', padding: '3px 10px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
              Draw odds
            </button>
          </div>
        </div>

        {/* Opening-hand statistics (Monte-Carlo) */}
        {showStats && (
          <div style={{ padding: '14px 20px 16px', borderTop: '1px solid #1f4c4a', background: '#081a1b' }}>
            <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>
              Opening Hand Statistics (1500 simulated openers)
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>Avg lands in opener</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--accent)' }}>
                  {handStats.avgLands.toFixed(1)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>P(keepable: 2–4 lands)</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: handStats.pKeepable >= 0.6 ? '#7fd6a6' : handStats.pKeepable >= 0.4 ? 'var(--accent)' : '#e2645c' }}>
                  {(handStats.pKeepable * 100).toFixed(0)}%
                </div>
              </div>
            </div>
            {/* Land distribution bars */}
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>Land count distribution</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 48 }}>
              {handStats.landDistribution.slice(0, 8).map((p, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{
                    width: '100%', borderRadius: 3,
                    height: Math.max(2, p * 44),
                    background: (i >= 2 && i <= 4) ? '#54c08a' : i === 0 || i >= 5 ? '#e2645c' : '#e0913a',
                    opacity: 0.8,
                  }} />
                  <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono',monospace" }}>{i}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>
              Green = keepable (2–4) · Orange = marginal · Red = unkeepable
            </div>
          </div>
        )}

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

        {/* Log goldfish game */}
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #1f4c4a', background: '#081a1b' }}>
          <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
            Log this game
          </div>
          {logSent ? (
            <div style={{ fontSize: 13, color: '#7fd6a6' }}>✓ Game logged — it will appear in your Games tab.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['win', 'loss', 'draw'] as GameResult[]).map(r => (
                  <button key={r} onClick={() => setLogResult(r)} style={{
                    padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    background: logResult === r ? (r === 'win' ? 'rgba(84,192,138,0.2)' : r === 'loss' ? 'rgba(226,100,92,0.2)' : 'rgba(232,177,74,0.15)') : '#0c2426',
                    border: `1px solid ${logResult === r ? (r === 'win' ? '#54c08a' : r === 'loss' ? '#e2645c' : 'var(--accent)') : '#1f4c4a'}`,
                    color: logResult === r ? (r === 'win' ? '#7fd6a6' : r === 'loss' ? '#e2645c' : 'var(--accent)') : 'var(--text-faint)',
                  }}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input type="number" min={1} placeholder={`Turns (${turn})`} value={logTurns}
                  onChange={e => setLogTurns(e.target.value)}
                  style={{ width: 90, background: '#0e2426', border: '1px solid #1f4c4a', borderRadius: 6, color: 'var(--text)', padding: '5px 8px', fontSize: 12, outline: 'none' }} />
                <input type="text" placeholder="Opponent name (optional)" value={logOpponent}
                  onChange={e => setLogOpponent(e.target.value)}
                  style={{ flex: 1, minWidth: 120, background: '#0e2426', border: '1px solid #1f4c4a', borderRadius: 6, color: 'var(--text)', padding: '5px 8px', fontSize: 12, outline: 'none', fontFamily: "'IBM Plex Sans',sans-serif" }} />
                <input type="text" placeholder="Archetype (optional)" value={logArchetype}
                  onChange={e => setLogArchetype(e.target.value)}
                  style={{ flex: 1, minWidth: 120, background: '#0e2426', border: '1px solid #1f4c4a', borderRadius: 6, color: 'var(--text)', padding: '5px 8px', fontSize: 12, outline: 'none', fontFamily: "'IBM Plex Sans',sans-serif" }} />
              </div>
              <button onClick={handleLogGame} disabled={!logResult || logPending} style={{
                alignSelf: 'flex-start', padding: '7px 18px', borderRadius: 8,
                background: logResult ? 'var(--accent)' : '#0c2426',
                color: logResult ? '#0a1f22' : 'var(--text-faint)',
                border: 'none', cursor: !logResult || logPending ? 'default' : 'pointer',
                fontSize: 13, fontWeight: 700, fontFamily: "'IBM Plex Sans',sans-serif",
                opacity: !logResult || logPending ? 0.5 : 1,
              }}>
                {logPending ? 'Logging…' : 'Log game'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
