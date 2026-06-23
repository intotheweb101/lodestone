'use client';

import { useState, useTransition } from 'react';
import { actionAddToWishlist } from '@/app/actions';

export function WishlistAddButton({
  oracleId,
  scryfallId,
  cardName,
  finish,
}: {
  oracleId: string;
  scryfallId: string;
  cardName: string;
  finish: 'nonfoil' | 'foil' | 'etched';
}) {
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      await actionAddToWishlist({ oracle_id: oracleId, scryfall_id: scryfallId, card_name: cardName, finish });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    });
  }

  return (
    <button
      onClick={add}
      disabled={pending}
      style={{
        width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
        border: '1px solid var(--border)',
        background: added ? 'rgba(84,192,138,0.12)' : 'var(--surface)',
        color: added ? 'var(--green)' : 'var(--text-faint)',
        cursor: pending ? 'default' : 'pointer',
        fontFamily: "'IBM Plex Sans', sans-serif",
        transition: 'background 0.15s, color 0.15s',
        opacity: pending ? 0.7 : 1,
      }}
    >
      {added ? '✓ Added to wishlist' : '+ Add to wishlist'}
    </button>
  );
}
