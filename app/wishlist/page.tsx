import { redirect } from 'next/navigation';
import { runMigrations } from '@/lib/db/migrations';
import { resolveActingUser } from '@/lib/auth/session';
import { getWishlistWithCards } from '@/lib/wishlist/store';
import { WishlistClient } from './wishlist-client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function WishlistPage() {
  runMigrations();
  const user = await resolveActingUser();
  if (user.id === 'local') redirect('/login');

  const entries = getWishlistWithCards(user.id);
  const totalCards = entries.reduce((s, e) => s + e.quantity, 0);
  const uniqueCards = entries.length;
  const estValueUsd = entries.reduce((s, e) => e.price_usd != null ? s + e.price_usd * e.quantity : s, 0);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
          Wishlist
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
              My Wishlist
            </h1>
            <p style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
              Cards you want to buy. <Link href="/wishlist/shop" style={{ color: 'var(--accent)', textDecoration: 'none' }}>→ Find cheapest across NZ shops</Link>
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Want', value: totalCards.toLocaleString() },
          { label: 'Unique', value: uniqueCards.toLocaleString() },
          ...(estValueUsd > 0 ? [{ label: 'Est. USD', value: `$${estValueUsd.toFixed(2)}` }] : []),
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '12px 18px', minWidth: '110px',
          }}>
            <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--accent)' }}>
              {stat.value}
            </div>
          </div>
        ))}
        {entries.length > 0 && (
          <Link
            href="/wishlist/shop"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--accent)', color: '#0a1f22',
              borderRadius: '10px', padding: '12px 20px',
              fontWeight: 700, fontSize: '13px', textDecoration: 'none',
              alignSelf: 'center',
            }}
          >
            🛒 Price across NZ shops
          </Link>
        )}
      </div>

      <WishlistClient entries={entries} />
    </div>
  );
}
