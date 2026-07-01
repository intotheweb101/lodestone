'use client';
import { useState } from 'react';
import { LifeCounter } from './life-counter';
import { PlanechaseClient } from './planechase-client';
import { ToolBar } from './tool-bar';

type Mode = 'life' | 'planechase';

export function PlayLayout() {
  const [mode, setMode] = useState<Mode>('life');

  const tabStyle = (active: boolean) => ({
    padding: '7px 18px', borderRadius: '8px',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    fontFamily: "'IBM Plex Sans', sans-serif",
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: active ? 'rgba(232,177,74,0.1)' : 'var(--surface)',
    color: active ? 'var(--accent)' : 'var(--text-faint)',
    transition: 'all 0.12s',
  } as const);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '2rem' }}>
        <button style={tabStyle(mode === 'life')} onClick={() => setMode('life')}>
          ♥ Life Counter
        </button>
        <button style={tabStyle(mode === 'planechase')} onClick={() => setMode('planechase')}>
          ⟡ Planechase
        </button>
      </div>

      {mode === 'life' && <LifeCounter />}
      {mode === 'planechase' && <PlanechaseClient />}

      {/* Floating play-companion tool bar — overlays all modes */}
      <ToolBar />
    </div>
  );
}
