'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { actionListDecks, actionListPublicDecks } from '@/app/actions';
import Link from 'next/link';

interface CardSearchResult {
  scryfall_id: string;
  oracle_id: string;
  name: string;
  set_code: string;
  collector_number: string;
  type_line: string | null;
  mana_cost: string | null;
  image_url: string | null;
  color_identity: string[];
}

interface PrintingOption {
  scryfall_id: string;
  treatment: string;
  finishes: string[];
  rarity: string | null;
  image_url: string | null;
  label: string;
  set_code: string;
  collector_number: string;
  prices_usd: { nonfoil?: string | null; foil?: string | null };
}

interface ShopPrice {
  shop_name: string;
  shop_url: string;
  product_url: string | null;
  price_nzd: number;
  condition: string;
  finish: string;
  confidence: string;
  available?: boolean;
}

function SearchPageInner() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [selected, setSelected] = useState<CardSearchResult | null>(null);
  const [printings, setPrintings] = useState<PrintingOption[]>([]);
  const [activePrinting, setActivePrinting] = useState<PrintingOption | null>(null);
  const [activeFinish, setActiveFinish] = useState<'nonfoil' | 'foil'>('nonfoil');
  const [prices, setPrices] = useState<ShopPrice[] | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [trackedShops, setTrackedShops] = useState<{ name: string; base_url: string }[]>([]);
  const [recentDecks, setRecentDecks] = useState<{ id: string; name: string; format: string; commander: string | null; card_count: number; updated_at: string; public_slug: string | null }[]>([]);
  const [trendingDecks, setTrendingDecks] = useState<{ id: string; name: string; format: string; commander: string | null; card_count: number; like_count: number; public_slug: string | null }[]>([]);
  const { user } = useAuth();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  async function handleQueryChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2) { setSuggestions([]); setResults([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const data = await res.json() as { suggestions: string[]; cards: CardSearchResult[] };
        setSuggestions(data.suggestions ?? []);
        setResults(data.cards ?? []);
        setShowDropdown(true);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 250);
  }

  async function selectCard(card: CardSearchResult) {
    setSelected(card);
    setQuery(card.name);
    setShowDropdown(false);
    setPrices(null);
    setActivePrinting(null);
    const res = await fetch(`/api/card/${card.oracle_id}/printings`);
    const data = await res.json() as { options: PrintingOption[] };
    setPrintings(data.options ?? []);
    if (data.options?.length > 0) {
      const defaultPrint = data.options.find(p => p.treatment === 'normal') ?? data.options[0];
      setActivePrinting(defaultPrint);
      const finish = defaultPrint.finishes.includes('nonfoil') ? 'nonfoil' : 'foil';
      setActiveFinish(finish);
      await loadPrices(defaultPrint, finish);
    }
  }

  async function selectSuggestion(name: string) {
    setQuery(name);
    setShowDropdown(false);
    const match = results.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (match) { await selectCard(match); return; }
    const res = await fetch(`/api/search?q=${encodeURIComponent(name)}`);
    const data = await res.json() as { cards: CardSearchResult[] };
    const found = data.cards?.find(c => c.name.toLowerCase() === name.toLowerCase()) ?? data.cards?.[0];
    if (found) await selectCard(found);
  }

  async function loadPrices(printing: PrintingOption, finish: 'nonfoil' | 'foil') {
    setLoadingPrices(true);
    setPrices(null);
    try {
      const matchKey = `${printing.set_code.toLowerCase()}::${printing.collector_number}::${finish}`;
      const res = await fetch('/api/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_key: matchKey, condition_floor: 'lp' }),
      });
      const data = await res.json() as { prices: ShopPrice[] };
      setPrices(data.prices ?? []);
    } finally {
      setLoadingPrices(false);
    }
  }

  async function handlePrintingChange(printing: PrintingOption) {
    setActivePrinting(printing);
    const finish = printing.finishes.includes(activeFinish) ? activeFinish
      : printing.finishes.includes('nonfoil') ? 'nonfoil' : 'foil';
    setActiveFinish(finish);
    await loadPrices(printing, finish);
  }

  async function handleFinishChange(finish: 'nonfoil' | 'foil') {
    setActiveFinish(finish);
    if (activePrinting) await loadPrices(activePrinting, finish);
  }

  // Load tracked shops for accurate messaging
  useEffect(() => {
    fetch('/api/shops').then(r => r.json()).then((d: { shops: { name: string; base_url: string }[] }) => {
      setTrackedShops(d.shops ?? []);
    }).catch(() => {});
  }, []);

  // Load recent decks for logged-in users
  useEffect(() => {
    if (user && user.id !== 'local') {
      actionListDecks().then(decks => {
        setRecentDecks((decks as typeof recentDecks).slice(0, 4));
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Load trending public decks (regardless of login state)
  useEffect(() => {
    actionListPublicDecks(6).then(decks => {
      setTrendingDecks(decks as typeof trendingDecks);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select card when navigated to /?q=<name> (e.g. from /search results)
  const searchParams = useSearchParams();
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !selected) { selectSuggestion(q); }
  // selectSuggestion is stable per render; we only want this once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalPrintings = printings.filter(p => p.treatment === 'normal');
  const specialPrintings = printings.filter(p => p.treatment !== 'normal');
  const bestPrice = prices && prices.length > 0 ? prices[0] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', minWidth: 0 }}>

      {/* Inner top bar */}
      <div style={{
        height: '56px', flexShrink: 0,
        borderBottom: '1px solid #173a38',
        display: 'flex', alignItems: 'center',
        padding: '0 28px', gap: '16px',
      }}>
        {selected ? (
          <>
            <button onClick={() => { setSelected(null); setQuery(''); setPrices(null); setPrintings([]); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6f8a85', fontSize: '13px', padding: 0, display: 'flex', alignItems: 'center', gap: '4px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
              ← Search
            </button>
            <span style={{ color: '#3f5d59' }}>/</span>
            <span style={{ color: '#dfeae6', fontWeight: 600, fontSize: '13px' }}>{selected.name}</span>
            <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11.5px', color: '#6f8a85' }}>
              {activePrinting ? `${activePrinting.set_code.toUpperCase()} #${activePrinting.collector_number}` : ''} · NZD
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '13px', color: '#6f8a85', fontWeight: 500 }}>Aotearoa price index</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#7fd6a6', background: 'rgba(84,192,138,0.1)', border: '1px solid rgba(84,192,138,0.28)', padding: '3px 9px', borderRadius: '20px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#54c08a', animation: 'ls-pulse 2s ease-in-out infinite', flexShrink: 0 }} />
              {trackedShops.length || '…'} shops
            </div>
            <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace", fontSize: '11.5px', color: '#6f8a85' }}>NZD</span>
          </>
        )}
      </div>

      {!selected ? (
        /* Hero search */
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '64px 56px 56px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: 'radial-gradient(120% 80% at 50% -10%, #102d2f 0%, #07151a 55%)',
        }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', letterSpacing: '3px', color: '#e8b14a', textTransform: 'uppercase', marginBottom: '14px' }}>
            ⬡ Point true · dig for value
          </div>
          <h1 style={{ fontWeight: 700, fontSize: 'clamp(28px,4vw,42px)', lineHeight: 1.1, textAlign: 'center', margin: '0 0 10px', maxWidth: '680px', letterSpacing: '-0.5px' }}>
            Every card. Every NZ shop.{' '}
            <span style={{ color: '#e8b14a' }}>One best price.</span>
          </h1>
          <p style={{ fontSize: '15px', color: '#9bb3ad', textAlign: 'center', maxWidth: '520px', margin: '0 0 32px', lineHeight: 1.55 }}>
            Search any Magic card, compare live prices across New Zealand retailers, and build Commander decks that don&apos;t gut your wallet.
          </p>

          {/* Search box */}
          <div style={{ width: '100%', maxWidth: '640px', position: 'relative' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: '#0e292b',
              border: `1.5px solid ${query.length >= 2 ? '#e8b14a' : '#214a47'}`,
              borderRadius: '14px', padding: '14px 18px',
              boxShadow: query.length >= 2 ? '0 0 0 4px rgba(232,177,74,0.1), 0 12px 30px rgba(0,0,0,0.4)' : '0 12px 30px rgba(0,0,0,0.3)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={query.length >= 2 ? '#e8b14a' : '#6f8a85'} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, transition: 'stroke 0.15s' }}>
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
              </svg>
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                onFocus={() => query.length >= 2 && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && query.trim().length >= 2) {
                    window.location.href = `/search?q=${encodeURIComponent(query.trim())}`;
                  }
                }}
                placeholder="Search any Magic card…"
                autoComplete="off"
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: '#eef3f0', fontSize: '16px', fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              />
              {loadingSuggestions && (
                <span style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #e8b14a', borderTopColor: 'transparent', animation: 'ls-spin 0.7s linear infinite', flexShrink: 0, display: 'inline-block' }} />
              )}
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#6f8a85', border: '1px solid #214a47', borderRadius: '5px', padding: '2px 7px', flexShrink: 0 }}>⌘K</span>
            </div>

            {/* Dropdown */}
            {showDropdown && results.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
                background: '#0e292b', border: '1px solid #214a47', borderRadius: '12px',
                boxShadow: '0 24px 50px rgba(0,0,0,0.6)', overflow: 'hidden', zIndex: 100,
              }}>
                <div style={{ padding: '8px 16px', fontSize: '10.5px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6f8a85', borderBottom: '1px solid #173a38', fontFamily: "'IBM Plex Mono', monospace" }}>
                  Cards
                </div>
                {results.slice(0, 6).map((card, i) => (
                  <button key={card.scryfall_id} onMouseDown={() => selectCard(card)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      width: '100%', textAlign: 'left', padding: '10px 16px',
                      background: i === 0 ? '#163436' : 'none', border: 'none',
                      borderBottom: i < Math.min(results.length, 6) - 1 ? '1px solid #173a38' : 'none',
                      cursor: 'pointer',
                    }}>
                    {card.image_url ? (
                      <img src={card.image_url} alt="" style={{ width: '30px', height: '42px', borderRadius: '3px', border: '1px solid #000', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '30px', height: '42px', borderRadius: '3px', background: 'linear-gradient(160deg,#2a3a3a,#1a2a2a)', border: '1px solid #000', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#f4f0e6' }}>{card.name}</div>
                      <div style={{ fontSize: '11.5px', color: '#8aa39d' }}>{card.type_line ?? 'Card'} · {card.set_code.toUpperCase()}</div>
                    </div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#8aa39d', flexShrink: 0 }}>
                      {card.set_code.toUpperCase()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent decks (logged-in users only) */}
          {recentDecks.length > 0 && (
            <div style={{ width: '100%', maxWidth: '640px', marginTop: '44px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", color: '#e8b14a', letterSpacing: '2px', textTransform: 'uppercase' }}>
                  Recent decks
                </span>
                <Link href="/decks" style={{ fontSize: '12px', color: '#6f8a85', textDecoration: 'none' }}>All decks →</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {recentDecks.map(d => (
                  <Link key={d.id} href={`/decks/${d.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#0f2a2c', border: '1px solid #1d4441', borderRadius: '10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: '#f4f0e6', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                        {d.commander && <span style={{ fontSize: '12px', color: '#e8b14a', fontStyle: 'italic', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.commander}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: 'rgba(232,177,74,0.12)', color: '#e8b14a', textTransform: 'capitalize', fontFamily: "'IBM Plex Mono', monospace" }}>{d.format}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#5f7a76' }}>{d.card_count}c</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Trending community decks */}
          <div style={{ width: '100%', maxWidth: '640px', marginTop: recentDecks.length > 0 ? '28px' : '44px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", color: '#6f8a85', letterSpacing: '2px', textTransform: 'uppercase' }}>
                Community decks
              </span>
              <Link href="/decks/browse" style={{ fontSize: '12px', color: '#6f8a85', textDecoration: 'none' }}>Browse all →</Link>
            </div>
            {trendingDecks.length === 0 ? (
              <div style={{ padding: '20px 18px', background: '#0c2123', border: '1px solid #1a3c3a', borderRadius: '10px', textAlign: 'center' }}>
                <p style={{ color: '#5f7a76', fontSize: '12px', margin: 0 }}>No public decks yet — be the first to publish one.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {trendingDecks.map(d => (
                  <Link key={d.id} href={d.public_slug ? `/d/${d.public_slug}` : `/decks/${d.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ padding: '12px 14px', background: '#0c2123', border: '1px solid #1a3c3a', borderRadius: '10px' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#f4f0e6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>{d.name}</div>
                      {d.commander && <div style={{ fontSize: '11px', color: '#e8b14a', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '4px' }}>{d.commander}</div>}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(232,177,74,0.1)', color: '#e8b14a', textTransform: 'capitalize', fontFamily: "'IBM Plex Mono', monospace" }}>{d.format}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#5f7a76' }}>{d.card_count}c</span>
                        {d.like_count > 0 && <span style={{ fontSize: '10px', color: '#e2645c' }}>❤ {d.like_count}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick start CTAs */}
          <div style={{ display: 'flex', gap: '18px', marginTop: '52px', width: '100%', maxWidth: '640px' }}>
            <a href="/decks" style={{ flex: 1, background: '#0f2a2c', border: '1px solid #214a47', borderRadius: '14px', padding: '22px', textDecoration: 'none', display: 'block' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#163436', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e8b14a" strokeWidth="2" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="13" rx="2" /><path d="M7 20h10" />
                </svg>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#f4f0e6' }}>Build a new deck</div>
              <div style={{ fontSize: '13px', color: '#8aa39d', marginTop: '4px', lineHeight: 1.5 }}>Start a Commander deck, set your commander, track price as you go.</div>
            </a>
            <div onClick={() => searchInputRef.current?.focus()}
              style={{ flex: 1, background: '#0f2a2c', border: '1px solid #214a47', borderRadius: '14px', padding: '22px', cursor: 'pointer' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#163436', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e8b14a" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
                </svg>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#f4f0e6' }}>Price a card</div>
              <div style={{ fontSize: '13px', color: '#8aa39d', marginTop: '4px', lineHeight: 1.5 }}>Find the cheapest NZ retailer for any single card and treatment.</div>
            </div>
          </div>

          {/* Popular searches */}
          <div style={{ marginTop: '24px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['Sol Ring', 'Rhystic Study', 'Cyclonic Rift', 'Command Tower', 'Arcane Signet'].map(name => (
              <button key={name} onMouseDown={() => { setQuery(name); handleQueryChange(name); }}
                style={{ padding: '5px 12px', borderRadius: '20px', background: 'rgba(255,255,255,0.04)', border: '1px solid #1d4441', color: '#8aa39d', fontSize: '12px', cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif" }}>
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Card detail (Screen 2) */
        <div style={{ flex: 1, padding: '30px 36px', display: 'grid', gridTemplateColumns: '300px 1fr', gap: '36px', alignItems: 'start', overflowY: 'auto' }}>

          {/* LEFT: image + finish + add */}
          <div>
            <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #000', boxShadow: '0 20px 44px rgba(0,0,0,0.6)', background: '#0e292b' }}>
              {activePrinting?.image_url ? (
                <img src={activePrinting.image_url} alt={selected.name} style={{ width: '100%', display: 'block' }} loading="eager" />
              ) : (
                <div style={{ aspectRatio: '0.717', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6f8a85', fontSize: '13px' }}>
                  No image available
                </div>
              )}
            </div>

            {/* Finish toggle */}
            {activePrinting && (activePrinting.finishes.includes('nonfoil') || activePrinting.finishes.includes('foil')) && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                {(['nonfoil', 'foil'] as const).filter(f => activePrinting.finishes.includes(f)).map(f => (
                  <button key={f} onClick={() => handleFinishChange(f)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: '9px',
                      border: activeFinish === f ? '1.5px solid #e8b14a' : '1px solid #214a47',
                      borderRadius: '10px', padding: '9px 12px',
                      background: activeFinish === f ? '#163436' : 'transparent',
                      cursor: 'pointer',
                    }}>
                    <div style={{
                      width: '24px', height: '34px', borderRadius: '3px', border: '1px solid #000', flexShrink: 0,
                      background: f === 'foil' ? 'linear-gradient(120deg,#7b6bd6,#d67ba8,#e8b14a,#6bd6c4)' : 'radial-gradient(circle at 50% 40%,#e8c878,#7a5e2a)',
                    }} />
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: activeFinish === f ? '#f4f0e6' : '#cfe0db' }}>
                        {f === 'foil' ? 'Foil' : 'Nonfoil'}
                      </div>
                      {bestPrice && activeFinish === f && (
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10.5px', color: '#7fd6a6' }}>from ${bestPrice.price_nzd.toFixed(2)}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Add to deck */}
            <a href="/decks" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              background: '#e8b14a', color: '#0a1f22', fontSize: '14px', fontWeight: 700,
              borderRadius: '10px', padding: '12px', textDecoration: 'none', marginTop: '14px',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0a1f22" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add to deck
            </a>
          </div>

          {/* RIGHT: meta + printings + prices */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontWeight: 700, fontSize: '30px', margin: 0, letterSpacing: '-0.3px' }}>{selected.name}</h1>
              <ManaIcons identity={selected.color_identity} size={22} />
            </div>
            {selected.type_line && (
              <div style={{ fontSize: '14px', color: '#9bb3ad', marginTop: '5px' }}>{selected.type_line}</div>
            )}

            {/* Printings */}
            {printings.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '24px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6f8a85' }}>Printings &amp; treatments</div>
                  <div style={{ fontSize: '12px', color: '#8aa39d' }}>{printings.length} printings</div>
                </div>
                {specialPrintings.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '10.5px', color: '#e8b14a', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Special</div>
                    <PrintingGrid printings={specialPrintings} active={activePrinting} onSelect={handlePrintingChange} />
                  </div>
                )}
                {normalPrintings.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '10.5px', color: '#6f8a85', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Standard</div>
                    <PrintingGrid printings={normalPrintings} active={activePrinting} onSelect={handlePrintingChange} />
                  </div>
                )}
              </>
            )}

            {/* Price table */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '26px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6f8a85' }}>Best NZ price</div>
              {activePrinting && (
                <div style={{ fontSize: '12px', color: '#e8b14a', fontWeight: 600 }}>
                  {activePrinting.set_code.toUpperCase()} #{activePrinting.collector_number} · {activeFinish}
                </div>
              )}
            </div>

            {loadingPrices ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#6f8a85', fontSize: '13px' }}>Checking shops…</div>
            ) : prices !== null ? (
              prices.length === 0 ? (
                <div style={{ marginTop: '12px', background: '#0e272a', border: '1px solid #1a3c3a', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
                  <p style={{ color: '#8aa39d', fontSize: '13.5px', margin: 0 }}>Not stocked at our {trackedShops.length || 'tracked'} partner shops</p>
                  <p style={{ color: '#5f7a76', fontSize: '12px', marginTop: '6px', marginBottom: 0 }}>
                    {trackedShops.length > 0
                      ? `Checked: ${trackedShops.map(s => s.name).join(', ')}`
                      : 'Try syncing to refresh shop stock.'}
                  </p>
                </div>
              ) : (
                <div style={{ border: '1px solid #1a3c3a', borderRadius: '12px', overflow: 'hidden', marginTop: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 1fr 0.9fr 86px', padding: '9px 16px', background: '#0c2426', fontSize: '10.5px', letterSpacing: '1px', textTransform: 'uppercase', color: '#6f8a85', fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>
                    <div>Retailer</div><div>Condition</div><div>Confidence</div><div style={{ textAlign: 'right' }}>Price</div><div />
                  </div>
                  {prices.map((p, i) => <PriceRow key={i} price={p} isBest={i === 0} />)}
                </div>
              )
            ) : null}
          </div>
        </div>
      )}

      <style>{`@keyframes ls-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#07151a' }} />}>
      <SearchPageInner />
    </Suspense>
  );
}

function ManaIcons({ identity, size = 18 }: { identity?: string[] | null; size?: number }) {
  const colors: Record<string, string> = { W: '#f7efd2', U: '#a9def9', B: '#bcb4ad', R: '#f3a48b', G: '#93c8a6' };
  return (
    <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      {(identity ?? []).map(c => (
        <span key={c} style={{
          width: size, height: size, borderRadius: '50%',
          background: colors[c] ?? '#c9c3bc',
          border: '1px solid rgba(0,0,0,0.2)', flexShrink: 0, display: 'inline-block',
          boxShadow: 'inset 0 -2px 3px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.4)',
        }} title={c} />
      ))}
    </span>
  );
}

function PrintingGrid({ printings, active, onSelect }: {
  printings: PrintingOption[];
  active: PrintingOption | null;
  onSelect: (p: PrintingOption) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', gap: '10px' }}>
      {printings.slice(0, 12).map(p => {
        const isActive = active?.scryfall_id === p.scryfall_id;
        return (
          <button key={p.scryfall_id} onClick={() => onSelect(p)} title={p.label}
            style={{ border: isActive ? '1.5px solid #e8b14a' : '1px solid #1a3c3a', borderRadius: '9px', padding: '6px', background: isActive ? '#163436' : 'transparent', cursor: 'pointer' }}>
            {p.image_url ? (
              <img src={p.image_url} alt={p.label} style={{ width: '100%', aspectRatio: '0.717', borderRadius: '4px', display: 'block', objectFit: 'cover' }} loading="lazy" />
            ) : (
              <div style={{ aspectRatio: '0.717', borderRadius: '4px', background: '#0e292b' }} />
            )}
            <div style={{ fontSize: '9.5px', color: isActive ? '#f4c463' : '#a9c0ba', marginTop: '5px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.set_code.toUpperCase()}
            </div>
          </button>
        );
      })}
      {printings.length > 12 && (
        <div style={{ border: '1px solid #1a3c3a', borderRadius: '9px', padding: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6f8a85' }}>
          <div style={{ fontSize: '16px' }}>+{printings.length - 12}</div>
          <div style={{ fontSize: '9.5px', marginTop: '2px' }}>more</div>
        </div>
      )}
    </div>
  );
}

function PriceRow({ price, isBest }: { price: ShopPrice; isBest: boolean }) {
  const confMap: Record<string, { bg: string; border: string; color: string; dot: string; label: string }> = {
    exact:    { bg: 'rgba(84,192,138,0.12)',  border: 'rgba(84,192,138,0.4)',  color: '#7fd6a6', dot: '#54c08a', label: 'Exact' },
    probable: { bg: 'rgba(240,207,91,0.10)',  border: 'rgba(240,207,91,0.38)', color: '#e6ce7a', dot: '#f0cf5b', label: 'Probable' },
    weak:     { bg: 'rgba(224,145,58,0.10)',  border: 'rgba(224,145,58,0.35)', color: '#eaa863', dot: '#e0913a', label: '⚠ Weak' },
    none:     { bg: 'rgba(226,100,92,0.10)',  border: 'rgba(226,100,92,0.35)', color: '#d07070', dot: '#e2645c', label: 'None' },
  };
  const cs = confMap[price.confidence] ?? confMap.none;
  const available = price.available !== false;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 1fr 0.9fr 86px',
      padding: '12px 16px', alignItems: 'center',
      borderTop: '1px solid #143230',
      background: isBest ? 'rgba(232,177,74,0.07)' : 'transparent',
      opacity: available ? 1 : 0.7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: isBest ? '#eef3f0' : '#dfeae6' }}>{price.shop_name}</span>
        {isBest && <span style={{ fontSize: '10px', fontWeight: 700, color: '#0a1f22', background: '#e8b14a', padding: '1px 6px', borderRadius: '4px' }}>BEST</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: available ? '#7fd6a6' : '#c98e8a' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: available ? '#54c08a' : '#e2645c', flexShrink: 0 }} />
        {price.condition}
      </div>
      <div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 600, padding: '3px 9px', borderRadius: '6px', color: cs.color, background: cs.bg, border: `1px solid ${cs.border}` }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: cs.dot, flexShrink: 0 }} />
          {cs.label}
        </span>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '16px', fontWeight: 600, textAlign: 'right', color: isBest ? '#f4f0e6' : '#dfeae6', textDecoration: available ? 'none' : 'line-through' }}>
        ${price.price_nzd.toFixed(2)}
      </div>
      <div style={{ textAlign: 'right' }}>
        {available && price.product_url ? (
          <a href={price.product_url} target="_blank" rel="noopener" style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '7px', textDecoration: 'none', color: isBest ? '#0a1f22' : '#f4c463', background: isBest ? '#e8b14a' : 'transparent', border: isBest ? 'none' : '1px solid #2f5a52' }}>
            Buy →
          </a>
        ) : (
          <span style={{ fontSize: '12px', color: '#5f7a76' }}>Out of stock</span>
        )}
      </div>
    </div>
  );
}
