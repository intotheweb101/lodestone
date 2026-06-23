import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const cards: any[] = [];
    let url: string | null =
      `https://api.scryfall.com/cards/search?q=set%3A${encodeURIComponent(code)}&order=collector_number&unique=prints`;

    while (url) {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'mtg-deck-builder/1.0 (hadlee.lineham@macroactive.com; personal deck tool)',
          'Accept': 'application/json',
        },
      });
      if (!res.ok) break;
      const page = await res.json() as { data: any[]; next_page?: string; has_more: boolean };
      cards.push(...page.data);
      url = page.has_more ? (page.next_page ?? null) : null;
      if (cards.length > 500) break;
    }

    const deckCards = cards
      .filter((c: any) => !c.type_line?.includes('Token') && !c.type_line?.includes('Emblem'))
      .map((c: any) => ({
        name: c.name,
        oracle_id: c.oracle_id,
        type_line: c.type_line ?? '',
        mana_cost: c.mana_cost ?? '',
        image_uri: c.image_uris?.small ?? c.card_faces?.[0]?.image_uris?.small ?? null,
        is_commander: !!(c.type_line?.includes('Legendary') && c.type_line?.includes('Creature')),
        collector_number: c.collector_number,
      }));

    return NextResponse.json({ cards: deckCards });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
