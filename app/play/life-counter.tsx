'use client';
import { useState, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Format = 'commander' | 'standard';

interface Player {
  id: number;
  name: string;
  life: number;
  poison: number;
  cmdDmg: number[]; // index = source player id
  active: boolean;
}

interface HistoryEntry {
  ts: number;
  playerId: number;
  playerName: string;
  delta: number;
  kind: 'life' | 'poison' | 'cmd';
  sourceId?: number; // for cmd damage
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAYER_COLORS = [
  { bg: '#1a1200', border: '#e8b14a', text: '#e8b14a', muted: '#7a5f1e', glow: 'rgba(232,177,74,0.08)' },
  { bg: '#001a1a', border: '#48c8a0', text: '#48c8a0', muted: '#1f6a56', glow: 'rgba(72,200,160,0.08)' },
  { bg: '#1a0010', border: '#e87a9b', text: '#e87a9b', muted: '#7a2040', glow: 'rgba(232,122,155,0.08)' },
  { bg: '#100018', border: '#a48fe8', text: '#a48fe8', muted: '#503880', glow: 'rgba(164,143,232,0.08)' },
  { bg: '#000a1a', border: '#6ab4e8', text: '#6ab4e8', muted: '#1e4a7a', glow: 'rgba(106,180,232,0.08)' },
  { bg: '#0a1400', border: '#8ac84a', text: '#8ac84a', muted: '#3a6018', glow: 'rgba(138,200,74,0.08)' },
];

const STARTING_LIFE: Record<Format, number> = {
  commander: 40,
  standard: 20,
};

const DEFAULT_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlayers(count: number, format: Format): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: DEFAULT_NAMES[i],
    life: STARTING_LIFE[format],
    poison: 0,
    cmdDmg: new Array(count).fill(0),
    active: true,
  }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LifeButton({ delta, onPress, color }: { delta: number; onPress: (d: number) => void; color: string }) {
  const [flash, setFlash] = useState(false);
  const handle = () => {
    setFlash(true);
    onPress(delta);
    setTimeout(() => setFlash(false), 120);
  };
  const isPos = delta > 0;
  return (
    <button
      onClick={handle}
      style={{
        width: 52, height: 52,
        borderRadius: 10,
        border: `1px solid ${flash ? color : 'rgba(255,255,255,0.08)'}`,
        background: flash ? `${color}22` : 'rgba(255,255,255,0.04)',
        color: isPos ? '#48c8a0' : '#e87a6b',
        fontSize: Math.abs(delta) === 1 ? 22 : 15,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.1s',
        fontFamily: "'IBM Plex Mono', monospace",
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {delta > 0 ? `+${delta}` : delta}
    </button>
  );
}

function CounterChip({
  label, value, onUp, onDown, color,
}: {
  label: string; value: number; onUp: () => void; onDown: () => void; color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1, minWidth: 46 }}>
        {label}
      </span>
      <button onClick={onDown} style={{
        width: 22, height: 22, borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.04)', color: '#e87a6b', fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        fontWeight: 700, userSelect: 'none',
      }}>−</button>
      <span style={{ minWidth: 22, textAlign: 'center', fontSize: 13, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>
        {value}
      </span>
      <button onClick={onUp} style={{
        width: 22, height: 22, borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.04)', color: '#48c8a0', fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        fontWeight: 700, userSelect: 'none',
      }}>+</button>
    </div>
  );
}

// ─── Player tile ──────────────────────────────────────────────────────────────

interface PlayerTileProps {
  player: Player;
  players: Player[];
  format: Format;
  onLifeChange: (id: number, delta: number) => void;
  onPoisonChange: (id: number, delta: number) => void;
  onCmdDmgChange: (targetId: number, sourceId: number, delta: number) => void;
  onNameChange: (id: number, name: string) => void;
  onEliminate: (id: number) => void;
}

function PlayerTile({
  player, players, format, onLifeChange, onPoisonChange, onCmdDmgChange, onNameChange, onEliminate,
}: PlayerTileProps) {
  const [showCmd, setShowCmd] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(player.name);
  const nameRef = useRef<HTMLInputElement>(null);
  const col = PLAYER_COLORS[player.id % PLAYER_COLORS.length];

  const isDead = !player.active || player.life <= 0 || player.poison >= 10;

  function commitName() {
    onNameChange(player.id, draftName.trim() || player.name);
    setEditingName(false);
  }

  const others = players.filter(p => p.id !== player.id && p.active);

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      background: isDead ? 'rgba(0,0,0,0.6)' : col.bg,
      border: `1px solid ${isDead ? 'rgba(255,255,255,0.06)' : col.border}`,
      borderRadius: 16,
      padding: '16px 18px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      position: 'relative',
      opacity: isDead ? 0.45 : 1,
      transition: 'opacity 0.3s',
      userSelect: 'none',
    }}>
      {/* Name row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {editingName ? (
          <input
            ref={nameRef}
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
            autoFocus
            style={{
              flex: 1, background: 'rgba(255,255,255,0.06)', border: `1px solid ${col.border}`,
              borderRadius: 6, padding: '4px 8px', color: col.text, fontSize: 13,
              fontFamily: "'IBM Plex Sans', sans-serif", outline: 'none',
            }}
          />
        ) : (
          <button
            onClick={() => { setDraftName(player.name); setEditingName(true); }}
            style={{
              background: 'none', border: 'none', color: col.text, fontSize: 13,
              fontWeight: 700, cursor: 'pointer', letterSpacing: '0.5px',
              padding: '2px 0', textAlign: 'left', flex: 1,
              fontFamily: "'IBM Plex Sans', sans-serif",
              textTransform: 'uppercase',
            }}
          >
            {player.name}
          </button>
        )}
        <button
          onClick={() => onEliminate(player.id)}
          title={player.active ? 'Eliminate' : 'Restore'}
          style={{
            width: 22, height: 22, borderRadius: 5,
            background: isDead ? 'rgba(72,200,160,0.1)' : 'rgba(255,100,80,0.1)',
            border: `1px solid ${isDead ? 'rgba(72,200,160,0.25)' : 'rgba(255,100,80,0.2)'}`,
            color: isDead ? '#48c8a0' : '#e87a6b',
            fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {isDead ? '↩' : '✕'}
        </button>
      </div>

      {/* Life total */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <LifeButton delta={+5} onPress={d => onLifeChange(player.id, d)} color={col.border} />
          <LifeButton delta={+1} onPress={d => onLifeChange(player.id, d)} color={col.border} />
        </div>

        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{
            fontSize: 'clamp(52px, 8vw, 88px)',
            fontWeight: 800,
            lineHeight: 1,
            color: isDead ? 'rgba(255,255,255,0.15)' : player.life <= 5 ? '#e87a6b' : col.text,
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '-2px',
            transition: 'color 0.2s',
          }}>
            {player.life}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>
            LIFE
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <LifeButton delta={-1} onPress={d => onLifeChange(player.id, d)} color={col.border} />
          <LifeButton delta={-5} onPress={d => onLifeChange(player.id, d)} color={col.border} />
        </div>
      </div>

      {/* Poison + Commander damage row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
        <CounterChip
          label="POISON"
          value={player.poison}
          color="#9bdb7a"
          onUp={() => onPoisonChange(player.id, +1)}
          onDown={() => onPoisonChange(player.id, -1)}
        />

        {format === 'commander' && others.length > 0 && (
          <>
            <button
              onClick={() => setShowCmd(v => !v)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 10, color: showCmd ? col.text : 'rgba(255,255,255,0.3)',
                fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1,
                textAlign: 'left', padding: '2px 0',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <span>{showCmd ? '▾' : '▸'}</span>
              CMD DAMAGE
            </button>
            {showCmd && others.map(src => (
              <CounterChip
                key={src.id}
                label={`FROM ${src.name.slice(0, 6).toUpperCase()}`}
                value={player.cmdDmg[src.id] ?? 0}
                color={PLAYER_COLORS[src.id % PLAYER_COLORS.length].text}
                onUp={() => onCmdDmgChange(player.id, src.id, +1)}
                onDown={() => onCmdDmgChange(player.id, src.id, -1)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── History panel ────────────────────────────────────────────────────────────

function HistoryPanel({ entries, players }: { entries: HistoryEntry[]; players: Player[] }) {
  if (entries.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>
        No actions yet
      </div>
    );
  }
  return (
    <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse' }}>
      {[...entries].reverse().map((e, i) => {
        const col = PLAYER_COLORS[e.playerId % PLAYER_COLORS.length];
        const isPos = e.delta > 0;
        return (
          <div key={e.ts + '-' + i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
            fontSize: 12,
          }}>
            <span style={{ color: col.text, fontWeight: 700, minWidth: 80, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
              {e.playerName.slice(0, 9)}
            </span>
            <span style={{ color: isPos ? '#48c8a0' : '#e87a6b', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", minWidth: 36 }}>
              {isPos ? `+${e.delta}` : e.delta}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
              {e.kind === 'cmd' && e.sourceId != null
                ? `cmd from ${players[e.sourceId]?.name ?? '?'}`
                : e.kind}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LifeCounter() {
  const [format, setFormat] = useState<Format>('commander');
  const [playerCount, setPlayerCount] = useState(4);
  const [players, setPlayers] = useState<Player[]>(() => makePlayers(4, 'commander'));
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  function pushHistory(entry: Omit<HistoryEntry, 'ts'>) {
    setHistory(h => [...h, { ...entry, ts: Date.now() }]);
  }

  const handleLifeChange = useCallback((id: number, delta: number) => {
    setPlayers(ps => ps.map(p => p.id === id ? { ...p, life: p.life + delta } : p));
    setPlayers(ps => {
      const p = ps.find(p => p.id === id);
      if (p) pushHistory({ playerId: id, playerName: p.name, delta, kind: 'life' });
      return ps;
    });
  }, []);

  const handlePoisonChange = useCallback((id: number, delta: number) => {
    setPlayers(ps => ps.map(p => p.id === id ? { ...p, poison: Math.max(0, p.poison + delta) } : p));
    setPlayers(ps => {
      const p = ps.find(p => p.id === id);
      if (p) pushHistory({ playerId: id, playerName: p.name, delta, kind: 'poison' });
      return ps;
    });
  }, []);

  const handleCmdDmgChange = useCallback((targetId: number, sourceId: number, delta: number) => {
    setPlayers(ps => ps.map(p => {
      if (p.id !== targetId) return p;
      const newCmdDmg = [...p.cmdDmg];
      newCmdDmg[sourceId] = Math.max(0, (newCmdDmg[sourceId] ?? 0) + delta);
      const newLife = p.life - delta;
      return { ...p, cmdDmg: newCmdDmg, life: newLife };
    }));
    setPlayers(ps => {
      const p = ps.find(p => p.id === targetId);
      if (p) pushHistory({ playerId: targetId, playerName: p.name, delta: -delta, kind: 'cmd', sourceId });
      return ps;
    });
  }, []);

  const handleNameChange = useCallback((id: number, name: string) => {
    setPlayers(ps => ps.map(p => p.id === id ? { ...p, name } : p));
  }, []);

  const handleEliminate = useCallback((id: number) => {
    setPlayers(ps => ps.map(p => p.id === id ? { ...p, active: !p.active } : p));
  }, []);

  function applySettings(newCount: number, newFormat: Format) {
    setPlayerCount(newCount);
    setFormat(newFormat);
    setPlayers(makePlayers(newCount, newFormat));
    setHistory([]);
    setConfirmReset(false);
  }

  function doReset() {
    setPlayers(makePlayers(playerCount, format));
    setHistory([]);
    setConfirmReset(false);
  }

  const gridCols = playerCount <= 2 ? playerCount : playerCount <= 4 ? 2 : playerCount <= 6 ? 3 : 2;

  return (
    <div style={{
      minHeight: '100vh', background: '#06100f', color: '#c8dbd8',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
    }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 2 }}>
          LIFE COUNTER
        </span>

        {/* Format */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {(['commander', 'standard'] as Format[]).map(f => (
            <button
              key={f}
              onClick={() => applySettings(playerCount, f)}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', textTransform: 'capitalize', fontFamily: "'IBM Plex Mono', monospace",
                background: format === f ? 'rgba(232,177,74,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${format === f ? 'rgba(232,177,74,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: format === f ? '#e8b14a' : 'rgba(255,255,255,0.4)',
              }}
            >
              {f} ({STARTING_LIFE[f]})
            </button>
          ))}
        </div>

        {/* Player count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>PLAYERS</span>
          {[2, 3, 4, 5, 6].map(n => (
            <button
              key={n}
              onClick={() => applySettings(n, format)}
              style={{
                width: 28, height: 28, borderRadius: 6, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
                background: playerCount === n ? 'rgba(232,177,74,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${playerCount === n ? 'rgba(232,177,74,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: playerCount === n ? '#e8b14a' : 'rgba(255,255,255,0.4)',
              }}
            >
              {n}
            </button>
          ))}
        </div>

        {/* History toggle */}
        <button
          onClick={() => setShowHistory(v => !v)}
          style={{
            padding: '4px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
            fontFamily: "'IBM Plex Mono', monospace",
            background: showHistory ? 'rgba(106,180,232,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${showHistory ? 'rgba(106,180,232,0.35)' : 'rgba(255,255,255,0.08)'}`,
            color: showHistory ? '#6ab4e8' : 'rgba(255,255,255,0.4)',
          }}
        >
          History ({history.length})
        </button>

        {/* Reset */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {confirmReset ? (
            <>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace" }}>Reset all?</span>
              <button onClick={doReset} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
                background: 'rgba(232,122,107,0.15)', border: '1px solid rgba(232,122,107,0.4)', color: '#e87a6b',
              }}>Yes</button>
              <button onClick={() => setConfirmReset(false)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
              }}>No</button>
            </>
          ) : (
            <button onClick={() => setConfirmReset(true)} style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
            }}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── History panel ── */}
      {showHistory && (
        <div style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <HistoryPanel entries={history} players={players} />
        </div>
      )}

      {/* ── Player grid ── */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gap: 10,
        padding: 12,
        alignContent: 'start',
      }}>
        {players.map(player => (
          <PlayerTile
            key={player.id}
            player={player}
            players={players}
            format={format}
            onLifeChange={handleLifeChange}
            onPoisonChange={handlePoisonChange}
            onCmdDmgChange={handleCmdDmgChange}
            onNameChange={handleNameChange}
            onEliminate={handleEliminate}
          />
        ))}
      </div>
    </div>
  );
}
