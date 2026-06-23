/**
 * Deck model — pure data structures, no DB access.
 */

export type DeckFormat = 'commander' | 'standard' | 'modern' | 'pioneer' | 'legacy' | 'vintage' | 'pauper';
export type TreatmentType = 'normal' | 'borderless' | 'extended-art' | 'showcase' | 'full-art' | 'retro' | 'other';
export type FinishType = 'nonfoil' | 'foil' | 'etched';
export type ConditionFloor = 'nm' | 'lp' | 'mp' | 'hp';

export type CommanderRole = 'commander' | 'partner' | 'background' | 'companion';
export type CardCategory = 'Lands' | 'Ramp' | 'Card Draw' | 'Removal' | 'Board Wipes' | 'Creatures' | 'Artifacts' | 'Enchantments' | 'Instants' | 'Sorceries' | 'Other';

export interface DeckEntry {
  oracle_id: string;
  scryfall_id: string | null;   // chosen printing
  card_name: string;
  quantity: number;
  is_commander: boolean;
  treatment: TreatmentType;
  finish: FinishType;
  condition_floor: ConditionFloor;
  board?: 'main' | 'side' | 'maybe';
  /** Optional price override — when set, replaces the market price in all value calculations. */
  custom_price?: number | null;
  /** Computed: the match_key for the chosen printing+finish, or null if not yet resolved */
  match_key?: string | null;
  /** User-assigned category or auto-detected group */
  category?: CardCategory | null;
  /** Role in the command zone: commander, partner, background, or companion */
  commander_role?: CommanderRole | null;
}

export type DeckVisibility = 'private' | 'unlisted' | 'public';

export interface Deck {
  id: string;
  name: string;
  format: DeckFormat;
  commander: string | null;  // card name of the commander (for EDH)
  entries: DeckEntry[];
  custom_value?: number | null;  // what the user paid for this deck (e.g. precon box price)
  user_id?: string | null;
  visibility?: DeckVisibility;
  public_slug?: string | null;
  description?: string | null;   // primer / deck description (markdown)
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}

/** All entries that belong to the main deck (board='main' or legacy entries with no board set). */
export function mainboardEntries(deck: Deck): DeckEntry[] {
  return deck.entries.filter(e => !e.board || e.board === 'main');
}

/** All entries for a specific board. */
export function boardEntries(deck: Deck, board: 'main' | 'side' | 'maybe'): DeckEntry[] {
  if (board === 'main') return mainboardEntries(deck);
  return deck.entries.filter(e => e.board === board);
}

/** Count of mainboard cards only (sideboard/maybeboard are excluded from the 100). */
export function deckSize(deck: Deck): number {
  return mainboardEntries(deck).reduce((s, e) => s + e.quantity, 0);
}

/** Format rules for legality checks (Tier A — pure, no DB). */
const FORMAT_RULES: Partial<Record<DeckFormat, { minSize: number; maxSize?: number; singleton: boolean; maxCopies: number; maxSideboard: number }>> = {
  commander: { minSize: 100, maxSize: 100, singleton: true,  maxCopies: 1,  maxSideboard: 0 },
  standard:  { minSize: 60,              singleton: false, maxCopies: 4,  maxSideboard: 15 },
  modern:    { minSize: 60,              singleton: false, maxCopies: 4,  maxSideboard: 15 },
  pioneer:   { minSize: 60,              singleton: false, maxCopies: 4,  maxSideboard: 15 },
  legacy:    { minSize: 60,              singleton: false, maxCopies: 4,  maxSideboard: 15 },
  vintage:   { minSize: 60,              singleton: false, maxCopies: 4,  maxSideboard: 15 },
  pauper:    { minSize: 60,              singleton: false, maxCopies: 4,  maxSideboard: 15 },
};

