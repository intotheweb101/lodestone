import type { Metadata } from 'next';
import { runMigrations } from '@/lib/db/migrations';
import { listDraftableSets } from '@/lib/sealed/packs';
import { DraftSetPicker } from './set-picker';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Draft Simulator — Lodestone' };

let migrated = false;

export default async function DraftPage() {
  if (!migrated) { runMigrations(); migrated = true; }
  const sets = listDraftableSets();

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      <div style={{ marginBottom: '2rem' }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
          Draft
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Draft Simulator
        </h1>
        <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>
          Pick cards one at a time from booster packs — solo draft from any set in your database.
        </p>
      </div>
      <DraftSetPicker sets={sets} />
    </div>
  );
}
