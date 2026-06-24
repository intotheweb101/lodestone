import { getDeck } from '@/lib/deck/store';
import { getDb } from '@/lib/db/connection';
import { runMigrations } from '@/lib/db/migrations';
import { notFound } from 'next/navigation';
import { mainboardEntries, boardEntries } from '@/lib/deck/model';
import { PrintClient } from './print-client';

export const dynamic = 'force-dynamic';

function extractImageUrl(imageUrisJson: string | null, cardFacesJson: string | null): string | null {
  if (imageUrisJson) {
    try { return (JSON.parse(imageUrisJson) as Record<string, string>).normal ?? null; } catch { return null; }
  }
  if (cardFacesJson) {
    try {
      const faces = JSON.parse(cardFacesJson) as { image_uris?: { normal?: string } }[];
      return faces[0]?.image_uris?.normal ?? null;
    } catch { return null; }
  }
  return null;
}

export interface CardSlot {
  name: string;
  imageUrl: string | null;
  isCommander: boolean;
  board: 'main' | 'side';
}

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  runMigrations();
  const deck = getDeck(id);
  if (!deck) notFound();

  const main = mainboardEntries(deck);
  const side = boardEntries(deck, 'side');
  const allEntries = [...main, ...side];

  // Batch image lookup — one query for all unique oracle_ids
  const oracleIds = [...new Set(allEntries.map(e => e.oracle_id).filter(Boolean))] as string[];
  const imageMap: Record<string, string | null> = {};

  if (oracleIds.length > 0) {
    const db = getDb();
    const placeholders = oracleIds.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT oracle_id, image_uris_json, card_faces_json
       FROM scryfall_cards
       WHERE oracle_id IN (${placeholders})
       GROUP BY oracle_id`
    ).all(oracleIds) as { oracle_id: string; image_uris_json: string | null; card_faces_json: string | null }[];

    for (const row of rows) {
      imageMap[row.oracle_id] = extractImageUrl(row.image_uris_json, row.card_faces_json);
    }
  }

  // Expand entries by quantity into individual card slots
  function expand(entries: typeof main, board: 'main' | 'side'): CardSlot[] {
    return entries.flatMap(e => {
      const qty = e.is_commander ? 1 : e.quantity;
      return Array.from({ length: qty }, () => ({
        name: e.card_name,
        imageUrl: e.oracle_id ? (imageMap[e.oracle_id] ?? null) : null,
        isCommander: e.is_commander,
        board,
      }));
    });
  }

  return (
    <PrintClient
      deckName={deck.name}
      format={deck.format}
      mainCards={expand(main, 'main')}
      sideCards={expand(side, 'side')}
    />
  );
}
