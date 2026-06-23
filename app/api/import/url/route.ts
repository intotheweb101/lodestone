import { NextRequest, NextResponse } from 'next/server';

interface ImportedCard {
  name: string;
  quantity: number;
  is_commander: boolean;
}

interface ImportResult {
  deckName: string;
  cards: ImportedCard[];
  source: string;
}

async function fetchMoxfield(publicId: string): Promise<ImportResult> {
  const res = await fetch(`https://api.moxfield.com/v2/decks/all/${publicId}`, {
    headers: {
      'User-Agent': 'mtg-deck-builder/1.0 (hadlee.lineham@macroactive.com; personal deck tool)',
      'Accept': 'application/json',
    },
  });
  if (res.status === 403) {
    throw new Error('Moxfield has blocked API access. Open the deck on Moxfield, click Export → Arena, copy the text, and paste it into the "Paste a decklist" box below.');
  }
  if (!res.ok) throw new Error(`Moxfield returned ${res.status}`);
  const data = await res.json() as any;

  const cards: ImportedCard[] = [];

  const commanders = data.boards?.commanders?.cards ?? {};
  for (const [, entry] of Object.entries(commanders) as any[]) {
    cards.push({ name: entry.card?.name ?? entry.name, quantity: entry.quantity ?? 1, is_commander: true });
  }

  const mainboard = data.boards?.mainboard?.cards ?? {};
  for (const [, entry] of Object.entries(mainboard) as any[]) {
    cards.push({ name: entry.card?.name ?? entry.name, quantity: entry.quantity ?? 1, is_commander: false });
  }

  return { deckName: data.name ?? 'Moxfield Deck', cards, source: 'moxfield' };
}

async function fetchArchidekt(deckId: string): Promise<ImportResult> {
  const res = await fetch(`https://archidekt.com/api/decks/${deckId}/small/`, {
    headers: {
      'User-Agent': 'mtg-deck-builder/1.0 (hadlee.lineham@macroactive.com)',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Archidekt returned ${res.status}`);
  const data = await res.json() as any;

  const cards: ImportedCard[] = (data.cards ?? []).map((c: any) => ({
    name: c.card?.oracleCard?.name ?? c.card?.name ?? '',
    quantity: c.quantity ?? 1,
    is_commander: (c.categories ?? []).some((cat: string) => cat.toLowerCase() === 'commander'),
  })).filter((c: ImportedCard) => c.name);

  return { deckName: data.name ?? 'Archidekt Deck', cards, source: 'archidekt' };
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { url?: string };
  if (!body.url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  try {
    const moxMatch = body.url.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/);
    if (moxMatch) return NextResponse.json(await fetchMoxfield(moxMatch[1]));

    const archiMatch = body.url.match(/archidekt\.com\/decks\/(\d+)/);
    if (archiMatch) return NextResponse.json(await fetchArchidekt(archiMatch[1]));

    return NextResponse.json(
      { error: 'Unsupported URL. Paste a Moxfield or Archidekt deck link.' },
      { status: 422 },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch deck' }, { status: 500 });
  }
}
