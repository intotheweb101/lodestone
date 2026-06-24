import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { runMigrations } from '@/lib/db/migrations';

let migrated = false;

interface RawRow {
  scryfall_id: string;
  name: string;
  type_line: string;
  oracle_text: string | null;
  image_uris_json: string | null;
}

export async function GET() {
  if (!migrated) { runMigrations(); migrated = true; }

  const db = getDb();

  // One printing per name — prefer rows with an image
  const rows = db.prepare(`
    SELECT scryfall_id, name, type_line, oracle_text, image_uris_json
    FROM scryfall_cards
    WHERE type_line LIKE 'Plane —%' OR type_line = 'Phenomenon'
    GROUP BY name
    HAVING image_uris_json IS NOT NULL OR COUNT(*) = 1
    ORDER BY name
  `).all() as RawRow[];

  const cards = rows.map(r => {
    let image_url: string | null = null;
    try {
      const uris = JSON.parse(r.image_uris_json ?? '{}') as Record<string, string>;
      image_url = uris.normal ?? uris.large ?? uris.small ?? null;
    } catch { /* leave null */ }

    return {
      scryfall_id: r.scryfall_id,
      name: r.name,
      type_line: r.type_line,
      oracle_text: r.oracle_text ?? '',
      image_url,
    };
  });

  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return NextResponse.json({ cards, total: cards.length });
}
