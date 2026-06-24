/**
 * Deck import source registry.
 * Each source implements match() + fetch(); the URL route iterates the registry.
 * parseArenaList() is a shared helper for text-based sources and the paste importer.
 */

export interface ImportedCard {
  name: string;
  quantity: number;
  is_commander: boolean;
}

export interface ImportResult {
  deckName: string;
  cards: ImportedCard[];
  source: string;
}

export interface DeckSource {
  id: string;
  label: string;
  match(url: string): boolean;
  fetch(url: string): Promise<ImportResult>;
}

// ── Shared text parser (Arena / MTGO format) ──────────────────────────────────

/**
 * Parse an Arena/MTGO decklist text block.
 *
 * Supported formats:
 *   1 Card Name
 *   1x Card Name
 *   Commander section header lines: "Commander", "Deck", "Sideboard", "Maybeboard"
 *   MTGO section: "COMMANDER:", "DECK:", etc.
 */
export function parseArenaList(text: string, deckName = 'Imported Deck'): ImportResult {
  const lines = text.split('\n');
  const cards: ImportedCard[] = [];
  let inCommanderSection = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { inCommanderSection = false; continue; }

    // Section headers
    const lower = line.toLowerCase();
    if (lower === 'commander' || lower === 'commander:') { inCommanderSection = true; continue; }
    if (lower === 'deck' || lower === 'mainboard' || lower === 'main deck') { inCommanderSection = false; continue; }
    if (lower === 'sideboard' || lower === 'maybeboard') { inCommanderSection = false; continue; }

    // Qty Name [set] [number] — tolerate Arena set/number suffixes
    const m = line.match(/^(\d+)x?\s+(.+?)(?:\s+\([A-Z0-9]+\)\s+\d+)?$/);
    if (!m) continue;

    const quantity = parseInt(m[1], 10);
    const name = m[2].trim();
    if (!name || quantity <= 0) continue;

    cards.push({ name, quantity, is_commander: inCommanderSection });
  }

  return { deckName, cards, source: 'paste' };
}

// ── Moxfield ─────────────────────────────────────────────────────────────────

const moxfieldSource: DeckSource = {
  id: 'moxfield',
  label: 'Moxfield',
  match: (url) => /moxfield\.com\/decks\/([A-Za-z0-9_-]+)/.test(url),
  async fetch(url) {
    const m = url.match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/);
    const publicId = m![1];
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
  },
};

// ── Archidekt ─────────────────────────────────────────────────────────────────

