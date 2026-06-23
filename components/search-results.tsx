'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { ScryfallCard } from '@/lib/db/queries';

const RARITY_COLOR: Record<string, string> = {
  common: '#9bb3ad', uncommon: '#a9c0ba', rare: '#e8b14a', mythic: '#e2643c',
};
const MANA_COLORS: Record<string, string> = {
  W: '#f7efd2', U: '#a9def9', B: '#bcb4ad', R: '#f3a48b', G: '#93c8a6',
};

function cardImageUrl(card: ScryfallCard): string | null {
  if (card.image_uris) return card.image_uris.normal ?? card.image_uris.small ?? null;
  if (card.card_faces) {
    const face = (card.card_faces as Array<{ image_uris?: Record<string, string> }>)[0];
    return face?.image_uris?.normal ?? face?.image_uris?.small ?? null;
  }
  return null;
}

const VIEW_KEY = 'lodestone-view-mode';

export function SearchResults({
  cards,
  prevUrl,
  nextUrl,
  page,
}: {
  cards: ScryfallCard[];
  prevUrl: string | null;
  nextUrl: string | null;
  page: number;
}) {
  const [view, setView] = useState<'gallery' | 'list'>('gallery');

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === 'list' || stored === 'gallery') setView(stored);
  }, []);

  function toggleView(v: 'gallery' | 'list') {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  }

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 4 }}>
        <button
          onClick={() => toggleView('gallery')}
          title="Gallery view"
          style={{
            padding: '5px 10px', borderRadius: '6px 0 0 6px', cursor: 'pointer',
            border: '1px solid #214a47',
            background: view === 'gallery' ? '#1a3c3a' : '#0e292b',
            color: view === 'gallery' ? '#e8b14a' : '#6f8a85',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
            <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
          </svg>
        </button>
        <button
          onClick={() => toggleView('list')}
          title="List view"
          style={{
            padding: '5px 10px', borderRadius: '0 6px 6px 0', cursor: 'pointer',
            border: '1px solid #214a47', borderLeft: 'none',
            background: view === 'list' ? '#1a3c3a' : '#0e292b',
            color: view === 'list' ? '#e8b14a' : '#6f8a85',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="1" y1="4" x2="15" y2="4"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="1" y1="12" x2="15" y2="12"/>
          </svg>
        </button>
      </div>

      {view === 'gallery' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
          {cards.map(card => {
            const img = cardImageUrl(card);
            const ci = card.color_identity ?? [];
            const rarityColor = RARITY_COLOR[card.rarity ?? ''] ?? '#6f8a85';
            return (
              <Link key={card.scryfall_id} href={`/card/${card.set_code}/${card.collector_number}`}
                style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{
                  borderRadius: '10px', overflow: 'hidden', border: '1px solid #1a3c3a',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
                  background: '#0e292b', aspectRatio: '0.717',
                }}>
                  {img ? (
                    <img src={img} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '6px' }}>
                      {ci.map((c: string) => (
                        <span key={c} style={{ width: '26px', height: '26px', borderRadius: '50%', background: MANA_COLORS[c] ?? '#c9c3bc', display: 'inline-block' }} />
                      ))}
                      {ci.length === 0 && <span style={{ fontSize: '24px', color: '#3f5d59' }}>⬡</span>}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#f4f0e6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {card.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                    {card.rarity && (
                      <span style={{ fontSize: '10px', color: rarityColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {card.rarity}
                      </span>
                    )}
                    <span style={{ fontSize: '10px', color: '#4a6660' }}>·</span>
                    <span style={{ fontSize: '10px', color: '#8aa39d', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {card.set_code.toUpperCase()}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {cards.map(card => {
            const img = cardImageUrl(card);
            const rarityColor = RARITY_COLOR[card.rarity ?? ''] ?? '#6f8a85';
            return (
              <Link key={card.scryfall_id} href={`/card/${card.set_code}/${card.collector_number}`}
                style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '7px 10px', borderRadius: 8,
                  background: '#0e292b', border: '1px solid #1a3c3a',
                }}>
                  {img && (
                    <img src={img} alt={card.name} style={{ width: 32, height: 45, borderRadius: 4, objectFit: 'cover', objectPosition: 'top', flexShrink: 0, border: '1px solid #000' }} loading="lazy" />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f0e6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {card.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#6f8a85', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {card.type_line}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    {card.mana_cost && (
                      <span style={{ fontSize: 11, color: '#8aa39d', fontFamily: "'IBM Plex Mono', monospace" }}>{card.mana_cost}</span>
                    )}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {card.rarity && (
                        <span style={{ fontSize: 10, color: rarityColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.rarity}</span>
                      )}
                      <span style={{ fontSize: 10, color: '#4a6660', fontFamily: "'IBM Plex Mono', monospace" }}>{card.set_code.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {(prevUrl || nextUrl) && (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 40, alignItems: 'center' }}>
          {prevUrl ? (
            <Link href={prevUrl} style={{ color: '#e8b14a', textDecoration: 'none', fontSize: 14 }}>← Previous</Link>
          ) : <span />}
          <span style={{ fontSize: 12, color: '#6f8a85' }}>Page {page}</span>
          {nextUrl ? (
            <Link href={nextUrl} style={{ color: '#e8b14a', textDecoration: 'none', fontSize: 14 }}>Next →</Link>
          ) : <span />}
        </div>
      )}
    </>
  );
}
