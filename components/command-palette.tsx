'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { actionSearchCard } from '@/app/actions';

// ─── Page navigation items ────────────────────────────────────────────────────

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  group: string;
  href: string;
}

const BASE_ITEMS: PaletteItem[] = [
  { id: 'search',     label: 'Search',          hint: 'Price any Magic card',          group: 'Discover', href: '/' },
  { id: 'advanced',   label: 'Advanced Search',  hint: 'Filter by color, type, CMC',   group: 'Discover', href: '/search' },
  { id: 'browse',     label: 'Browse Decks',     hint: 'Public community decks',        group: 'Discover', href: '/decks/browse' },
  { id: 'metagame',   label: 'Metagame',         hint: 'Top staples & trending decks',  group: 'Discover', href: '/metagame' },
  { id: 'trades',     label: 'Trades',           hint: 'Trade binder & want matches',   group: 'Discover', href: '/trades' },
  { id: 'feed',       label: 'Feed',             hint: 'Community activity',            group: 'Discover', href: '/feed' },
  { id: 'decks',      label: 'My Decks',         hint: 'Your deck library',             group: 'My Stuff', href: '/decks' },
  { id: 'packages',   label: 'Packages',         hint: 'Reusable card bundles',         group: 'My Stuff', href: '/packages' },
  { id: 'collection', label: 'Collection',       hint: 'Cards you own',                 group: 'My Stuff', href: '/collection' },
  { id: 'wishlist',   label: 'Wishlist',         hint: 'Cards you want',                group: 'My Stuff', href: '/wishlist' },
  { id: 'new-deck',   label: 'New Deck',         hint: 'Start building a new deck',     group: 'Actions',  href: '/decks' },
  { id: 'play',       label: 'Play',             hint: 'Life counter & play tools',     group: 'Play',     href: '/play' },
  { id: 'planechase', label: 'Planechase',       hint: 'Planar die & planar deck',      group: 'Play',     href: '/play' },
  { id: 'sync',       label: 'Sync Data',        hint: 'Refresh shop prices & cards',   group: 'System',   href: '/sync' },
];

const ADMIN_ITEM: PaletteItem = {
  id: 'admin', label: 'Admin', hint: 'Site management', group: 'System', href: '/admin',
};

// ─── Card result type ─────────────────────────────────────────────────────────

interface CardResult {
  scryfall_id: string;
  oracle_id: string;
  name: string;
  set_code: string;
  collector_number: string;
  type_line: string;
  mana_cost: string | null;
  image_url: string | null;
  color_identity: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const kbdStyle = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '9px',
  color: 'var(--text-faintest)',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  padding: '1px 5px',
  marginRight: '3px',
};

const MANA_COLORS: Record<string, string> = {
  W: '#f7efd2', U: '#a9def9', B: '#bcb4ad', R: '#f3a48b', G: '#93c8a6', C: '#c9c3bc',
};

