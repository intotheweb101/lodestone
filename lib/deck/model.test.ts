import { describe, it, expect } from 'vitest';
import {
  isLegal,
  isBasicLand,
  parseDecklist,
  deckSize,
  mainboardEntries,
  boardEntries,
  type Deck,
  type DeckEntry,
} from './model';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
  name: string,
  qty: number,
  board: 'main' | 'side' | 'maybe' = 'main',
): DeckEntry {
  return {
    oracle_id: `oracle-${name}`,
    scryfall_id: null,
    card_name: name,
    quantity: qty,
    is_commander: false,
    treatment: 'normal',
    finish: 'nonfoil',
    condition_floor: 'nm',
    board,
  };
}

function makeCommander60(): DeckEntry[] {
  // 60 unique non-basics, all mainboard
  return Array.from({ length: 60 }, (_, i) => makeEntry(`Card ${i + 1}`, 1));
}

function makeLegalCommanderDeck(): Deck {
  return {
    id: 'test',
    name: 'Test Commander',
    format: 'commander',
    commander: 'Atraxa, Praetors Voice',
    entries: [
      ...makeCommander60(),                           // 60 unique non-basics
      ...Array.from({ length: 40 }, () => makeEntry('Forest', 1)), // 40 basics (ok to repeat)
    ],
  };
}

function makeStandardDeck(main: number, side = 0): Deck {
  const entries: DeckEntry[] = [
    ...Array.from({ length: Math.floor(main / 4) }, (_, i) =>
      makeEntry(`Card ${i + 1}`, 4),
    ),
  ];
  // Pad with basics if needed
  const remaining = main - entries.reduce((s, e) => s + e.quantity, 0);
  if (remaining > 0) entries.push(makeEntry('Forest', remaining));
  if (side > 0) {
    entries.push(makeEntry('Sideboard Card 1', side, 'side'));
  }
  return {
    id: 'test',
    name: 'Test Standard',
    format: 'standard',
    commander: null,
    entries,
  };
}

// ── isBasicLand ───────────────────────────────────────────────────────────────

describe('isBasicLand', () => {
  it('returns true for all five basic lands', () => {
    for (const name of ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']) {
      expect(isBasicLand(name)).toBe(true);
    }
  });

  it('returns true for Wastes', () => {
    expect(isBasicLand('Wastes')).toBe(true);
  });

  it('returns true for snow-covered basics', () => {
    expect(isBasicLand('Snow-Covered Forest')).toBe(true);
    expect(isBasicLand('Snow-Covered Island')).toBe(true);
  });

  it('returns false for non-basics', () => {
    expect(isBasicLand('Llanowar Elves')).toBe(false);
    expect(isBasicLand('Gaea\'s Cradle')).toBe(false);
    expect(isBasicLand('Command Tower')).toBe(false);
  });
});

// ── deckSize ─────────────────────────────────────────────────────────────────

describe('deckSize', () => {
  it('counts only mainboard entries', () => {
    const deck: Deck = {
      id: 't', name: 't', format: 'commander', commander: null,
      entries: [
        makeEntry('Card A', 2, 'main'),
        makeEntry('Card B', 3, 'main'),
        makeEntry('Sideboard Card', 4, 'side'),
        makeEntry('Maybe Card', 2, 'maybe'),
      ],
    };
    expect(deckSize(deck)).toBe(5); // 2 + 3 only
  });

  it('counts entries with no board set as mainboard', () => {
    const entry: DeckEntry = { ...makeEntry('Card', 3), board: undefined };
    const deck: Deck = { id: 't', name: 't', format: 'standard', commander: null, entries: [entry] };
    expect(deckSize(deck)).toBe(3);
  });

  it('returns 0 for an empty deck', () => {
    const deck: Deck = { id: 't', name: 't', format: 'standard', commander: null, entries: [] };
    expect(deckSize(deck)).toBe(0);
  });
});

// ── mainboardEntries / boardEntries ───────────────────────────────────────────

