'use client';
import { useState, useEffect } from 'react';

const RING_LEVELS = [
  { label: 'Level 0', text: 'The Ring has not yet chosen a champion.' },
  { label: 'Level 1', text: 'Your ring-bearer is legendary and can\'t be blocked by creatures with greater power.' },
  { label: 'Level 2', text: 'Whenever your ring-bearer attacks, each opponent loses 3 life unless they sacrifice a creature.' },
  { label: 'Level 3', text: 'Whenever your ring-bearer becomes blocked, it gains indestructible until end of turn.' },
  { label: 'Level 4', text: 'Whenever your ring-bearer deals combat damage to a player, that player discards a card and you draw a card.' },
];

type DayNight = 'neither' | 'day' | 'night';

interface ZoneState {
  monarch: number | null;     // player index 0-based, null = no monarch
  initiative: number | null;
  ringLevel: number;          // 0-4
  ringBearer: number | null;  // player index
  dayNight: DayNight;
  playerCount: number;
}

const STORAGE_KEY = 'lodestone-play-zones';

function load(): Partial<ZoneState> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function save(s: ZoneState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function ZoneTrackers() {
  const [playerCount, setPlayerCount] = useState(4);
  const [state, setState] = useState<ZoneState>({
    monarch: null, initiative: null,
    ringLevel: 0, ringBearer: null,
    dayNight: 'neither', playerCount: 4,
  });

  useEffect(() => {
    const saved = load();
    if (Object.keys(saved).length > 0) {
      setState(s => ({ ...s, ...saved }));
      if (saved.playerCount) setPlayerCount(saved.playerCount);
    }
  }, []);

  function update(patch: Partial<ZoneState>) {
    setState(s => {
      const next = { ...s, ...patch };
      save(next);
      return next;
    });
  }

  const mono = "'IBM Plex Mono', monospace";
  const sans = "'IBM Plex Sans', sans-serif";

  function PlayerSelector({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button
          onClick={() => onChange(null)}
          style={playerBtn(value === null)}
        >None</button>
        {Array.from({ length: playerCount }, (_, i) => (
          <button key={i} onClick={() => onChange(i)} style={playerBtn(value === i)}>
            P{i + 1}
          </button>
        ))}
      </div>
    );
  }

  const section = (title: string, icon: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 9, fontFamily: mono, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 7 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ fontFamily: sans }}>
      {/* Player count selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: mono, letterSpacing: 1 }}>PLAYERS</span>
        {[2,3,4,5,6].map(n => (
          <button key={n} onClick={() => { setPlayerCount(n); update({ playerCount: n }); }} style={{
            width: 24, height: 24, borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: playerCount === n ? 'rgba(232,177,74,0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${playerCount === n ? 'rgba(232,177,74,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: playerCount === n ? '#e8b14a' : 'rgba(255,255,255,0.35)',
          }}>{n}</button>
        ))}
      </div>

      {section('Monarch', '👑', (
        <PlayerSelector value={state.monarch} onChange={v => update({ monarch: v })} />
      ))}

      {section('Initiative', '⚔️', (
        <PlayerSelector value={state.initiative} onChange={v => update({ initiative: v })} />
      ))}

      {section('The Ring', '💍', (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
            <button
              onClick={() => update({ ringLevel: Math.max(0, state.ringLevel - 1) })}
              style={smBtn}
              disabled={state.ringLevel === 0}
            >−</button>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#e8b14a', fontFamily: mono, minWidth: 20, textAlign: 'center' }}>
              {state.ringLevel}
            </span>
            <button
              onClick={() => update({ ringLevel: Math.min(4, state.ringLevel + 1) })}
              style={smBtn}
              disabled={state.ringLevel === 4}
            >+</button>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: mono }}>{RING_LEVELS[state.ringLevel].label}</span>
          </div>
          {state.ringLevel > 0 && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginBottom: 7 }}>
              {RING_LEVELS[state.ringLevel].text}
            </div>
          )}
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: mono, letterSpacing: 1, marginBottom: 4 }}>BEARER</div>
          <PlayerSelector value={state.ringBearer} onChange={v => update({ ringBearer: v })} />
        </div>
      ))}

      <div style={{ marginBottom: 0 }}>
        <div style={{ fontSize: 9, fontFamily: mono, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 7 }}>
          ☀️ Day / Night
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['neither', 'day', 'night'] as DayNight[]).map(v => (
            <button
              key={v}
              onClick={() => update({ dayNight: v })}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', fontFamily: mono, textTransform: 'capitalize',
                background: state.dayNight === v ? 'rgba(232,177,74,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${state.dayNight === v ? 'rgba(232,177,74,0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: state.dayNight === v ? '#e8b14a' : 'rgba(255,255,255,0.4)',
              }}
            >
              {v === 'neither' ? '—' : v === 'day' ? '☀️ Day' : '🌙 Night'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function playerBtn(active: boolean): React.CSSProperties {
  return {
    padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700,
    cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
    background: active ? 'rgba(232,177,74,0.18)' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${active ? 'rgba(232,177,74,0.5)' : 'rgba(255,255,255,0.09)'}`,
    color: active ? '#e8b14a' : 'rgba(255,255,255,0.4)',
  };
}

const smBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontSize: 15,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1, fontWeight: 700,
};