function ManaPips({ cost }: { cost: string | null }) {
  if (!cost) return null;
  const symbols = (cost.match(/\{[^}]+\}/g) ?? []).slice(0, 7);
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {symbols.map((s, i) => {
        const inner = s.slice(1, -1);
        const color = MANA_COLORS[inner] ?? 'var(--text-faint)';
        return (
          <span key={i} style={{
            width: 13, height: 13, borderRadius: '50%',
            background: `${color}33`, border: `1px solid ${color}88`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
            flexShrink: 0,
          }}>
            {inner.length === 1 ? inner : inner.replace(/\//, '')}
          </span>
        );
      })}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [cardResults, setCardResults] = useState<CardResult[]>([]);
  const [cardLoading, setCardLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const router = useRouter();
  const { user } = useAuth();

  const items = user?.role === 'admin' ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS;

  const filtered = query.trim()
    ? items.filter(i =>
        i.label.toLowerCase().includes(query.toLowerCase()) ||
        i.hint.toLowerCase().includes(query.toLowerCase()),
      )
    : items;

  // Total navigable count — page items + card results
  const totalItems = filtered.length + cardResults.length;

  // Keep open ref in sync for stable global listener
  useEffect(() => { openRef.current = open; }, [open]);

  // Debounced card search — fires 160ms after query stabilises, min 2 chars
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setCardResults([]);
      setCardLoading(false);
      return;
    }
    setCardLoading(true);
    const t = setTimeout(async () => {
      try {
        const results = await actionSearchCard(q);
        setCardResults((results as CardResult[]).slice(0, 6));
      } catch {
        setCardResults([]);
      } finally {
        setCardLoading(false);
      }
    }, 160);
    return () => clearTimeout(t);
  }, [query]);

  function close() {
    setOpen(false);
    setQuery('');
    setActiveIdx(0);
    setCardResults([]);
    setCardLoading(false);
  }

  function selectPage(item: PaletteItem) {
    close();
    router.push(item.href);
  }

  function selectCard(card: CardResult) {
    close();
    router.push(`/card/${card.set_code}/${card.collector_number}`);
  }

  // Global Cmd/Ctrl+K and Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (openRef.current) { setOpen(false); setQuery(''); setActiveIdx(0); setCardResults([]); }
        else { setOpen(true); setQuery(''); setActiveIdx(0); }
      }
      if (e.key === 'Escape' && openRef.current) close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus input when palette opens
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 16);
    return () => clearTimeout(t);
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  function handleInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, totalItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIdx < filtered.length) {
        const item = filtered[activeIdx];
        if (item) selectPage(item);
      } else {
        const card = cardResults[activeIdx - filtered.length];
        if (card) selectCard(card);
      }
    } else if (e.key === 'Escape') {
      close();
    }
  }

  // Focus trap
  function handlePaletteKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const focusable = paletteRef.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  if (!open) return null;

  // Build grouped page-item view
  type Group = { name: string; items: PaletteItem[] };
  const groups: Group[] = [];
  for (const item of filtered) {
    let g = groups.find(gr => gr.name === item.group);
    if (!g) { g = { name: item.group, items: [] }; groups.push(g); }
    g.items.push(item);
  }

  const showCards = cardResults.length > 0 || (query.trim().length >= 2 && cardLoading);
  const noResults = groups.length === 0 && !showCards && !cardLoading;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(7,21,26,0.78)', backdropFilter: 'blur(3px)',
        }}
      />

      {/* Palette modal */}
      <div
        ref={paletteRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={handlePaletteKeyDown}
        style={{
          position: 'fixed', top: '18%', left: '50%',
          transform: 'translateX(-50%)', zIndex: 1101,
          width: 'calc(100% - 32px)', maxWidth: '560px',
          background: 'var(--surface)', border: '1px solid var(--border-2)',
          borderRadius: '14px', boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Search input row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="var(--text-faint)" strokeWidth="2" strokeLinecap="round"
            aria-hidden style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleInputKey}
            placeholder="Search pages, actions or cards…"
            autoComplete="off"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: '15px',
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          />
          {cardLoading && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="var(--text-faint)" strokeWidth="2" aria-hidden
              style={{ flexShrink: 0, animation: 'spin 0.8s linear infinite' }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          )}
          <kbd style={kbdStyle}>esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: '420px', overflowY: 'auto', paddingBottom: '4px' }}>

          {noResults ? (
            <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {/* Page navigation groups */}
              {groups.map(group => (
                <div key={group.name}>
                  <div style={{
                    padding: '10px 16px 3px', fontSize: '9.5px', fontWeight: 600,
                    letterSpacing: '1.5px', textTransform: 'uppercase',
                    color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    {group.name}
                  </div>
                  {group.items.map(item => {
                    const idx = filtered.indexOf(item);
                    const active = idx === activeIdx;
                    return (
                      <button
                        key={item.id}
                        data-idx={idx}
                        onClick={() => selectPage(item)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          width: '100%', textAlign: 'left', padding: '9px 16px',
                          background: active ? 'var(--surface-3)' : 'transparent',
                          border: 'none', outline: 'none', cursor: 'pointer',
                          boxShadow: active ? 'inset 2px 0 0 var(--accent)' : 'none',
                          transition: 'background 0.08s',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '13.5px', fontWeight: active ? 600 : 400,
                            color: active ? 'var(--text)' : 'var(--text-muted)', lineHeight: 1.3,
                          }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '1px' }}>
                            {item.hint}
                          </div>
                        </div>
                        <span style={{
                          fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px',
                          color: 'var(--text-faintest)', flexShrink: 0,
                        }}>
                          {item.href}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Card results */}
              {showCards && (
                <div>
                  <div style={{
                    padding: '10px 16px 3px', fontSize: '9.5px', fontWeight: 600,
                    letterSpacing: '1.5px', textTransform: 'uppercase',
                    color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace",
                    borderTop: groups.length > 0 ? '1px solid var(--border)' : 'none',
                    marginTop: groups.length > 0 ? 4 : 0,
                  }}>
                    Cards
                  </div>
                  {cardResults.map((card, ci) => {
                    const idx = filtered.length + ci;
                    const active = idx === activeIdx;
                    return (
                      <button
                        key={card.oracle_id}
                        data-idx={idx}
                        onClick={() => selectCard(card)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          width: '100%', textAlign: 'left', padding: '6px 16px',
                          background: active ? 'var(--surface-3)' : 'transparent',
                          border: 'none', outline: 'none', cursor: 'pointer',
                          boxShadow: active ? 'inset 2px 0 0 var(--accent)' : 'none',
                          transition: 'background 0.08s',
                        }}
                      >
                        {/* Card thumbnail */}
                        <div style={{
                          width: 32, height: 44, borderRadius: 4, overflow: 'hidden',
                          flexShrink: 0, background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                        }}>
                          {card.image_url ? (
                            <img
                              src={card.image_url}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--text-faint)" strokeWidth="1.5">
                                <rect x="2" y="2" width="12" height="12" rx="1"/>
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Card info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2,
                          }}>
                            <span style={{
                              fontSize: '13px', fontWeight: active ? 600 : 500,
                              color: active ? 'var(--text)' : 'var(--text-muted)',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {card.name}
                            </span>
                            <ManaPips cost={card.mana_cost as string | null} />
                          </div>
                          <div style={{
                            fontSize: '11px', color: 'var(--text-faint)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {card.type_line as string}
                          </div>
                        </div>

                        {/* Set/collector badge */}
                        <span style={{
                          fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
                          color: 'var(--text-faintest)', flexShrink: 0,
                          textTransform: 'uppercase',
                        }}>
                          {card.set_code as string}
                        </span>
                      </button>
                    );
                  })}
                  {cardLoading && cardResults.length === 0 && (
                    <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-faint)' }}>
                      Searching…
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: '16px', alignItems: 'center',
          fontSize: '10px', color: 'var(--text-faintest)',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          <span><kbd style={kbdStyle}>↑</kbd><kbd style={kbdStyle}>↓</kbd>navigate</span>
          <span><kbd style={kbdStyle}>↵</kbd>open</span>
          <span><kbd style={kbdStyle}>esc</kbd>close</span>
          <span style={{ marginLeft: 'auto', opacity: 0.6 }}>⌘K</span>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