describe('mainboardEntries', () => {
  it('excludes side and maybe boards', () => {
    const deck: Deck = {
      id: 't', name: 't', format: 'standard', commander: null,
      entries: [
        makeEntry('Main', 1, 'main'),
        makeEntry('Side', 1, 'side'),
        makeEntry('Maybe', 1, 'maybe'),
      ],
    };
    const main = mainboardEntries(deck);
    expect(main).toHaveLength(1);
    expect(main[0].card_name).toBe('Main');
  });
});

describe('boardEntries', () => {
  it('returns entries for the specified board', () => {
    const deck: Deck = {
      id: 't', name: 't', format: 'standard', commander: null,
      entries: [
        makeEntry('Main', 1, 'main'),
        makeEntry('Side', 1, 'side'),
        makeEntry('Maybe', 1, 'maybe'),
      ],
    };
    expect(boardEntries(deck, 'side')[0].card_name).toBe('Side');
    expect(boardEntries(deck, 'maybe')[0].card_name).toBe('Maybe');
  });
});

// ── isLegal — commander ───────────────────────────────────────────────────────

describe('isLegal (commander)', () => {
  it('accepts a fully legal 100-card commander deck', () => {
    expect(isLegal(makeLegalCommanderDeck())).toEqual({ legal: true, reason: null });
  });

  it('rejects a deck with no commander set', () => {
    const deck = { ...makeLegalCommanderDeck(), commander: null };
    const result = isLegal(deck);
    expect(result.legal).toBe(false);
    expect(result.reason).toMatch(/commander not set/i);
  });

  it('rejects when deck has fewer than 100 mainboard cards', () => {
    const deck = makeLegalCommanderDeck();
    deck.entries = deck.entries.slice(1); // remove one card → 99
    const result = isLegal(deck);
    expect(result.legal).toBe(false);
    expect(result.reason).toMatch(/99/);
  });

  it('rejects when deck has more than 100 mainboard cards', () => {
    const deck = makeLegalCommanderDeck();
    deck.entries.push(makeEntry('Extra Forest', 1));
    const result = isLegal(deck);
    expect(result.legal).toBe(false);
    expect(result.reason).toMatch(/101/);
  });

  it('rejects duplicate non-basic lands', () => {
    const deck = makeLegalCommanderDeck();
    // Replace last Forest with a second copy of Card 1 (non-basic)
    const idx = deck.entries.length - 1;
    deck.entries[idx] = makeEntry('Card 1', 2); // Card 1 now has qty 2 — duplicate
    // Total stays 100 (removed 1 Forest, added 1 extra Card 1)
    // Actually: Card 1 was qty 1, now qty 2. But we also need to remove one entry to stay at 100.
    // Let's just make a clean test: swap last entry for qty-2 card, remove one entry from middle
    deck.entries.splice(30, 1); // remove Card 31 → 99 cards
    deck.entries[idx - 1] = makeEntry('Card 1', 2); // make Card 1 appear as qty 2 → 100 cards
    const result = isLegal(deck);
    expect(result.legal).toBe(false);
    expect(result.reason).toMatch(/singleton/i);
  });

  it('allows multiple copies of basic lands', () => {
    // Already tested in the legal deck fixture (40x Forest), but explicit test:
    const deck = makeLegalCommanderDeck();
    expect(isLegal(deck).legal).toBe(true);
  });
});

// ── isLegal — constructed formats ─────────────────────────────────────────────

describe('isLegal (standard / constructed)', () => {
  it('accepts a legal 60-card standard deck', () => {
    expect(isLegal(makeStandardDeck(60))).toEqual({ legal: true, reason: null });
  });

  it('rejects fewer than 60 mainboard cards', () => {
    const result = isLegal(makeStandardDeck(59));
    expect(result.legal).toBe(false);
    expect(result.reason).toMatch(/59/);
  });

  it('accepts more than 60 mainboard cards', () => {
    // Standard has no upper limit (only min 60)
    expect(isLegal(makeStandardDeck(61)).legal).toBe(true);
  });

  it('rejects more than 4 copies of a non-basic card', () => {
    const deck: Deck = {
      id: 't', name: 't', format: 'standard', commander: null,
      entries: [
        makeEntry('Lightning Bolt', 5), // 5 copies — illegal
        ...Array.from({ length: 55 }, () => makeEntry('Forest', 1)),
      ],
    };
    const result = isLegal(deck);
    expect(result.legal).toBe(false);
    expect(result.reason).toMatch(/Lightning Bolt/);
  });

  it('allows exactly 4 copies of a non-basic card', () => {
    const deck: Deck = {
      id: 't', name: 't', format: 'standard', commander: null,
      entries: [
        makeEntry('Lightning Bolt', 4),
        ...Array.from({ length: 56 }, () => makeEntry('Forest', 1)),
      ],
    };
    expect(isLegal(deck).legal).toBe(true);
  });

  it('rejects sideboard larger than 15 cards', () => {
    const result = isLegal(makeStandardDeck(60, 16));
    expect(result.legal).toBe(false);
    expect(result.reason).toMatch(/16/);
  });

  it('accepts a 15-card sideboard', () => {
    expect(isLegal(makeStandardDeck(60, 15)).legal).toBe(true);
  });
});

