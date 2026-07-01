'use client';
/**
 * NavLinks — the labeled sidebar nav with section groups and active-route highlighting.
 * Must be a client component because it uses usePathname() + useAuth().
 */
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import type { ReactNode } from 'react';

// ─── Icon components ─────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 12L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <line x1="2" y1="5" x2="16" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="4" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="13" x2="11" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <ellipse cx="9" cy="9" rx="3.5" ry="7" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}

function DecksIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2" y="3" width="9" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="7" y="2" width="9" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10" y1="6.5" x2="13" y2="6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="10" y1="9.5" x2="12" y2="9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function CollectionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="1.5" y="4" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="4.5" y="2" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="7.5" y="0" width="9" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

function WishlistIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M9 14.5C9 14.5 2.5 10.5 2.5 6.5a3.5 3.5 0 0 1 6.5-1.8A3.5 3.5 0 0 1 15.5 6.5c0 4-6.5 8-6.5 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="14" cy="14" r="3" fill="var(--accent)" stroke="none"/>
      <line x1="14" y1="12.5" x2="14" y2="15.5" stroke="#0a1f22" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="12.5" y1="14" x2="15.5" y2="14" stroke="#0a1f22" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 16c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 9a6 6 0 0 1 10.392-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M15 9a6 6 0 0 1-10.392 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <polyline points="13.5,4 14.5,6 12.5,6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="4.5,14 3.5,12 5.5,12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M9 2L11.5 7h5l-4 3 1.5 5L9 13l-4 4 1.5-5-4-3h5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  );
}

function SetsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="1.5" y="5" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="4.5" y="3" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="7.5" y="1" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}

function MetagameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2" y="11" width="3" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="7.5" y="7" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="13" y="3" width="3" height="13" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}

function TradeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 6h12M13 4l2 2-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15 12H3M5 10l-2 2 2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11a9 9 0 0 1 9 9"/>
      <path d="M4 4a16 16 0 0 1 16 16"/>
      <circle cx="5" cy="19" r="1" fill="currentColor"/>
    </svg>
  );
}

function SealedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="3" y="2" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="7" y="5" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="5.5" y1="6" x2="8.5" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="5.5" y1="8.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function LifeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M9 15C9 15 2.5 10.5 2.5 6.5a3.5 3.5 0 0 1 6.5-1.8A3.5 3.5 0 0 1 15.5 6.5c0 4-6.5 8.5-6.5 8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="9" y1="6" x2="9" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="6.5" y1="8.5" x2="11.5" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function ProxyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2" y="2" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="6" y="4" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.5"/>
    </svg>
  );
}

function BracketCalcIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M4 2v14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M14 2v14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M4 9h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2 1.5"/>
      <circle cx="9" cy="5" r="1.5" fill="currentColor"/>
      <circle cx="9" cy="13" r="1.5" fill="currentColor"/>
    </svg>
  );
}

function DraftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2" y="3" width="7" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="5" y="1" width="7" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="8.5" y="5" width="7" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M11 10l2 2 3-3" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="1.5" y="3" width="6" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="10.5" y="3" width="6" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 9h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M9 9 L9 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M9 9 L13.5 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="9" cy="9" r="1.2" fill="currentColor"/>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

// ─── Nav item ────────────────────────────────────────────────────────────────

interface NavItemProps {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}

function NavItem({ href, label, icon, active }: NavItemProps) {
  return (
    <a
      href={href}
      title={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '7px 10px',
        borderRadius: '7px',
        textDecoration: 'none',
        fontSize: '12.5px',
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        background: active ? 'var(--accent-glow)' : 'transparent',
        borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'all 0.12s ease',
        letterSpacing: '0.01em',
      }}
    >
      <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </a>
  );
}

// ─── Section label ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: '9px',
      fontFamily: "'IBM Plex Mono', monospace",
      fontWeight: 600,
      letterSpacing: '1.5px',
      textTransform: 'uppercase',
      color: 'var(--text-faintest)',
      padding: '8px 10px 4px',
      marginTop: '4px',
    }}>
      {children}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function NavLinks() {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  const profileHref = user ? `/u/${user.username}` : '/login';

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <nav style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Discover */}
      <SectionLabel>Discover</SectionLabel>
      <NavItem href="/" label="Search" icon={<SearchIcon />} active={isActive('/', true)} />
      <NavItem href="/search" label="Advanced" icon={<FilterIcon />} active={isActive('/search', true)} />
      <NavItem href="/decks/browse" label="Browse" icon={<GlobeIcon />} active={isActive('/decks/browse')} />
      <NavItem href="/sets" label="Sets" icon={<SetsIcon />} active={isActive('/sets')} />
      <NavItem href="/metagame" label="Metagame" icon={<MetagameIcon />} active={isActive('/metagame')} />
      <NavItem href="/trades" label="Trades" icon={<TradeIcon />} active={isActive('/trades')} />
      <NavItem href="/feed" label="Feed" icon={<FeedIcon />} active={isActive('/feed')} />
      <NavItem href="/play" label="Play" icon={<LifeIcon />} active={isActive('/play')} />
      <NavItem href="/sealed" label="Sealed" icon={<SealedIcon />} active={isActive('/sealed')} />
      <NavItem href="/draft" label="Draft" icon={<DraftIcon />} active={isActive('/draft')} />
      <NavItem href="/bracket" label="Bracket Calc" icon={<BracketCalcIcon />} active={isActive('/bracket')} />
      <NavItem href="/proxy" label="Print Proxies" icon={<ProxyIcon />} active={isActive('/proxy')} />

      {/* My Stuff — only meaningful when logged in, but always shown */}
      <SectionLabel>My Stuff</SectionLabel>
      <NavItem href="/decks" label="My Decks" icon={<DecksIcon />} active={isActive('/decks') && !isActive('/decks/browse')} />
      <NavItem href="/packages" label="Packages" icon={<CollectionIcon />} active={isActive('/packages')} />
      <NavItem href="/collection" label="Collection" icon={<CollectionIcon />} active={isActive('/collection')} />
      <NavItem href="/wishlist" label="Wishlist" icon={<WishlistIcon />} active={isActive('/wishlist')} />
      <NavItem href="/compare" label="Compare" icon={<CompareIcon />} active={isActive('/compare')} />
      <NavItem href="/stats" label="My Stats" icon={<StatsIcon />} active={isActive('/stats')} />
      <NavItem href="/notifications" label="Notifications" icon={<BellIcon />} active={isActive('/notifications')} />
      {!loading && (
        <NavItem href={profileHref} label="Profile" icon={<UserIcon />} active={isActive(profileHref)} />
      )}

      {/* System */}
      <SectionLabel>System</SectionLabel>
      <NavItem href="/sync" label="Sync data" icon={<SyncIcon />} active={isActive('/sync')} />
      {user?.role === 'admin' && (
        <NavItem href="/admin" label="Admin" icon={<AdminIcon />} active={isActive('/admin')} />
      )}
    </nav>
  );
}