const archidektSource: DeckSource = {
  id: 'archidekt',
  label: 'Archidekt',
  match: (url) => /archidekt\.com\/decks\/(\d+)/.test(url),
  async fetch(url) {
    const m = url.match(/archidekt\.com\/decks\/(\d+)/);
    const deckId = m![1];
    const res = await fetch(`https://archidekt.com/api/decks/${deckId}/small/`, {
      headers: {
        'User-Agent': 'mtg-deck-builder/1.0 (hadlee.lineham@macroactive.com)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Archidekt returned ${res.status}`);
    const data = await res.json() as any;
    const cards: ImportedCard[] = (data.cards ?? [])
      .map((c: any) => ({
        name: c.card?.oracleCard?.name ?? c.card?.name ?? '',
        quantity: c.quantity ?? 1,
        is_commander: (c.categories ?? []).some((cat: string) => cat.toLowerCase() === 'commander'),
      }))
      .filter((c: ImportedCard) => c.name);
    return { deckName: data.name ?? 'Archidekt Deck', cards, source: 'archidekt' };
  },
};

// ── MTGGoldfish ───────────────────────────────────────────────────────────────

const mtgGoldfishSource: DeckSource = {
  id: 'mtggoldfish',
  label: 'MTGGoldfish',
  match: (url) => /mtggoldfish\.com\/deck\/(\d+)/.test(url),
  async fetch(url) {
    const m = url.match(/mtggoldfish\.com\/deck\/(\d+)/);
    const deckId = m![1];
    const res = await fetch(`https://www.mtggoldfish.com/deck/download/${deckId}`, {
      headers: { 'User-Agent': 'mtg-deck-builder/1.0 (hadlee.lineham@macroactive.com)' },
      redirect: 'follow',
    });
    if (res.status === 403 || res.status === 429) {
      throw new Error('MTGGoldfish blocked the download. Open the deck on MTGGoldfish, click "Download", and paste the text into the "Paste a decklist" box below.');
    }
    if (!res.ok) throw new Error(`MTGGoldfish returned ${res.status}`);
    const text = await res.text();
    const result = parseArenaList(text, 'MTGGoldfish Deck');
    return { ...result, source: 'mtggoldfish' };
  },
};

// ── TappedOut ─────────────────────────────────────────────────────────────────

const tappedOutSource: DeckSource = {
  id: 'tappedout',
  label: 'TappedOut',
  match: (url) => /tappedout\.net\/mtg-decks\//.test(url),
  async fetch(url) {
    // Ensure no trailing slash, then append ?fmt=txt
    const base = url.replace(/\?.*$/, '').replace(/\/$/, '');
    const fetchUrl = `${base}/?fmt=txt`;
    const res = await fetch(fetchUrl, {
      headers: { 'User-Agent': 'mtg-deck-builder/1.0 (hadlee.lineham@macroactive.com)' },
      redirect: 'follow',
    });
    if (res.status === 403 || res.status === 429) {
      throw new Error('TappedOut blocked the export. Open the deck on TappedOut, click "Export" → "Plain Text", and paste the text below.');
    }
    if (!res.ok) throw new Error(`TappedOut returned ${res.status}`);
    const text = await res.text();
    // TappedOut txt format: "Qty CardName (SET)" lines; reuse Arena parser
    const result = parseArenaList(text, 'TappedOut Deck');
    return { ...result, source: 'tappedout' };
  },
};

// ── Deckstats ─────────────────────────────────────────────────────────────────

const deckstatsSource: DeckSource = {
  id: 'deckstats',
  label: 'Deckstats',
  match: (url) => /deckstats\.net\/decks\//.test(url),
  async fetch(url) {
    // Extract numeric deck id: /decks/123456/... or /decks/author/123456
    const m = url.match(/\/decks\/(?:[^/]+\/)?(\d+)/);
    if (!m) throw new Error('Could not parse Deckstats deck ID from URL.');
    const deckId = m[1];
    const fetchUrl = `https://deckstats.net/api.php?action=get_deck&id_type=saved&owner_id=0&id=${deckId}&response_type=json`;
    const res = await fetch(fetchUrl, {
      headers: { 'User-Agent': 'mtg-deck-builder/1.0 (hadlee.lineham@macroactive.com)' },
    });
    if (res.status === 403 || res.status === 429) {
      throw new Error('Deckstats blocked the request. Export the deck as plain text from Deckstats and paste it below.');
    }
    if (!res.ok) throw new Error(`Deckstats returned ${res.status}`);
    const data = await res.json() as any;

    if (data.error) throw new Error(`Deckstats: ${data.error}`);

    const cards: ImportedCard[] = [];
    for (const section of (data.sections ?? [])) {
      const isCommander = (section.name ?? '').toLowerCase().includes('commander');
      for (const card of (section.cards ?? [])) {
        const name = card.name ?? card.card_name ?? '';
        const quantity = card.amount ?? card.quantity ?? 1;
        if (name) cards.push({ name, quantity, is_commander: isCommander });
      }
    }
    return { deckName: data.name ?? 'Deckstats Deck', cards, source: 'deckstats' };
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const DECK_SOURCES: DeckSource[] = [
  moxfieldSource,
  archidektSource,
  mtgGoldfishSource,
  tappedOutSource,
  deckstatsSource,
];

export function findSource(url: string): DeckSource | null {
  return DECK_SOURCES.find(s => s.match(url)) ?? null;
}

export const SUPPORTED_SOURCE_LABELS = DECK_SOURCES.map(s => s.label).join(', ');
