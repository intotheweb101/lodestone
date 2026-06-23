import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('https://api.scryfall.com/sets', {
      headers: {
        'User-Agent': 'mtg-deck-builder/1.0 (hadlee.lineham@macroactive.com; personal deck tool)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Scryfall sets returned ${res.status}`);
    const data = await res.json() as { data: any[] };

    const sets = data.data
      .filter((s: any) => s.set_type === 'commander')
      .sort((a: any, b: any) => b.released_at.localeCompare(a.released_at))
      .map((s: any) => ({
        code: s.code,
        name: s.name,
        released_at: s.released_at,
        card_count: s.card_count,
        icon_svg_uri: s.icon_svg_uri,
      }));

    return NextResponse.json({ sets });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
