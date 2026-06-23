'use client';

import { useTransition } from 'react';
import { actionRemoveFromWishlist, actionMoveWishlistToCollection } from '@/app/actions';
import type { EnrichedWishlistEntry } from '@/lib/wishlist/store';
import Link from 'next/link';

export function WishlistClient({ entries }: { entries: EnrichedWishlistEntry[] }) {
  if (entries.length === 0) {
    return (
      <div style={{ padding: '40px 0', color: 'var(--text-faint)', fontSize: '13px', textAlign: 'center' }}>
        Your wishlist is empty. Add cards from any card page.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entries.map(e => (
        <WishlistRow key={`${e.oracle_id}:${e.finish}`} entry={e} />
      ))}
    </div>
  );
}

function WishlistRow({ entry: e }: { entry: EnrichedWishlistEntry }) {
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(() => actionRemoveFromWishlist(e.oracle_id, e.finish));
  }
  function markOwned() {
    startTransition(() => actionMoveWishlistToCollection(e.oracle_id, e.finish, e.quantity));
  }

  const cardHref = e.set_code && e.collector_number
    ? `/card/${e.set_code}/${e.collector_number}`
    : null;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
      opacity: pending ? 0.5 : 1,
    }}>
      {/* Card image thumbnail */}
      {e.image_url ? (
        <img src={e.image_url} alt={e.card_name} style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--border)' }} />
      ) : (
        <div style={{ width: 36, height: 50, borderRadius: 4, background: 'var(--surface-2)', border: '1px solid var(--border)', flexShrink: 0 }} />
      )}

      {/* Card name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {cardHref ? (
            <Link href={cardHref} style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)', textDecoration: 'none' }}>
              {e.card_name}
            </Link>
          ) : (
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{e.card_name}</span>
          )}
          {e.finish !== 'nonfoil' && (
            <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {e.finish}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {e.type_line && <span>{e.type_line}</span>}
          {e.set_code && <span style={{ textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>{e.set_code}</span>}
          {e.price_usd != null && <span style={{ color: 'var(--text-muted)' }}>${e.price_usd.toFixed(2)} USD</span>}
        </div>
      </div>

      {/* Qty */}
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 700, color: 'var(--text)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
        ×{e.quantity}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={markOwned}
          disabled={pending}
          title="Mark as owned (move to collection)"
          style={{
            padding: '5px 10px', borderRadius: '6px', fontSize: '11.5px', cursor: 'pointer',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--green)', fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          ✓ Own it
        </button>
        <button
          onClick={remove}
          disabled={pending}
          title="Remove from wishlist"
          style={{
            padding: '5px 10px', borderRadius: '6px', fontSize: '11.5px', cursor: 'pointer',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--text-faint)', fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
