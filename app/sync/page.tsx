import { getAllShops } from '@/lib/db/queries';
import { runMigrations } from '@/lib/db/migrations';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { SyncPanel } from './sync-panel';

export const dynamic = 'force-dynamic';

export default async function SyncPage() {
  runMigrations();
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  const user = token ? getSessionUser(token) : null;

  if (!user || user.role !== 'admin') {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
        <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>Admin access required</div>
        <div style={{ fontSize: '14px', color: 'var(--text-faint)' }}>
          Sign in with an admin account to access sync controls.
        </div>
        <a href="/login" style={{ display: 'inline-block', marginTop: '20px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Sign in →</a>
      </div>
    );
  }

  const shops = getAllShops();
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <p style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '11px', color: 'var(--accent)',
        letterSpacing: '2px', textTransform: 'uppercase',
        marginBottom: '6px',
      }}>
        Sync
      </p>
      <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
        Data Sync
      </h1>
      <p style={{ color: 'var(--text-faint)', fontSize: '12px', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Sync Scryfall card data and NZ shop stock/prices. Run this before pricing a deck for fresh results.
        Full shop sync takes a few minutes — it respects each shop&apos;s rate limits.
      </p>
      <SyncPanel shops={shops} />
    </div>
  );
}
