/**
 * POST /api/import/paste
 * Parses a pasted Arena/MTGO decklist and returns the standard ImportResult shape.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseArenaList } from '@/lib/import/deck-sources';

const ImportPasteSchema = z.object({
  text: z.string().min(1),
  deckName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = ImportPasteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { text, deckName } = parsed.data;
  if (!text.trim()) return NextResponse.json({ error: 'No text provided' }, { status: 400 });
  const result = parseArenaList(text, deckName ?? 'Imported Deck');
  if (result.cards.length === 0) {
    return NextResponse.json({ error: 'No cards found. Paste an Arena or MTGO export (e.g. "1 Sol Ring" per line).' }, { status: 422 });
  }
  return NextResponse.json(result);
}
