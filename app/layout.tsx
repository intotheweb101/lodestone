import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/auth-provider';
import { AuthCorner } from '@/components/auth-corner';
import { NavLinks } from '@/components/nav-links';
import { NotificationBellServer } from '@/components/notification-bell-server';

export const metadata: Metadata = {
  title: 'Lodestone — MTG Deck Builder & NZ Price Finder',
  description: 'Build Magic: The Gathering decks and compare card prices across New Zealand retailers.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Pirata+One&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bg)' }}>
        <AuthProvider>
          <Sidebar />
          <main style={{ flex: 1, minWidth: 0 }}>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}

function Sidebar() {
  return (
    <aside style={{
      width: '210px',
      flexShrink: 0,
      background: 'var(--sidebar)',
      borderRight: '1px solid #173a38',
      display: 'flex',
      flexDirection: 'column',
      padding: '0',
      position: 'sticky',
      top: 0,
      height: '100dvh',
      zIndex: 50,
      overflowY: 'auto',
    }}>
      {/* Logo + wordmark */}
      <a href="/" style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '16px 14px 12px',
        textDecoration: 'none',
        borderBottom: '1px solid #132e2c',
        flexShrink: 0,
      }}>
        <svg width="26" height="26" viewBox="0 0 48 48" fill="none" aria-hidden>
          <polygon points="24,2 44,13 44,35 24,46 4,35 4,13" fill="#0d2a2c" stroke="#e8b14a" strokeWidth="2"/>
          <polygon points="24,9 27.5,21 39,24 27.5,27 24,39 20.5,27 9,24 20.5,21" fill="#e8b14a"/>
        </svg>
        <div>
          <div style={{ fontFamily: "'Pirata One', cursive", fontSize: '15px', color: 'var(--accent)', lineHeight: 1.1 }}>Lodestone</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: '#3a5a56', letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>NZD · MTG</div>
        </div>
      </a>

      {/* Main nav — labeled, sectioned, active-route highlighting (client) */}
      <div style={{ flex: 1, padding: '6px 8px', overflowY: 'auto' }}>
        <NavLinks />
      </div>

      {/* New deck CTA */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #132e2c', flexShrink: 0 }}>
        <a href="/decks" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
          padding: '8px 12px', borderRadius: '8px',
          background: 'var(--accent)', color: '#0a1f22',
          textDecoration: 'none', fontWeight: 700, fontSize: '12.5px',
          letterSpacing: '0.02em',
        }}>
          <span style={{ fontSize: '16px', lineHeight: 1, marginTop: '-1px' }}>+</span>
          New Deck
        </a>
      </div>

      {/* Auth area + notifications */}
      <div style={{ padding: '10px 12px 14px', borderTop: '1px solid #132e2c', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <NotificationBellServer />
        </div>
        <AuthCorner />
      </div>
    </aside>
  );
}
