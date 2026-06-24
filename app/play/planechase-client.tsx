'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Current plane */}
      {currentCard && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* Card image */}
          <div style={{ flexShrink: 0 }}>
            {currentCard.image_url ? (
              <img
                key={currentCard.scryfall_id}
                src={currentCard.image_url}
                alt={currentCard.name}
                style={{
                  width: 220, borderRadius: 10,
                  boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
                  display: 'block',
                  border: isPhenomenon(currentCard)
                    ? '2px solid #a48fe8'
                    : '2px solid rgba(232,177,74,0.4)',
                  animation: 'fadeSlideIn 0.4s ease',
                }}
              />
            ) : (
              <div style={{
                width: 220, aspectRatio: '1.4 / 1', borderRadius: 10,
                background: 'var(--surface)', border: '2px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-faint)', fontSize: 12, padding: 12, textAlign: 'center',
              }}>
                {currentCard.name}
              </div>
            )}
          </div>

          {/* Card info */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 10, ...mono, letterSpacing: '1.5px', textTransform: 'uppercase', color: isPhenomenon(currentCard) ? '#a48fe8' : 'var(--accent)', marginBottom: 4 }}>
              {currentCard.type_line}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 10, lineHeight: 1.2 }}>
              {currentCard.name}
            </div>

            {/* Oracle text */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
            }}>
              {currentCard.oracle_text}
            </div>

            {isPhenomenon(currentCard) && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#a48fe8', background: 'rgba(164,143,232,0.08)', borderRadius: 6, padding: '6px 10px' }}>
                Phenomenon — resolves immediately; planeswalk to the next plane.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Die + controls */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '18px 20px',
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        {/* Die face */}
        <div style={{
          width: 72, height: 72, borderRadius: 14,
          background: '#0a1e22',
          border: `2px solid ${phase === 'result' ? resultColor : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, color: phase === 'result' ? resultColor : 'var(--text-faint)',
          transition: 'border-color 0.15s, color 0.15s',
          userSelect: 'none',
          boxShadow: phase === 'result' ? `0 0 16px ${resultColor}44` : 'none',
        }}>
          {phase === 'rolling' ? DIE_ICONS[rollingFace] : (lastResult ? DIE_ICONS[lastResult] : '⬡')}
        </div>

        <div style={{ flex: 1 }}>
          {/* Result label */}
          {lastResult && phase === 'result' && (
            <div style={{ fontSize: 14, fontWeight: 700, color: resultColor, marginBottom: 4 }}>
              {DIE_LABELS[lastResult]}
            </div>
          )}
          {lastResult === 'blank' && phase === 'result' && (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>
              No effect this roll.
            </div>
          )}
          {lastResult === 'chaos' && phase === 'result' && (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>
              Trigger the chaos ability of {currentCard?.name}.
            </div>
          )}
          {lastResult === 'planeswalk' && phase === 'result' && (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>
              Moving to the next plane…
            </div>
          )}
          {phase === 'playing' && !lastResult && (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>
              Roll the planar die — or planeswalk for free on your turn.
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Planeswalk — primary action */}
            <button
              onClick={manualPlaneswalk}
              disabled={phase === 'rolling' || phase === 'result'}
              style={{
                padding: '10px 22px', borderRadius: 8,
                background: (phase === 'rolling' || phase === 'result') ? 'var(--surface-2)' : 'var(--accent)',
                color: (phase === 'rolling' || phase === 'result') ? 'var(--text-faint)' : '#0a1f22',
                border: 'none', cursor: (phase === 'rolling' || phase === 'result') ? 'default' : 'pointer',
                fontSize: 14, fontWeight: 700,
                fontFamily: "'IBM Plex Sans', sans-serif",
                transition: 'all 0.12s',
                opacity: (phase === 'rolling' || phase === 'result') ? 0.5 : 1,
              }}
            >
              ⟡ Planeswalk
            </button>

            {/* Roll die — secondary */}
            <button
              onClick={rollDieAction}
              disabled={phase !== 'playing'}
              style={{
                padding: '10px 18px', borderRadius: 8,
                background: 'var(--surface-2)',
                color: phase === 'playing' ? 'var(--text-muted)' : 'var(--text-faint)',
                border: '1px solid var(--border)', cursor: phase === 'playing' ? 'pointer' : 'default',
                fontSize: 13, fontWeight: 600,
                fontFamily: "'IBM Plex Sans', sans-serif",
                transition: 'all 0.12s',
                opacity: phase === 'playing' ? 1 : 0.4,
              }}
            >
              Roll die
            </button>

            {lastResult === 'chaos' && phase === 'result' && (
              <button
                onClick={dismissResult}
                style={{
                  padding: '10px 16px', borderRadius: 8,
                  background: 'rgba(224,91,60,0.12)', color: '#e05b3c',
                  border: '1px solid rgba(224,91,60,0.3)', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              >
                Chaos resolved ✓
              </button>
            )}

            <button
              onClick={resetGame}
              style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'transparent', color: 'var(--text-faint)',
                border: '1px solid var(--border)', cursor: 'pointer',
                fontSize: 12, fontFamily: "'IBM Plex Sans', sans-serif",
                marginLeft: 4,
              }}
            >
              Reset
            </button>
          </div>

          {/* Die legend */}
          <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {([['blank', '·', '4 faces — no effect'], ['chaos', '⊕', '1 face — chaos ability'], ['planeswalk', '⟡', '1 face — planeswalk']] as const).map(([key, icon, desc]) => (
              <span key={key} style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono',monospace", display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: DIE_COLORS[key] }}>{icon}</span> {desc}
              </span>
            ))}
          </div>
        </div>

        {/* Deck counter */}
        <div style={{ textAlign: 'center', minWidth: 60 }}>
          <div style={{ fontSize: 26, fontWeight: 700, ...mono, color: 'var(--accent)' }}>{remaining.length}</div>
          <div style={{ fontSize: 10, ...mono, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '1px' }}>planes left</div>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <details>
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
              <div key={`${c.scryfall_id}-${i}`} style={{ position: 'relative' }}>
                {c.image_url ? (
                  <img
                    src={c.image_url}
                    alt={c.name}
                    title={c.name}
                    style={{ width: 72, borderRadius: 5, opacity: 0.55, display: 'block',
                      border: isPhenomenon(c) ? '1px solid #a48fe840' : '1px solid rgba(232,177,74,0.2)' }}
                    loading="lazy"
                  />
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
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
