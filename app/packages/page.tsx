/**
 * /packages — manage reusable card bundles (packages).
 * Server component — lists user's packages; client interactions via server actions.
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { runMigrations } from '@/lib/db/migrations';
import { listPackages, getPackageEntries } from '@/lib/packages/store';
import { PackagesClient } from './packages-client';

export const dynamic = 'force-dynamic';

export default async function PackagesPage() {
  runMigrations();
  const user = await getCurrentUser();
  if (!user || user.id === 'local') redirect('/login');

  const packages = listPackages(user.id);
  const packagesWithEntries = packages.map(pkg => ({
    ...pkg,
    entries: getPackageEntries(pkg.id),
  }));

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Card Packages</h1>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.6 }}>
          Reusable bundles of cards you can insert into any deck with one click. Great for staple packages like ramp suites, draw engines, or removal packages.
        </p>
      </div>
      <PackagesClient initialPackages={packagesWithEntries} />
    </div>
  );
}
