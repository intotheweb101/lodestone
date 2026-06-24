import { runMigrations } from '@/lib/db/migrations';
import { generateDraftPacks } from '@/lib/draft/simulator';
import { DraftClient } from './draft-client';

export const dynamic = 'force-dynamic';

let migrated = false;

export default async function DraftSetPage({ params }: { params: Promise<{ set: string }> }) {
  if (!migrated) { runMigrations(); migrated = true; }
  const { set } = await params;
  const setCode = set.toUpperCase();
  const packs = generateDraftPacks(setCode);

  if (!packs[0] || packs[0].length === 0) {
    return (
      <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center', color: 'var(--text-faint)' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>—</div>
        <p style={{ fontSize: '14px' }}>Not enough cards in &ldquo;{setCode}&rdquo; to draft. Run a Scryfall sync first.</p>
        <a href="/draft" style={{ display: 'inline-block', marginTop: '16px', color: 'var(--accent)', fontSize: '13px', textDecoration: 'none' }}>← Back to set picker</a>
      </div>
    );
  }

  return <DraftClient setCode={setCode} initialPacks={packs} />;
}
