import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { runMigrations } from '@/lib/db/migrations';

let migrated = false;

interface RawRow {
  name: string;
  type_line: string;
  oracle_text: string | null;
  power: string | null;
  toughness: string | null;
  image_uris_json: string | null;
}

export async function GET(req: NextRequest) {
  if (!migrated) { runMigrations(); migrated = true; }

  const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase() ?? '';

  const db = getDb();

  // Tokens & emblems in Scryfall have type_line starting with "Token" or equal to "Emblem"
  const rows = db.prepare(`
    SELECT name, type_line, oracle_text, power, toughness, image_uris_json
    FROM scryfall_cards
    WHERE (
      type_line LIKE 'Token%'
      OR type_line LIKE '%Token%'
      OR type_line = 'Emblem'
      OR type_line LIKE 'Emblem%'
    )
    AND image_uris_json IS NOT NULL
    GROUP BY name
    ORDER BY name
    LIMIT 400
  `).all() as RawRow[];

  let cards = rows.map(r => {
    let image_url: string | null = null;
    try {
      const uris = JSON.parse(r.image_uris_json ?? '{}') as Record<string, string>;
      image_url = uris.normal ?? uris.large ?? uris.small ?? null;
    } catch { /* leave null */ }
    return {
      name: r.name,
      type_line: r.type_line,
      oracle_text: r.oracle_text ?? '',
      power: r.power ?? null,
      toughness: r.toughness ?? null,
      image_url,
    };
  }).filter(c => c.image_url);

  if (q) {
    cards = cards.filter(c => c.name.toLowerCase().includes(q));
  }

  return NextResponse.json({ cards, total: cards.length });
}