// ── parseDecklist ─────────────────────────────────────────────────────────────

describe('parseDecklist', () => {
  it('parses a simple "qty CardName" line', () => {
    const result = parseDecklist('4 Lightning Bolt');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Lightning Bolt', quantity: 4, board: 'main', is_commander: false });
  });

  it('parses "4x CardName" format', () => {
    const result = parseDecklist('4x Lightning Bolt');
    expect(result[0].quantity).toBe(4);
    expect(result[0].name).toBe('Lightning Bolt');
  });

  it('parses a bare card name as quantity 1', () => {
    const result = parseDecklist('Lightning Bolt');
    expect(result[0]).toMatchObject({ name: 'Lightning Bolt', quantity: 1 });
  });

  it('skips blank lines', () => {
    const result = parseDecklist('\n\n4 Lightning Bolt\n\n');
    expect(result).toHaveLength(1);
  });

  it('skips // comment lines', () => {
    const result = parseDecklist('// this is a comment\n4 Lightning Bolt');
    expect(result).toHaveLength(1);
  });

  it('skips # comment lines', () => {
    const result = parseDecklist('# this is a comment\n4 Lightning Bolt');
    expect(result).toHaveLength(1);
  });

  it('parses the Commander section header and marks entry as is_commander', () => {
    const text = 'Commander\n1 Atraxa, Praetors Voice\nDeck\n4 Lightning Bolt';
    const result = parseDecklist(text);
    const commander = result.find(e => e.name === 'Atraxa, Praetors Voice');
    const bolt = result.find(e => e.name === 'Lightning Bolt');
    expect(commander?.is_commander).toBe(true);
    expect(commander?.board).toBe('main');
    expect(bolt?.is_commander).toBe(false);
  });

  it('parses the Sideboard section header', () => {
    const text = '4 Lightning Bolt\nSideboard\n2 Negate';
    const result = parseDecklist(text);
    const negate = result.find(e => e.name === 'Negate');
    expect(negate?.board).toBe('side');
  });

  it('parses MTGO SB: prefix as sideboard', () => {
    const result = parseDecklist('SB: 3 Duress');
    expect(result[0]).toMatchObject({ name: 'Duress', quantity: 3, board: 'side' });
  });

  it('parses Maybeboard section', () => {
    const text = '4 Lightning Bolt\nMaybeboard\n1 Kozilek, Butcher of Truth';
    const result = parseDecklist(text);
    const maybe = result.find(e => e.name === 'Kozilek, Butcher of Truth');
    expect(maybe?.board).toBe('maybe');
  });

  it('strips Arena set/collector suffix', () => {
    const result = parseDecklist('4 Lightning Bolt (M10) 141');
    expect(result[0].name).toBe('Lightning Bolt');
  });

  it('strips Arena foil marker', () => {
    const result = parseDecklist('4 Lightning Bolt (M10) 141 *F*');
    expect(result[0].name).toBe('Lightning Bolt');
  });

  it('handles multi-word card names', () => {
    const result = parseDecklist('1 Atraxa, Praetors Voice');
    expect(result[0].name).toBe('Atraxa, Praetors Voice');
  });

  it('returns an empty array for empty input', () => {
    expect(parseDecklist('')).toHaveLength(0);
    expect(parseDecklist('   \n  \n')).toHaveLength(0);
  });
});
