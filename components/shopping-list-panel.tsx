'use client';

import { useState, useEffect } from 'react';
import type { PricedDeck, BasketEntry, CardPriceResult } from '@/lib/pricing/aggregator';

interface ShopMeta {
  name: string;
  base_url: string;
  shipping_flat: number | null;
  free_threshold: number | null;
}

interface ShoppingListPanelProps {
  source: 'wishlist' | 'deck-missing';
  deckId?: string;
  shopMeta: Record<number, ShopMeta>;
}

export function ShoppingListPanel({ source, deckId, shopMeta }: ShoppingListPanelProps) {
  const [result, setResult] = useState<PricedDeck | null>(null);
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState<'per-card' | 'fewest-shops'>('fewest-shops');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/shopping-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(source === 'wishlist' ? { source } : { source, deck_id: deckId }),
    })
      .then(r => r.json())
      .then((d: PricedDeck | { error?: string }) => {
        if ('error' in d && d.error) { setError(d.error); return; }
        setResult(d as PricedDeck);
      })
      .catch(() => setError('Failed to load prices'))
      .finally(() => setLoading(false));
  }, [source, deckId]);

  if (loading) {
    return (
      <div style={{ padding: '20px', color: 'var(--text-faint)', fontSize: 13, textAlign: 'center' }}>
        Checking prices across NZ shops…
      </div>
    );
  }
  if (error) {
    return <div style={{ padding: '16px', color: 'var(--red)', fontSize: 13 }}>{error}</div>;
  }
  if (!result) return null;
  if (result.card_results.length === 0) {
    return (
      <div style={{ padding: '20px', color: 'var(--text-faint)', fontSize: 13 }}>
        {source === 'wishlist' ? 'Your wishlist is empty.' : 'You already own all the cards in this deck.'}
      </div>
    );
  }

  const grouped = groupBasketByShop(result.fewest_shops_basket);

  const btnBase: React.CSSProperties = {
    padding: '5px 14px', border: '1px solid var(--border)', borderRadius: '6px',
    fontSize: '12px', cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif",
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Strategy toggle + totals */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setStrategy('fewest-shops')}
            style={{ ...btnBase, background: strategy === 'fewest-shops' ? 'var(--surface-3)' : 'var(--surface)', color: strategy === 'fewest-shops' ? 'var(--text)' : 'var(--text-faint)' }}
          >
            Fewest shops ({result.fewest_shops_count})
          </button>
          <button
            onClick={() => setStrategy('per-card')}
            style={{ ...btnBase, background: strategy === 'per-card' ? 'var(--surface-3)' : 'var(--surface)', color: strategy === 'per-card' ? 'var(--text)' : 'var(--text-faint)' }}
          >
            Cheapest per card
          </button>
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 18, color: 'var(--accent)' }}>
          NZ${(strategy === 'fewest-shops' ? result.fewest_shops_total : result.best_per_card_total).toFixed(2)}
          {result.not_found_count > 0 && (
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-faint)', marginLeft: 8 }}>
              +{result.not_found_count} not found
            </span>
          )}
        </div>
      </div>

      {strategy === 'fewest-shops' ? (
        /* Fewest-shops: grouped by shop */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(grouped).map(([shopIdStr, { entries, shopId }]) => {
            const meta = shopMeta[shopId];
            const subtotal = entries.reduce((s, e) => s + e.price_nzd, 0);
            const shipping = meta?.shipping_flat;
            const freeAt = meta?.free_threshold;
            const shippingNote = freeAt != null && subtotal >= freeAt
              ? 'Free shipping'
              : shipping != null
                ? `+$${shipping.toFixed(2)} shipping`
                : null;

            return (
              <div key={shopIdStr} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                {/* Shop header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{meta?.name ?? `Shop #${shopId}`}</span>
                    {shippingNote && (
                      <span style={{ fontSize: 11, color: freeAt != null && subtotal >= freeAt ? 'var(--green)' : 'var(--text-faint)', marginLeft: 10 }}>
                        {shippingNote}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                    NZ${subtotal.toFixed(2)}
                  </div>
                </div>
                {/* Cards */}
                {entries.map(e => (
                  <div key={e.entry_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--text)' }}>{e.card_name}</span>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--accent)' }}>NZ${e.price_nzd.toFixed(2)}</span>
                      {e.product_url && (
                        <a href={e.product_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--text-faint)', textDecoration: 'none' }}>
                          Buy ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        /* Per-card: best price per card */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {result.card_results.filter(r => !r.not_found).map(r => (
            <PerCardRow key={r.entry_id} result={r} />
          ))}
        </div>
      )}

      {/* Not found */}
      {result.not_found_count > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
            Not stocked in NZ shops
          </div>
          {result.card_results.filter(r => r.not_found).map(r => (
            <div key={r.entry_id} style={{ fontSize: 12.5, color: 'var(--text-faint)', padding: '3px 0' }}>{r.card_name}</div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
        Shipping costs shown but not included in totals. Prices in NZD.
      </p>
    </div>
  );
}

function PerCardRow({ result: r }: { result: CardPriceResult }) {
  const best = r.best_price;
  if (!best) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: 12.5 }}>
      <span>{r.card_name}</span>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{best.shop_name}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--accent)', fontWeight: 700 }}>NZ${best.price_nzd.toFixed(2)}</span>
        {best.product_url && (
          <a href={best.product_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--text-faint)', textDecoration: 'none' }}>
            Buy ↗
          </a>
        )}
      </div>
    </div>
  );
}

function groupBasketByShop(basket: BasketEntry[]): Record<string, { shopId: number; entries: BasketEntry[] }> {
  const groups: Record<string, { shopId: number; entries: BasketEntry[] }> = {};
  for (const e of basket) {
    const key = String(e.shop_id);
    if (!groups[key]) groups[key] = { shopId: e.shop_id, entries: [] };
    groups[key].entries.push(e);
  }
  return groups;
}
