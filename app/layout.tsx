import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '@/components/auth-provider';
import { NavLinks } from '@/components/nav-links';
import { NotificationBellServer } from '@/components/notification-bell-server';
import { MobileSidebar } from '@/components/mobile-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { CommandPalette } from '@/components/command-palette';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: 'Lodestone — MTG Deck Builder & NZ Price Finder',
  description: 'Build Magic: The Gathering decks and compare card prices across New Zealand retailers.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07151a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Pirata+One&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* Inline in <head> so it runs before first paint — prevents theme flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('lodestone-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})()`}} />
      </head>
      <body style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bg)' }}>
        {/* Service worker — dangerouslySetInnerHTML avoids React 19 inline-script warning */}
        <Script id="sw-register" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});})}`}} />
        <AuthProvider>
          <CommandPalette />
          {/* Desktop sidebar — hidden on mobile via CSS class */}
          <aside className="sidebar-desktop" style={{
            width: '210px',
            flexShrink: 0,
            background: 'var(--sidebar)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            padding: '0',
            position: 'sticky',
            top: 0,
            height: '100dvh',
            zIndex: 50,
            overflowY: 'auto',
          }}>
            <SidebarContents />
          </aside>

          {/* Mobile: top bar + slide-in drawer */}
          <MobileSidebar>
            <SidebarContents />
          </MobileSidebar>

          <main style={{ flex: 1, minWidth: 0 }}>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}

function SidebarContents() {
  return (
    <>
      {/* Logo + wordmark */}
      <a href="/" style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '16px 14px 12px',
        textDecoration: 'none',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <svg width="26" height="26" viewBox="0 0 48 48" fill="none" aria-hidden>
          <polygon points="24,2 44,13 44,35 24,46 4,35 4,13" fill="var(--sidebar)" stroke="var(--accent)" strokeWidth="2"/>
          <polygon points="24,9 27.5,21 39,24 27.5,27 24,39 20.5,27 9,24 20.5,21" fill="var(--accent)"/>
        </svg>
        <div>
          <div style={{ fontFamily: "'Pirata One', cursive", fontSize: '15px', color: 'var(--accent)', lineHeight: 1.1 }}>Lodestone</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1 }}>NZD · MTG</div>
        </div>
      </a>

      {/* Main nav */}
      <div style={{ flex: 1, padding: '6px 8px', overflowY: 'auto' }}>
        <NavLinks />
      </div>

      {/* New deck CTA */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
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

      {/* Auth area + notifications + theme toggle */}
      <div style={{ padding: '10px 12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <NotificationBellServer />
          <ThemeToggle />
        </div>
      </div>
    </>
  );
}
