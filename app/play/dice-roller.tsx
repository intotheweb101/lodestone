'use client';
import { useState, useRef, useEffect } from 'react';

const PRESETS = [4, 6, 8, 10, 12, 20, 100];
const DICE_HISTORY_KEY = 'lodestone-dice-history';

interface RollResult {
  faces: number[];
  sides: number;
  modifier: number;
  total: number;
}

function rollDie(sides: number) {
  return Math.floor(Math.random() * sides) + 1;
}

// ── Dice roller ────────────────────────────────────────────────────────────────
export function DiceRoller() {
  const [sides, setSides] = useState(20);
  const [customSides, setCustomSides] = useState('');
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [animFaces, setAnimFaces] = useState<number[] | null>(null);
  const [result, setResult] = useState<RollResult | null>(null);
  const [history, setHistory] = useState<RollResult[]>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(DICE_HISTORY_KEY) : null;
      return saved ? (JSON.parse(saved) as RollResult[]) : [];
    } catch { return []; }
  });
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try { localStorage.setItem(DICE_HISTORY_KEY, JSON.stringify(history)); } catch { /* ignore */ }
  }, [history]);

  const effectiveSides = customSides ? Math.max(2, parseInt(customSides) || 6) : sides;

  function roll() {
    if (tickRef.current) clearInterval(tickRef.current);
    let ticks = 0;
    const totalTicks = 10;
    setResult(null);
    tickRef.current = setInterval(() => {
      setAnimFaces(Array.from({ length: count }, () => rollDie(effectiveSides)));
      ticks++;
      if (ticks >= totalTicks) {
        clearInterval(tickRef.current!);
        tickRef.current = null;
        const faces = Array.from({ length: count }, () => rollDie(effectiveSides));
        const total = faces.reduce((s, f) => s + f, 0) + modifier;
        const r: RollResult = { faces, sides: effectiveSides, modifier, total };
        setAnimFaces(null);
        setResult(r);
        setHistory(h => [r, ...h].slice(0, 8));
      }
    }, 60);
  }

  const displayFaces = animFaces ?? result?.faces ?? null;

  const mono = "'IBM Plex Mono', monospace";
  const sans = "'IBM Plex Sans', sans-serif";
  const chip = (active: boolean, onClick: () => void, label: string | number) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', fontFamily: mono,
        background: active ? 'rgba(232,177,74,0.15)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${active ? 'rgba(232,177,74,0.5)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? '#e8b14a' : 'rgba(255,255,255,0.5)',
      }}
    >
      d{label}
    </button>
  );

  return (
    <div style={{ fontFamily: sans }}>
      {/* Die presets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {PRESETS.map(s => chip(!customSides && sides === s, () => { setSides(s); setCustomSides(''); }, s))}
        <input
          value={customSides}
          onChange={e => { setCustomSides(e.target.value.replace(/\D/g, '')); }}
          placeholder="dX"
          style={{
            width: 46, padding: '5px 8px', borderRadius: 7, fontSize: 12,
            background: customSides ? 'rgba(232,177,74,0.12)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${customSides ? 'rgba(232,177,74,0.5)' : 'rgba(255,255,255,0.12)'}`,
            color: customSides ? '#e8b14a' : 'rgba(255,255,255,0.4)',
            fontFamily: mono, outline: 'none',
          }}
        />
      </div>

      {/* Count + modifier */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: mono, letterSpacing: 1 }}>COUNT</span>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setCount(n)} style={{
              width: 26, height: 26, borderRadius: 6, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: mono,
              background: count === n ? 'rgba(232,177,74,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${count === n ? 'rgba(232,177,74,0.4)' : 'rgba(255,255,255,0.1)'}`,
              color: count === n ? '#e8b14a' : 'rgba(255,255,255,0.4)',
            }}>{n}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: mono, letterSpacing: 1 }}>MOD</span>
          <button onClick={() => setModifier(m => m - 1)} style={smBtn}>−</button>
          <span style={{ minWidth: 26, textAlign: 'center', fontSize: 13, fontWeight: 700, color: modifier === 0 ? 'rgba(255,255,255,0.4)' : modifier > 0 ? '#48c8a0' : '#e87a6b', fontFamily: mono }}>{modifier > 0 ? `+${modifier}` : modifier}</span>
          <button onClick={() => setModifier(m => m + 1)} style={smBtn}>+</button>
        </div>
      </div>

      {/* Roll button */}
      <button
        onClick={roll}
        style={{
          width: '100%', padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
          cursor: 'pointer', fontFamily: mono, letterSpacing: 1,
          background: 'rgba(232,177,74,0.15)', border: '1px solid rgba(232,177,74,0.5)',
          color: '#e8b14a', transition: 'all 0.1s',
        }}
      >
        🎲 Roll {count > 1 ? `${count}d${effectiveSides}` : `d${effectiveSides}`}{modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ''}
      </button>

      {/* Result */}
      {displayFaces && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            {displayFaces.map((f, i) => (
              <div key={i} style={{
                minWidth: 44, height: 44, borderRadius: 10,
                background: animFaces ? 'rgba(232,177,74,0.08)' : 'rgba(232,177,74,0.15)',
                border: '1px solid rgba(232,177,74,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 800, color: '#e8b14a', fontFamily: mono,
              }}>{f}</div>
            ))}
          </div>
          {result && (
            <div style={{ fontSize: 28, fontWeight: 800, color: '#eef3f0', fontFamily: mono, lineHeight: 1 }}>
              {result.total}
              {result.modifier !== 0 && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginLeft: 5 }}>({result.faces.reduce((s,f)=>s+f,0)}{result.modifier>0?'+'+result.modifier:result.modifier})</span>}
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: mono, letterSpacing: 1, marginBottom: 5 }}>RECENT</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {history.map((r, i) => (
              <span key={i} style={{ fontSize: 11, fontFamily: mono, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '2px 7px' }}>
                {r.faces.length > 1 ? `${r.faces.length}×` : ''}d{r.sides}{r.modifier !== 0 ? (r.modifier > 0 ? `+${r.modifier}` : r.modifier) : ''} = {r.total}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Coin flip ─────────────────────────────────────────────────────────────────
export function CoinFlip() {
  const [result, setResult] = useState<'heads' | 'tails' | null>(null);
  const [flipping, setFlipping] = useState(false);
  const mono = "'IBM Plex Mono', monospace";

  function flip() {
    setFlipping(true);
    setResult(null);
    setTimeout(() => {
      setResult(Math.random() < 0.5 ? 'heads' : 'tails');
      setFlipping(false);
    }, 500);
  }

  return (
    <div style={{ textAlign: 'center', fontFamily: mono }}>
      <button onClick={flip} disabled={flipping} style={{
        width: '100%', padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
        cursor: flipping ? 'wait' : 'pointer',
        background: 'rgba(232,177,74,0.15)', border: '1px solid rgba(232,177,74,0.5)',
        color: '#e8b14a', marginBottom: 12,
      }}>
        🪙 Flip
      </button>
      {flipping && <div style={{ fontSize: 40, animation: 'spin 0.5s linear' }}>🪙</div>}
      {result && !flipping && (
        <div>
          <div style={{ fontSize: 36, marginBottom: 4 }}>{result === 'heads' ? '👑' : '⚔️'}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#e8b14a', letterSpacing: 2 }}>{result.toUpperCase()}</div>
        </div>
      )}
    </div>
  );
}

// ── First player ───────────────────────────────────────────────────────────────
export function FirstPlayer() {
  const [playerCount, setPlayerCount] = useState(4);
  const [winner, setWinner] = useState<number | null>(null);
  const [animIdx, setAnimIdx] = useState<number | null>(null);
  const mono = "'IBM Plex Mono', monospace";
  const tickRef2 = useRef<ReturnType<typeof setInterval> | null>(null);

  function pick() {
    if (tickRef2.current) clearInterval(tickRef2.current);
    setWinner(null);
    let ticks = 0;
    tickRef2.current = setInterval(() => {
      setAnimIdx(Math.floor(Math.random() * playerCount));
      ticks++;
      if (ticks >= 14) {
        clearInterval(tickRef2.current!);
        tickRef2.current = null;
        const w = Math.floor(Math.random() * playerCount);
        setAnimIdx(null);
        setWinner(w);
      }
    }, 70);
  }

  return (
    <div style={{ fontFamily: mono }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>PLAYERS</span>
        {[2,3,4,5,6].map(n => (
          <button key={n} onClick={() => { setPlayerCount(n); setWinner(null); }} style={{
            width: 26, height: 26, borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: playerCount === n ? 'rgba(232,177,74,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${playerCount === n ? 'rgba(232,177,74,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: playerCount === n ? '#e8b14a' : 'rgba(255,255,255,0.4)',
          }}>{n}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
        {Array.from({ length: playerCount }, (_, i) => {
          const isWinner = winner === i;
          const isAnim = animIdx === i;
          return (
            <div key={i} style={{
              padding: '8px 6px', borderRadius: 8, textAlign: 'center',
              fontSize: 12, fontWeight: 700,
              background: isWinner ? 'rgba(232,177,74,0.2)' : isAnim ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isWinner ? 'rgba(232,177,74,0.6)' : 'rgba(255,255,255,0.08)'}`,
              color: isWinner ? '#e8b14a' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.05s',
            }}>
              P{i + 1}
            </div>
          );
        })}
      </div>
      <button onClick={pick} style={{
        width: '100%', padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
        cursor: 'pointer',
        background: 'rgba(232,177,74,0.15)', border: '1px solid rgba(232,177,74,0.5)',
        color: '#e8b14a',
      }}>
        🎯 Pick First Player
      </button>
      {winner !== null && !animIdx && (
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, color: '#48c8a0' }}>
          Player {winner + 1} goes first!
        </div>
      )}
    </div>
  );
}

const smBtn: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', fontSize: 14,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1, fontWeight: 700,
};
