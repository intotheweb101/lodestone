import { redirect } from 'next/navigation';
import { runMigrations } from '@/lib/db/migrations';
import { resolveActingUser } from '@/lib/auth/session';
import { CollectionImportClient } from './import-client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function CollectionImportPage() {
  runMigrations();
  const user = await resolveActingUser();
  if (user.id === 'local') redirect('/login');

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
          Collection
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '4px' }}>
          Import CSV
        </h1>
        <p style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
          Bulk-import from ManaBox, Moxfield, Archidekt, or a plain qty/name CSV.{' '}
          <Link href="/collection" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← My Collection</Link>
        </p>
      </div>
      <CollectionImportClient />
    </div>
  );
}
