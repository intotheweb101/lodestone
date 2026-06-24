'use client';
import { ShoppingListPanel } from '@/components/shopping-list-panel';
import type { Deck, DeckEntry } from '@/lib/deck/model';

interface ShopMeta {
  name: string;
  base_url: string;
  shipping_flat: number | null;
  free_threshold: number | null;
}

interface Props {
  deck: Deck;
  collection: Record<string, { have: number; foil_have: number }>;
  imageMap: Record<string, string | null>;
  shopMeta: Record<number, ShopMeta>;
  onAddToWishlist?: (entry: DeckEntry) => void;
}

interface OwnedStatus {
  entry: DeckEntry;
  have: number;
  need: number;
  fullyOwned: boolean;
}

export function AcquireTab({ deck, collection, imageMap, shopMeta, onAddToWishlist }: Props) {
  const mainboard = deck.entries.filter(e => !e.board || e.board === 'main');

  const statuses: OwnedStatus[] = mainboard.map(entry => {
    const have = (collection[entry.oracle_id]?.have ?? 0) + (collection[entry.oracle_id]?.foil_have ?? 0);
    const need = Math.max(0, entry.quantity - have);
    return { entry, have: Math.min(have, entry.quantity), need, fullyOwned: need === 0 };
  });

  const totalCards = mainboard.reduce((s, e) => s + e.quantity, 0);
  const ownedCards = statuses.reduce((s, st) => s + st.have, 0);
  const missingCards = totalCards - ownedCards;
  const pct = totalCards > 0 ? Math.round((ownedCards / totalCards) * 100) : 0;

  const missing = statuses.filter(s => !s.fullyOwned);
  const owned = statuses.filter(s => s.fullyOwned);

  const mono = { fontFamily: "'IBM Plex Mono', monospace" } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Ownership progress */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ ...mono, fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            Collection coverage
          </span>
          <span style={{ ...mono, fontSize: 20, fontWeight: 700, color: pct === 100 ? '#54c08a' : 'var(--accent)' }}>
            {ownedCards}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-faint)' }}>/{totalCards}</span>
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ height: 8, borderRadius: 5, background: 'var(--border)', overflow: 'hidden', marginBottom: 8 }}>
          <div style={{
            height: '100%', borderRadius: 5, transition: 'width 0.4s ease',
            width: `${pct}%`,
            background: pct === 100
              ? '#54c08a'
              : `linear-gradient(90deg, var(--accent) 0%, ${pct > 60 ? '#54c08a' : 'var(--accent)'} 100%)`,
          }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)', ...mono }}>
          <span>{pct}% owned</span>
          {missingCards > 0 && <span style={{ color: '#e2645c' }}>{missingCards} missing</span>}
          {missingCards === 0 && <span style={{ color: '#54c08a' }}>Complete!</span>}
        </div>
      </div>

      {/* Missing cards */}
      {missing.length > 0 && (
        <div>
          <div style={{ ...mono, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 10 }}>
            Missing ({missing.length} card{missing.length !== 1 ? 's' : ''}, {missingCards} copies)
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
            gap: 8,
          }}>
            {missing.map(({ entry, have, need }) => {
              const img = imageMap[entry.oracle_id] ?? null;
              return (
                <div key={entry.oracle_id} style={{ position: 'relative' }}>
                  <div style={{
                    borderRadius: 6, overflow: 'hidden',
                    border: '1px solid rgba(226,100,92,0.4)',
                    background: 'var(--surface)',
                  }}>
                    {img ? (
                      <img src={img} alt={entry.card_name} style={{ width: '100%', aspectRatio: '0.717', objectFit: 'cover', display: 'block' }} loading="lazy" />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '0.717', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text-faint)', padding: 4, textAlign: 'center' }}>
                        {entry.card_name}
                      </div>
                    )}
                  </div>

                  {/* Need badge */}
                  <div style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(226,100,92,0.9)', color: '#fff',
                    ...mono, fontSize: 9, fontWeight: 700,
                    padding: '1px 4px', borderRadius: 3,
                  }}>
                    -{need}
                  </div>

                  {/* Have badge (partial ownership) */}
                  {have > 0 && (
                    <div style={{
                      position: 'absolute', top: 4, left: 4,
                      background: 'rgba(84,192,138,0.9)', color: '#0a1f22',
                      ...mono, fontSize: 9, fontWeight: 700,
                      padding: '1px 4px', borderRadius: 3,
                    }}>
                      {have}✓
                    </div>
                  )}

                  <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {entry.card_name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Shop pricing */}
      {missing.length > 0 && (
        <div>
          <div style={{ ...mono, fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 10 }}>
            Buy missing — NZ shops
          </div>
          <ShoppingListPanel source="deck-missing" deckId={deck.id} shopMeta={shopMeta} />
        </div>
      )}

      {/* Owned cards (collapsed summary) */}
      {owned.length > 0 && missingCards > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-faint)', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase' }}>
              Already own ({owned.length})
            </span>
          </summary>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 6 }}>
            {owned.map(({ entry }) => {
              const img = imageMap[entry.oracle_id] ?? null;
              return (
                <div key={entry.oracle_id} style={{ position: 'relative', opacity: 0.65 }}>
                  <div style={{ borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(84,192,138,0.3)' }}>
                    {img ? (
                      <img src={img} alt={entry.card_name} style={{ width: '100%', aspectRatio: '0.717', objectFit: 'cover', display: 'block' }} loading="lazy" />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '0.717', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'var(--text-faint)', padding: 3, textAlign: 'center' }}>
                        {entry.card_name}
                      </div>
                    )}
                  </div>
                  <div style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(84,192,138,0.9)', color: '#0a1f22', fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, fontWeight: 700, padding: '1px 3px', borderRadius: 2 }}>✓</div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* All owned */}
      {missingCards === 0 && totalCards > 0 && (
        <div style={{ background: 'rgba(84,192,138,0.08)', border: '1px solid rgba(84,192,138,0.25)', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#54c08a', marginBottom: 4 }}>You own this deck!</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>All {totalCards} cards are in your collection.</div>
        </div>
      )}
    </div>
  );
}
