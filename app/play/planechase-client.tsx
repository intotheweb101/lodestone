'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

const PC_KEY = 'lodestone-planechase-state';

interface PersistedPlanechase {
  phase: GamePhase;
  currentCard: PlaneCard | null;
  remaining: PlaneCard[];
  history: PlaneCard[];
}

interface PlaneCard {
  scryfall_id: string;
  name: string;
  type_line: string;
  oracle_text: string;
  image_url: string | null;
}

type DieResult = 'blank' | 'chaos' | 'planeswalk';
type GamePhase = 'idle' | 'playing' | 'rolling' | 'result';

const DIE_FACES: DieResult[] = ['blank', 'blank', 'blank', 'blank', 'chaos', 'planeswalk'];

const DIE_ICONS: Record<DieResult, string> = {
  blank:      '·',
  chaos:      '⊕',
  planeswalk: '⟡',
};
const DIE_LABELS: Record<DieResult, string> = {
  blank:      'Nothing happens',
  chaos:      'Chaos ensues!',
  planeswalk: 'Planeswalk!',
};
const DIE_COLORS: Record<DieResult, string> = {
  blank:      '#7a8a8e',
  chaos:      '#e05b3c',
  planeswalk: '#e8b14a',
};

function rollDie(): DieResult {
  return DIE_FACES[Math.floor(Math.random() * 6)];
}

function isPhenomenon(card: PlaneCard) {
  return card.type_line === 'Phenomenon';
}

