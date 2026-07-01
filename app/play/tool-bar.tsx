'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { DiceRoller, CoinFlip, FirstPlayer } from './dice-roller';
import { Counters } from './counters';
import { ZoneTrackers } from './zone-trackers';
import { TokenPicker } from './token-picker';

type Tool = 'dice' | 'coin' | 'first' | 'counters' | 'zones' | 'tokens' | null;

interface ToolButton {
  id: Tool;
  icon: string;
  label: string;
}

const TOOLS: ToolButton[] = [
  { id: 'dice',     icon: '🎲', label: 'Dice' },
  { id: 'coin',     icon: '🪙', label: 'Coin' },
  { id: 'first',    icon: '🎯', label: '1st Player' },
  { id: 'counters', icon: '➕', label: 'Counters' },
  { id: 'zones',    icon: '⟡',  label: 'Zones' },
  { id: 'tokens',   icon: '🔶', label: 'Tokens' },
];

const TITLES: Record<NonNullable<Tool>, string> = {
  dice:     '🎲 Dice Roller',
  coin:     '🪙 Coin Flip',
  first:    '🎯 First Player',
  counters: '➕ Counters',
  zones:    '⟡ Zone Trackers',
  tokens:   '🔶 Tokens & Emblems',
};

export function ToolBar() {
  const [open, setOpen] = useState<Tool>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(null), []);

  // Esc closes the popover
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Click-outside closes the popover
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        barRef.current && !barRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }
    // Small delay so the toggle click doesn't immediately re-close
    const id = setTimeout(() => window.addEventListener('pointerdown', onPointer), 50);
    return () => { clearTimeout(id); window.removeEventListener('pointerdown', onPointer); };
  }, [open, close]);

  const mono = "'IBM Plex Mono', monospace";
  const sans = "'IBM Plex Sans', sans-serif";

  return (
    <>
      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            bottom: 76, // above bar
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(360px, calc(100vw - 24px))',
            background: '#0d1f20',
            border: '1px solid rgba(232,177,74,0.25)',
            borderRadius: 16,
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
            zIndex: 200,
            padding: '14px 16px',
            maxHeight: 'calc(100dvh - 100px)',
            overflowY: 'auto',
          }}
        >
          <div style={{
            fontSize: 11, fontFamily: mono, letterSpacing: 1.5, color: '#e8b14a',
            textTransform: 'uppercase', marginBottom: 12,
          }}>
            {TITLES[open]}
          </div>
          {open === 'dice'     && <DiceRoller />}
          {open === 'coin'     && <CoinFlip />}
          {open === 'first'    && <FirstPlayer />}
          {open === 'counters' && <Counters />}
          {open === 'zones'    && <ZoneTrackers />}
          {open === 'tokens'   && <TokenPicker />}
        </div>
      )}

      {/* Floating bar */}
      <div
        ref={barRef}
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(13,31,32,0.96)',
          border: '1px solid rgba(232,177,74,0.2)',
          borderRadius: 50,
          padding: '6px 10px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)',
          zIndex: 100,
          userSelect: 'none',
        }}
      >
        {TOOLS.map(t => {
          const active = open === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setOpen(open === t.id ? null : t.id)}
              title={t.label}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                padding: '5px 10px', borderRadius: 40, border: 'none',
                background: active ? 'rgba(232,177,74,0.18)' : 'transparent',
                cursor: 'pointer', transition: 'background 0.12s',
                outline: active ? '1px solid rgba(232,177,74,0.4)' : 'none',
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
              <span style={{
                fontSize: 8, fontFamily: mono, letterSpacing: 0.5,
                color: active ? '#e8b14a' : 'rgba(255,255,255,0.35)',
                lineHeight: 1,
              }}>
                {t.label.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
