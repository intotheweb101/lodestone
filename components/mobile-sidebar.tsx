'use client';

import { useState, useEffect } from 'react';

export function MobileSidebar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Close on route change (any click that navigates will close)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Mobile top bar — hidden on desktop */}
      <div className="mobile-topbar" style={{
        display: 'none', // shown via CSS
        position: 'sticky', top: 0, zIndex: 60,
        height: '52px',
        background: 'var(--sidebar)',
        borderBottom: '1px solid #173a38',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-hidden>
            <polygon points="24,2 44,13 44,35 24,46 4,35 4,13" fill="#0d2a2c" stroke="#e8b14a" strokeWidth="2"/>
            <polygon points="24,9 27.5,21 39,24 27.5,27 24,39 20.5,27 9,24 20.5,21" fill="#e8b14a"/>
          </svg>
          <span style={{ fontFamily: "'Pirata One', cursive", fontSize: '16px', color: 'var(--accent)' }}>Lodestone</span>
        </a>
        <button
          onClick={() => setOpen(o => !o)}
          aria-label="Open navigation"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text)', padding: '6px', borderRadius: '6px',
          }}
        >
          {/* Hamburger icon */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 70,
            background: 'rgba(0,0,0,0.55)',
          }}
          aria-hidden
        />
      )}

      {/* Slide-in drawer */}
      <div
        className="mobile-drawer"
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 80,
          width: '240px',
          background: 'var(--sidebar)',
          borderRight: '1px solid #173a38',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s ease',
          overflowY: 'auto',
        }}
        onClick={(e) => {
          // Close if user clicks a link inside the drawer
          if ((e.target as HTMLElement).closest('a')) setOpen(false);
        }}
      >
        {children}
      </div>
    </>
  );
}
