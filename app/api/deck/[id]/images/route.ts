import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { getDeck } from '@/lib/deck/store';
import { getCurrentUser } from '@/lib/auth/session';
import { canView } from '@/lib/auth/access';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deck = getDeck(id);
  if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await getCurrentUser();
  if (!canView(deck, user)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = getDb();

  const rows = db.prepare(`
    SELECT de.oracle_id, de.scryfall_id, sc.image_uris_json, sc.card_faces_json
    FROM deck_entries de
    LEFT JOIN scryfall_cards sc ON sc.scryfall_id = de.scryfall_id
    WHERE de.deck_id = ?
  `).all(id) as { oracle_id: string; scryfall_id: string | null; image_uris_json: string | null; card_faces_json: string | null }[];

  const images: Record<string, string | null> = {};
  for (const row of rows) {
    if (row.image_uris_json) {
      const uris = JSON.parse(row.image_uris_json) as Record<string, string>;
      images[row.oracle_id] = uris.small ?? uris.normal ?? null;
    } else if (row.card_faces_json) {
      const faces = JSON.parse(row.card_faces_json) as { image_uris?: Record<string, string> }[];
      images[row.oracle_id] = faces[0]?.image_uris?.small ?? faces[0]?.image_uris?.normal ?? null;
    } else {
      images[row.oracle_id] = null;
    }
  }

  return NextResponse.json({ images });
}
