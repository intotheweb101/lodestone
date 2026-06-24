import type { Metadata } from 'next';
import { runMigrations } from '@/lib/db/migrations';
import { listDraftableSets } from '@/lib/sealed/packs';
import { SetPicker } from './set-picker';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sealed Deck Simulator — Lodestone',
  description: 'Generate a sealed pool from any Magic: The Gathering set and build a 40-card deck.',
};

export default function SealedPage() {
  runMigrations();
  const sets = listDraftableSets();
  return <SetPicker sets={sets} />;
}
