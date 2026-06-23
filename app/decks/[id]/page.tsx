import { getDeck } from '@/lib/deck/store';
import { runMigrations } from '@/lib/db/migrations';
import { notFound } from 'next/navigation';
import { DeckBuilderClient } from './deck-builder';
import { getShopsWithShipping } from '@/lib/pricing/shopping-list';

export const dynamic = 'force-dynamic';

export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  runMigrations();
  const deck = getDeck(id);
  if (!deck) notFound();
  const shopMeta = getShopsWithShipping();

  return <DeckBuilderClient deck={deck} shopMeta={shopMeta} />;
}