export function PlanechaseClient() {
  const [deck, setDeck] = useState<PlaneCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<GamePhase>('idle');
  const [currentCard, setCurrentCard] = useState<PlaneCard | null>(null);
  const [remaining, setRemaining] = useState<PlaneCard[]>([]);
  const [history, setHistory] = useState<PlaneCard[]>([]);
  const [lastResult, setLastResult] = useState<DieResult | null>(null);
  const [rollingFace, setRollingFace] = useState<DieResult>('blank');
  const rollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore persisted game state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PC_KEY);
      if (saved) {
        const s = JSON.parse(saved) as PersistedPlanechase;
        if (s.phase && s.phase !== 'idle') {
          setPhase(s.phase === 'rolling' ? 'playing' : s.phase);
          setCurrentCard(s.currentCard);
          setRemaining(s.remaining);
          setHistory(s.history);
        }
      }
    } catch { /* ignore parse errors */ }
  }, []);

  // Persist game state whenever it changes
  useEffect(() => {
    if (phase === 'rolling') return; // don't persist mid-roll transient state
    try {
      if (phase === 'idle') {
        localStorage.removeItem(PC_KEY);
      } else {
        const s: PersistedPlanechase = { phase, currentCard, remaining, history };
        localStorage.setItem(PC_KEY, JSON.stringify(s));
      }
    } catch { /* ignore quota errors */ }
  }, [phase, currentCard, remaining, history]);

  const mono = { fontFamily: "'IBM Plex Mono', monospace" } as const;

  useEffect(() => {
    setLoading(true);
    fetch('/api/planechase/deck')
      .then(r => r.json())
      .then((d: { cards: PlaneCard[] }) => {
        setDeck(d.cards);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load planar deck.'); setLoading(false); });
  }, []);

  function startGame() {
    if (deck.length === 0) return;
    const shuffled = [...deck].sort(() => Math.random() - 0.5);
    const [first, ...rest] = shuffled;
    setCurrentCard(first);
    setRemaining(rest);
    setHistory([]);
    setLastResult(null);
    setPhase('playing');
  }

  function resetGame() {
    setPhase('idle');
    setCurrentCard(null);
    setRemaining([]);
    setHistory([]);
    setLastResult(null);
    try { localStorage.removeItem(PC_KEY); } catch { /* ignore */ }
  }

  const doPlaneswalk = useCallback((fromCard: PlaneCard, fromRemaining: PlaneCard[]) => {
    if (fromRemaining.length === 0) {
      // Deck exhausted — reshuffle history + current
      const newDeck = [...fromRemaining, fromCard].sort(() => Math.random() - 0.5);
      const [next, ...rest] = newDeck;
      setHistory([]);
      setCurrentCard(next);
      setRemaining(rest);
    } else {
      const [next, ...rest] = fromRemaining;
      setHistory(h => [fromCard, ...h]);
      setCurrentCard(next);
      setRemaining(rest);

      // Phenomenon: resolve immediately and advance again
      if (isPhenomenon(next)) {
        setTimeout(() => {
          setHistory(h => [next, ...h]);
          const [afterPhenom, ...afterRest] = rest;
          setCurrentCard(afterPhenom ?? null);
          setRemaining(afterRest);
        }, 2200);
      }
    }
  }, []);

  function rollDieAction() {
    if (phase !== 'playing') return;
    setPhase('rolling');
    setLastResult(null);

    let ticks = 0;
    rollInterval.current = setInterval(() => {
      setRollingFace(DIE_FACES[Math.floor(Math.random() * 6)]);
      ticks++;
      if (ticks >= 14) {
        clearInterval(rollInterval.current!);
        const result = rollDie();
        setRollingFace(result);
        setLastResult(result);
        setPhase('result');

        if (result === 'blank') {
          // Auto-dismiss blank — no interaction needed
          setTimeout(() => {
            setPhase('playing');
            setLastResult(null);
          }, 1400);
        } else if (result === 'planeswalk' && currentCard) {
          setTimeout(() => {
            doPlaneswalk(currentCard, remaining);
            setPhase('playing');
            setLastResult(null);
          }, 1800);
        }
      }
    }, 80);
  }

  function manualPlaneswalk() {
    if (!currentCard) return;
    doPlaneswalk(currentCard, remaining);
    setPhase('playing');
    setLastResult(null);
  }

  function dismissResult() {
    setPhase('playing');
    setLastResult(null);
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-faint)', ...mono, fontSize: 13 }}>
        Loading planar deck…
      </div>
    );
  }
  if (error) {
    return <div style={{ padding: 24, color: '#e2645c', fontSize: 13 }}>{error}</div>;
  }

  // ── Idle / Start screen ───────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, paddingTop: 40 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, ...mono, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>
            Planechase
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>Planar Deck</h2>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', maxWidth: 360, textAlign: 'center', lineHeight: 1.6, margin: '0 auto 4px' }}>
            {deck.length} planes & phenomena shuffled and ready. Roll the planar die on your turn — blank does nothing, ⊕ triggers chaos, ⟡ planесwalks to the next plane.
          </p>
        </div>

        {/* Preview grid of plane images */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 560, opacity: 0.5 }}>
          {deck.slice(0, 6).map(c => (
            c.image_url ? (
              <img key={c.scryfall_id} src={c.image_url} alt={c.name} style={{ width: 80, borderRadius: 5, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }} loading="lazy" />
            ) : null
          ))}
        </div>

        <button
          onClick={startGame}
          style={{
            padding: '14px 36px', borderRadius: 10,
            background: 'var(--accent)', color: '#0a1f22',
            border: 'none', cursor: 'pointer',
            fontSize: 15, fontWeight: 700,
            fontFamily: "'IBM Plex Sans', sans-serif",
            letterSpacing: '-0.01em',
          }}
        >
          Start Planechase
        </button>
      </div>
    );
  }

  // ── In-game layout ────────────────────────────────────────────────────────
  const resultColor = lastResult ? DIE_COLORS[lastResult] : 'var(--accent)';
  const isPhenom = currentCard ? isPhenomenon(currentCard) : false;
  const accentBorder = isPhenom ? '2px solid #a48fe8' : '2px solid rgba(232,177,74,0.45)';

  return (
    <div className="pc-game">

      {/* ── Card zone ── */}
      {currentCard && (
        <div className="pc-card-zone">
          {/* Image */}
          <div className="pc-img-wrap">
            {currentCard.image_url ? (
              <img
                key={currentCard.scryfall_id}
                src={currentCard.image_url}
                alt={currentCard.name}
                className="pc-card-img"
                style={{ border: accentBorder }}
              />
            ) : (
              <div className="pc-card-placeholder">
                {currentCard.name}
              </div>
            )}
          </div>

          {/* Info panel — beside image on desktop, below on mobile */}
          <div className="pc-card-info">
            <div style={{ fontSize: 10, ...mono, letterSpacing: '1.5px', textTransform: 'uppercase', color: isPhenom ? '#a48fe8' : 'var(--accent)', marginBottom: 4 }}>
              {currentCard.type_line}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 10, lineHeight: 1.2 }}>
              {currentCard.name}
            </div>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
            }}>
              {currentCard.oracle_text}
            </div>
            {isPhenom && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#a48fe8', background: 'rgba(164,143,232,0.08)', borderRadius: 6, padding: '6px 10px' }}>
                Phenomenon — resolves immediately; planeswalk to the next plane.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Controls bar — sticky on mobile ── */}
      <div className="pc-controls">
        {/* Die */}
        <div className="pc-die" style={{
          border: `2px solid ${phase === 'result' ? resultColor : 'var(--border)'}`,
          color: phase === 'result' ? resultColor : 'var(--text-faint)',
          boxShadow: phase === 'result' ? `0 0 14px ${resultColor}44` : 'none',
        }}>
          {phase === 'rolling' ? DIE_ICONS[rollingFace] : (lastResult ? DIE_ICONS[lastResult] : '⬡')}
        </div>

        {/* Result + buttons */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Result label */}
          {lastResult && phase === 'result' && (
            <div style={{ fontSize: 13, fontWeight: 700, color: resultColor, marginBottom: 4, fontFamily: "'IBM Plex Sans',sans-serif" }}>
              {DIE_LABELS[lastResult]}
              {lastResult === 'chaos' && <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: 12 }}> — trigger {currentCard?.name}&apos;s chaos ability</span>}
              {lastResult === 'planeswalk' && <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: 12 }}> — moving…</span>}
            </div>
          )}

          <div className="pc-btn-row">
            {/* Planeswalk — primary */}
            <button
              className="pc-btn-primary"
              onClick={manualPlaneswalk}
              disabled={phase === 'rolling' || phase === 'result'}
              style={{ opacity: (phase === 'rolling' || phase === 'result') ? 0.45 : 1 }}
            >
              ⟡ Planeswalk
            </button>

            {/* Roll die */}
            <button
              className="pc-btn-secondary"
              onClick={rollDieAction}
              disabled={phase !== 'playing'}
              style={{ opacity: phase === 'playing' ? 1 : 0.4 }}
            >
              Roll die
            </button>

            {/* Chaos confirm */}
            {lastResult === 'chaos' && phase === 'result' && (
              <button className="pc-btn-chaos" onClick={dismissResult}>
                Chaos ✓
              </button>
            )}

            {/* Reset — small, trailing */}
            <button className="pc-btn-reset" onClick={resetGame}>Reset</button>
          </div>

          {/* Die legend — hidden on small mobile to save space */}
          <div className="pc-die-legend">
            {([['blank', '·', '4× blank'], ['chaos', '⊕', '1× chaos'], ['planeswalk', '⟡', '1× walk']] as const).map(([key, icon, desc]) => (
              <span key={key} style={{ color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ color: DIE_COLORS[key] }}>{icon}</span>{desc}
              </span>
            ))}
          </div>
        </div>

        {/* Deck counter */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, ...mono, color: 'var(--accent)', lineHeight: 1 }}>{remaining.length}</div>
          <div style={{ fontSize: 9, ...mono, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: 2 }}>left</div>
        </div>
      </div>

      {/* ── Visited planes ── */}
      {history.length > 0 && (
        <details className="pc-history">
          <summary style={{
            cursor: 'pointer', fontSize: 11, color: 'var(--text-faint)',
            ...mono, textTransform: 'uppercase', letterSpacing: '1px',
            listStyle: 'none', userSelect: 'none',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Visited planes ({history.length})
          </summary>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {history.map((c, i) => (
              <div key={`${c.scryfall_id}-${i}`}>
                {c.image_url ? (
                  <img src={c.image_url} alt={c.name} title={c.name} loading="lazy"
                    style={{ width: 72, borderRadius: 5, opacity: 0.55, display: 'block',
                      border: isPhenomenon(c) ? '1px solid #a48fe840' : '1px solid rgba(232,177,74,0.2)' }} />
                ) : (
                  <div style={{ width: 72, aspectRatio: '1.4/1', background: 'var(--surface)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'var(--text-faint)', padding: 4, textAlign: 'center', opacity: 0.55 }}>
                    {c.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <style>{`
        /* ── Planechase responsive layout ── */

        /* Mobile-first: card fills the screen */
        .pc-game {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .pc-card-zone {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 0;
        }
        .pc-img-wrap {
          width: 100%;
        }
        .pc-card-img {
          width: 100%;
          max-width: 100%;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.7);
          display: block;
          animation: fadeSlideIn 0.35s ease;
        }
        .pc-card-placeholder {
          width: 100%;
          aspect-ratio: 1.4 / 1;
          border-radius: 12px;
          background: var(--surface);
          border: 2px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-faint);
          font-size: 13px;
          padding: 16px;
          text-align: center;
        }
        .pc-card-info {
          padding: 4px 0 8px;
        }

        /* Controls bar: sticky to bottom of viewport on mobile */
        .pc-controls {
          position: sticky;
          bottom: 0;
          z-index: 10;
          background: var(--bg, #07151a);
          border-top: 1px solid var(--border);
          padding: 12px 0 max(12px, env(safe-area-inset-bottom));
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 8px;
        }
        .pc-die {
          width: 56px;
          height: 56px;
          flex-shrink: 0;
          border-radius: 12px;
          background: #0a1e22;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;
          user-select: none;
        }
        .pc-btn-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
          margin-bottom: 4px;
        }
        .pc-btn-primary {
          padding: 9px 16px;
          border-radius: 8px;
          background: var(--accent);
          color: #0a1f22;
          border: none;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          font-family: 'IBM Plex Sans', sans-serif;
          transition: opacity 0.12s;
          white-space: nowrap;
        }
        .pc-btn-primary:disabled { cursor: default; }
        .pc-btn-secondary {
          padding: 9px 14px;
          border-radius: 8px;
          background: var(--surface-2);
          color: var(--text-muted);
          border: 1px solid var(--border);
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          font-family: 'IBM Plex Sans', sans-serif;
          transition: opacity 0.12s;
          white-space: nowrap;
        }
        .pc-btn-secondary:disabled { cursor: default; }
        .pc-btn-chaos {
          padding: 9px 12px;
          border-radius: 8px;
          background: rgba(224,91,60,0.12);
          color: #e05b3c;
          border: 1px solid rgba(224,91,60,0.3);
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          font-family: 'IBM Plex Sans', sans-serif;
          white-space: nowrap;
        }
        .pc-btn-reset {
          padding: 9px 10px;
          border-radius: 8px;
          background: transparent;
          color: var(--text-faint);
          border: 1px solid var(--border);
          cursor: pointer;
          font-size: 11px;
          font-family: 'IBM Plex Sans', sans-serif;
        }
        .pc-die-legend {
          display: none;
        }
        .pc-history {
          margin-top: 8px;
        }

        /* ── Desktop (≥640px): side-by-side card + info, controls inline ── */
        @media (min-width: 640px) {
          .pc-game { gap: 20px; }
          .pc-card-zone {
            flex-direction: row;
            align-items: flex-start;
            gap: 20px;
            margin-bottom: 0;
          }
          .pc-img-wrap { width: 260px; flex-shrink: 0; }
          .pc-card-img { width: 260px; border-radius: 10px; }
          .pc-card-placeholder { width: 260px; }
          .pc-card-info { flex: 1; padding: 0; }
          .pc-controls {
            position: static;
            border-top: none;
            padding: 16px 18px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            margin-top: 0;
          }
          .pc-die { width: 64px; height: 64px; font-size: 30px; }
          .pc-btn-primary { font-size: 14px; padding: 10px 20px; }
          .pc-die-legend {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 4px;
          }
          .pc-history { margin-top: 0; }
        }

        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
