import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findSource, SUPPORTED_SOURCE_LABELS } from '@/lib/import/deck-sources';

const ImportUrlSchema = z.object({ url: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = ImportUrlSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const { url } = parsed.data;

  const source = findSource(url);
  if (!source) {
    return NextResponse.json(
      { error: `Unsupported URL. Paste a link from: ${SUPPORTED_SOURCE_LABELS} — or use the "Paste a decklist" option.` },
      { status: 422 },
    );
  }

  try {
    return NextResponse.json(await source.fetch(url));
  } catch (err: unknown) {
    // Surface friendly import errors (e.g. "site blocked — paste instead") but not raw internals
    const msg = err instanceof Error ? err.message : 'Failed to fetch deck';
    const isFriendly = msg.includes('paste') || msg.includes('blocked') || msg.includes('not found');
    console.error('[import/url]', err);
    return NextResponse.json({ error: isFriendly ? msg : 'Failed to fetch deck. Try pasting the decklist directly.' }, { status: 500 });
  }
}