export function isLegal(deck: Deck): { legal: boolean; reason: string | null } {
  const rules = FORMAT_RULES[deck.format];

  if (deck.format === 'commander') {
    if (!deck.commander) return { legal: false, reason: 'Commander not set' };
    const size = deckSize(deck);
    if (size !== 100) return { legal: false, reason: `Deck must be exactly 100 cards (currently ${size})` };
    // Singleton check — mainboard only
    const main = mainboardEntries(deck);
    const nonBasics = main.filter(e => !isBasicLand(e.card_name));
    const nonSingletons = nonBasics.filter(e => e.quantity > 1);
    if (nonSingletons.length > 0) {
      return { legal: false, reason: `Non-basic cards must be singletons: ${nonSingletons.map(e => e.card_name).join(', ')}` };
    }
    return { legal: true, reason: null };
  }

  if (rules) {
    const size = deckSize(deck);
    if (size < rules.minSize) {
      return { legal: false, reason: `${deck.format} requires at least ${rules.minSize} mainboard cards (currently ${size})` };
    }
    if (rules.maxSize !== undefined && size > rules.maxSize) {
      return { legal: false, reason: `${deck.format} allows at most ${rules.maxSize} mainboard cards (currently ${size})` };
    }

    // 4-copy limit for non-basic lands
    if (!rules.singleton) {
      const main = mainboardEntries(deck);
      const overLimit = main.filter(e => !isBasicLand(e.card_name) && e.quantity > rules.maxCopies);
      if (overLimit.length > 0) {
        return { legal: false, reason: `More than ${rules.maxCopies} copies: ${overLimit.map(e => `${e.card_name} (×${e.quantity})`).join(', ')}` };
      }
    }

    // Sideboard size
    if (rules.maxSideboard !== undefined) {
      const side = boardEntries(deck, 'side').reduce((s, e) => s + e.quantity, 0);
      if (side > rules.maxSideboard) {
        return { legal: false, reason: `Sideboard may not exceed ${rules.maxSideboard} cards (currently ${side})` };
      }
    }
  }

  return { legal: true, reason: null };
}

const BASIC_LAND_NAMES = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes', 'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp', 'Snow-Covered Mountain', 'Snow-Covered Forest']);

export function isBasicLand(name: string): boolean {
  return BASIC_LAND_NAMES.has(name);
}

/** Parse an MTG Arena / MTGO format decklist, preserving board section info */
export function parseDecklist(text: string): { name: string; quantity: number; is_commander: boolean; board: 'main' | 'side' | 'maybe' }[] {
  const entries: { name: string; quantity: number; is_commander: boolean; board: 'main' | 'side' | 'maybe' }[] = [];
  let section: 'commander' | 'main' | 'side' | 'maybe' = 'main';

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    // MTGO sideboard prefix — treat these as side entries
    const isSbPrefix = /^SB:\s*/i.test(line);
    const noSb = line.replace(/^SB:\s*/i, '');

    // Section header detection
    const lower = noSb.toLowerCase();
    if (lower === 'commander') { section = 'commander'; continue; }
    if (lower === 'deck' || lower === 'mainboard') { section = 'main'; continue; }
    if (lower === 'sideboard') { section = 'side'; continue; }
    if (lower === 'maybeboard') { section = 'maybe'; continue; }
    if (lower === 'companion') { section = 'main'; continue; }

    // Parse qty + name: "4 Card Name" / "4x Card Name" / "Card Name"
    const match = noSb.match(/^(\d+)[xX]?\s+(.+)$/);
    let qty = 1;
    let name = noSb;
    if (match) { qty = parseInt(match[1], 10); name = match[2].trim(); }

    // Strip Arena's "(SET) collector_number" and foil marker
    name = name.replace(/\s*\([A-Z0-9]{2,6}\)\s+\d+[a-z]?(\s+\*F\*)?$/i, '').trim();

    if (!name) continue;

    const board: 'main' | 'side' | 'maybe' = isSbPrefix ? 'side' : section === 'commander' ? 'main' : section;
    entries.push({ quantity: qty, name, is_commander: section === 'commander', board });
  }

  return entries;
}
