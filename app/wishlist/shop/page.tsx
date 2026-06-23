import { redirect } from 'next/navigation';
import { runMigrations } from '@/lib/db/migrations';
import { resolveActingUser } from '@/lib/auth/session';
import { getShopsWithShipping } from '@/lib/pricing/shopping-list';
import { ShoppingListPanel } from '@/components/shopping-list-panel';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function WishlistShopPage() {
  runMigrations();
  const user = await resolveActingUser();
  if (user.id === 'local') redirect('/login');

  const shopMeta = getShopsWithShipping();

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
          Wishlist → NZ Shops
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
          Buy your wishlist
        </h1>
        <p style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
          Optimised across NZ and AUS shops. <Link href="/wishlist" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Back to wishlist</Link>
        </p>
      </div>

      <ShoppingListPanel source="wishlist" shopMeta={shopMeta} />
    </div>
  );
}
