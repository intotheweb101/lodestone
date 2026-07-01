'use client';
import { useState, useEffect, useRef } from 'react';

interface TokenCard {
  name: string;
  type_line: string;
  oracle_text: string;
  power: string | null;
  toughness: string | null;
  image_url: string;
}

export function TokenPicker() {
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<TokenCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<TokenCard | null>(null);
  const [empty, setEmpty] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchTokens(query);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Load an initial set on mount
  useEffect(() => { fetchTokens(''); }, []);

  async function fetchTokens(q: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/play/tokens?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json() as { cards: TokenCard[]; total: number };
      setCards(data.cards);
      setEmpty(data.cards.length === 0);
    } catch {
      setCards([]);
      setEmpty(true);
    } finally {
      setLoading(false);
    }
  }

  const mono = "'IBM Plex Mono', monospace";
  const sans = "'IBM Plex Sans', sans-serif";

  // Full-screen lightbox for a selected token
  if (expanded) {
    return (
      <div>
        <button
          onClick={() => setExpanded(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: mono,
          }}
        >
          ← Back
        </button>
        <img
          src={expanded.image_url}
          alt={expanded.name}
          style={{ width: '100%', borderRadius: 12, display: 'block' }}
        />
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)', fontFamily: sans }}>{expanded.name}</div>
        {expanded.power && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: mono }}>{expanded.power}/{expanded.toughness}</div>}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: sans }}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search tokens & emblems…"
        style={{
          width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: 13, marginBottom: 10,
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.8)', fontFamily: sans, outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {loading && (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: mono, padding: '8px 0' }}>
          Loading…
        </div>
      )}
      {!loading && empty && (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: mono, padding: '8px 0' }}>
          {query ? `No tokens matching "${query}"` : 'No token data — run a Scryfall sync first'}
        </div>
      )}
      {!loading && !empty && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          maxHeight: 280,
          overflowY: 'auto',
        }}>
          {cards.map(c => (
            <button
              key={c.name}
              onClick={() => setExpanded(c)}
              title={c.name}
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: 3, cursor: 'pointer', overflow: 'hidden',
              }}
            >
              <img
                src={c.image_url}
                alt={c.name}
                style={{ width: '100%', borderRadius: 6, display: 'block' }}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
