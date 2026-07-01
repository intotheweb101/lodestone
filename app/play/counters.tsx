'use client';
import { useState, useEffect } from 'react';

interface Counter {
  id: number;
  label: string;
  value: number;
}

const PRESETS = ['Energy', 'Experience', 'Storm', '+1/+1', 'Rad', 'Ticket', 'Lore', 'Poison'];

const STORAGE_KEY = 'lodestone-play-counters';

function load(): Counter[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? (JSON.parse(raw) as Counter[]) : [];
  } catch { return []; }
}

function save(counters: Counter[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(counters)); } catch { /* ignore */ }
}

export function Counters() {
  const [counters, setCounters] = useState<Counter[]>([]);
  const [nextId, setNextId] = useState(1);
  const [customLabel, setCustomLabel] = useState('');
  const mono = "'IBM Plex Mono', monospace";
  const sans = "'IBM Plex Sans', sans-serif";

  // Restore from localStorage on mount
  useEffect(() => {
    const saved = load();
    if (saved.length > 0) {
      setCounters(saved);
      setNextId(Math.max(...saved.map(c => c.id)) + 1);
    }
  }, []);

  function update(updated: Counter[]) {
    setCounters(updated);
    save(updated);
  }

  function addCounter(label: string) {
    if (!label.trim()) return;
    const id = nextId;
    setNextId(id + 1);
    update([...counters, { id, label: label.trim(), value: 0 }]);
  }

  function change(id: number, delta: number) {
    update(counters.map(c => c.id === id ? { ...c, value: c.value + delta } : c));
  }

  function remove(id: number) {
    update(counters.filter(c => c.id !== id));
  }

  return (
    <div style={{ fontFamily: sans }}>
      {/* Quick-add presets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {PRESETS.map(p => {
          const already = counters.some(c => c.label === p);
          return (
            <button
              key={p}
              onClick={() => !already && addCounter(p)}
              disabled={already}
              style={{
                padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: already ? 'default' : 'pointer', fontFamily: mono,
                background: already ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)',
                border: `1px solid ${already ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.14)'}`,
                color: already ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)',
              }}
            >
              {already ? '✓' : '+'} {p}
            </button>
          );
        })}
      </div>

      {/* Custom add */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
        <input
          value={customLabel}
          onChange={e => setCustomLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { addCounter(customLabel); setCustomLabel(''); } }}
          placeholder="Custom counter name…"
          style={{
            flex: 1, padding: '5px 10px', borderRadius: 7, fontSize: 12,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.7)', fontFamily: sans, outline: 'none',
          }}
        />
        <button
          onClick={() => { addCounter(customLabel); setCustomLabel(''); }}
          style={{
            padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: mono,
            background: 'rgba(232,177,74,0.15)', border: '1px solid rgba(232,177,74,0.4)',
            color: '#e8b14a',
          }}
        >Add</button>
      </div>

      {/* Counter list */}
      {counters.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12, fontFamily: mono, padding: '8px 0' }}>
          No counters yet — add one above
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {counters.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.04)', borderRadius: 9,
              padding: '7px 10px', border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', fontFamily: mono, letterSpacing: 0.5 }}>
                {c.label}
              </span>
              <button onClick={() => change(c.id, -1)} style={smBtn}>−</button>
              <span style={{ minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: 800, color: c.value === 0 ? 'rgba(255,255,255,0.4)' : c.value > 0 ? '#48c8a0' : '#e87a6b', fontFamily: mono }}>
                {c.value}
              </span>
              <button onClick={() => change(c.id, +1)} style={smBtn}>+</button>
              <button onClick={() => remove(c.id)} style={{ ...smBtn, color: 'rgba(255,100,80,0.6)', marginLeft: 2 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const smBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontSize: 15,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1, fontWeight: 700,
};
