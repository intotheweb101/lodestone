import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  normalizeNameIndex,
  normalizeCollector,
  normalizeSetCode,
  buildMatchKey,
  parseFinishFromSku,
  parseFinishFromTitle,
  parseConditionRank,
  CONDITION_MAP,
} from './normalize';

// ── normalizeName ─────────────────────────────────────────────────────────────

describe('normalizeName', () => {
  it('lowercases the input', () => {
    expect(normalizeName('Lightning Bolt')).toBe('lightning bolt');
  });

  it('strips accents / diacritics', () => {
    // Lim-Dûl → lim-dul
    expect(normalizeName('Lim-Dûl')).toBe('lim-dul');
  });

  it('takes only the front face of an MDFC / split card', () => {
    expect(normalizeName('Fire // Ice')).toBe('fire');
    expect(normalizeName('Delver of Secrets // Insectile Aberration')).toBe('delver of secrets');
  });

  it('strips Arena set/collector suffix in parentheses', () => {
    expect(normalizeName('Lightning Bolt (M10) 123')).toBe('lightning bolt');
  });

  it('strips bracket annotations', () => {
    expect(normalizeName('Lightning Bolt [M10]')).toBe('lightning bolt');
  });

  it('normalises smart quotes to plain apostrophe', () => {
    // Explicit \u escapes: \u2019 = RIGHT SINGLE QUOTATION MARK
    const withSmartQuote = 'Jace\u2019s Ingenuity';
    const result = normalizeName(withSmartQuote);
    // normalizeName should replace U+2019 with a plain apostrophe U+0027
    expect(result.charCodeAt(4)).toBe(0x27);
    expect(result.includes('\u2019')).toBe(false);
  });

  it('collapses multiple internal spaces to one', () => {
    expect(normalizeName('Lightning   Bolt')).toBe('lightning bolt');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeName('  Lightning Bolt  ')).toBe('lightning bolt');
  });
});

// ── normalizeNameIndex ────────────────────────────────────────────────────────

describe('normalizeNameIndex', () => {
  it('strips all non-alphanumeric characters', () => {
    expect(normalizeNameIndex("Jace's Ingenuity")).toBe('jacesIngenuity'.toLowerCase());
  });

  it('handles hyphens', () => {
    expect(normalizeNameIndex('Lim-Dûl')).toBe('limdul');
  });
});

// ── normalizeCollector ────────────────────────────────────────────────────────

describe('normalizeCollector', () => {
  it('strips leading zeros from plain numbers', () => {
    expect(normalizeCollector('019')).toBe('19');
    expect(normalizeCollector('001')).toBe('1');
  });

  it('preserves trailing letter suffixes', () => {
    expect(normalizeCollector('121a')).toBe('121a');
    expect(normalizeCollector('019b')).toBe('19b');
  });

  it('does not strip the only digit', () => {
    expect(normalizeCollector('01')).toBe('1');
    expect(normalizeCollector('1')).toBe('1');
  });

  it('maps star/promo markers to "star"', () => {
    expect(normalizeCollector('★1')).toBe('star1');
    expect(normalizeCollector('42★')).toBe('42star');
  });

  it('preserves numbers already without leading zeros', () => {
    expect(normalizeCollector('300')).toBe('300');
  });
});

// ── normalizeSetCode ──────────────────────────────────────────────────────────

describe('normalizeSetCode', () => {
  it('lowercases set codes', () => {
    expect(normalizeSetCode('MH3')).toBe('mh3');
    expect(normalizeSetCode('M10')).toBe('m10');
  });

  it('trims whitespace', () => {
    expect(normalizeSetCode(' lea ')).toBe('lea');
  });
});

// ── buildMatchKey ─────────────────────────────────────────────────────────────

describe('buildMatchKey', () => {
  it('produces a canonical key', () => {
    expect(buildMatchKey('MH3', '121', 'foil')).toBe('mh3::121::foil');
  });

  it('strips leading zeros from collector number', () => {
    expect(buildMatchKey('M10', '019', 'nonfoil')).toBe('m10::19::nonfoil');
  });

  it('lowercases the set code', () => {
    expect(buildMatchKey('LEA', '1', 'etched')).toBe('lea::1::etched');
  });

  it('uses double-colon separators', () => {
    const key = buildMatchKey('SET', '42', 'nonfoil');
    expect(key.split('::').length).toBe(3);
  });
});

// ── parseFinishFromTitle ──────────────────────────────────────────────────────

describe('parseFinishFromTitle', () => {
  it('detects foil', () => {
    expect(parseFinishFromTitle('Foil Edition')).toBe('foil');
    expect(parseFinishFromTitle('FOIL')).toBe('foil');
  });

  it('detects etched foil before foil', () => {
    expect(parseFinishFromTitle('Etched Foil')).toBe('etched');
    expect(parseFinishFromTitle('etched')).toBe('etched');
  });

  it('detects nonfoil variants', () => {
    expect(parseFinishFromTitle('Non-Foil')).toBe('nonfoil');
    expect(parseFinishFromTitle('NonFoil')).toBe('nonfoil');
    expect(parseFinishFromTitle('non foil')).toBe('nonfoil');
  });

  it('returns unknown when no finish detected', () => {
    expect(parseFinishFromTitle('Near Mint')).toBe('unknown');
    expect(parseFinishFromTitle('')).toBe('unknown');
  });
});

// ── parseFinishFromSku ────────────────────────────────────────────────────────

describe('parseFinishFromSku', () => {
  it('detects foil from -FO- pattern', () => {
    expect(parseFinishFromSku('MTG-MH3-121-FO-abc')).toBe('foil');
  });

  it('detects nonfoil from -NF- pattern', () => {
    expect(parseFinishFromSku('MTG-MH3-121-NF-abc')).toBe('nonfoil');
  });

  it('detects etched finish', () => {
    expect(parseFinishFromSku('MTG-MH3-121-ETCH-abc')).toBe('etched');
  });

  it('returns unknown for unrecognised patterns', () => {
    expect(parseFinishFromSku('SOME-OTHER-SKU')).toBe('unknown');
  });
});

// ── parseConditionRank ────────────────────────────────────────────────────────

describe('parseConditionRank', () => {
  it('maps Near Mint to rank 0', () => {
    expect(parseConditionRank('Near Mint').rank).toBe(0);
    expect(parseConditionRank('NM').rank).toBe(0);
    expect(parseConditionRank('nm').rank).toBe(0);
  });

  it('maps Lightly Played / LP to rank 1', () => {
    expect(parseConditionRank('Lightly Played').rank).toBe(1);
    expect(parseConditionRank('LP').rank).toBe(1);
    expect(parseConditionRank('Slightly Played').rank).toBe(1);
  });

  it('maps Moderately Played / MP to rank 2', () => {
    expect(parseConditionRank('Moderately Played').rank).toBe(2);
    expect(parseConditionRank('MP').rank).toBe(2);
  });

  it('maps Heavily Played / HP to rank 3', () => {
    expect(parseConditionRank('Heavily Played').rank).toBe(3);
    expect(parseConditionRank('HP').rank).toBe(3);
  });

  it('maps Damaged to rank 4', () => {
    expect(parseConditionRank('Damaged').rank).toBe(4);
    expect(parseConditionRank('DMG').rank).toBe(4);
  });

  it('takes the WORSE rank from a combined "Near Mint / Lightly Played" string', () => {
    // NM (0) / LP (1) → worst is LP (rank 1)
    expect(parseConditionRank('Near Mint / Lightly Played').rank).toBe(1);
    // NM (0) / MP (2) → worst is MP (rank 2)
    expect(parseConditionRank('Near Mint / Moderately Played').rank).toBe(2);
  });

  it('preserves the raw condition label in the returned object', () => {
    const result = parseConditionRank('Near Mint');
    expect(result.condition).toBe('Near Mint');
  });
});

// ── CONDITION_MAP spot-check ──────────────────────────────────────────────────

describe('CONDITION_MAP', () => {
  it('exports consistent rank values', () => {
    expect(CONDITION_MAP['nm']).toBe(0);
    expect(CONDITION_MAP['lp']).toBe(1);
    expect(CONDITION_MAP['mp']).toBe(2);
    expect(CONDITION_MAP['hp']).toBe(3);
    expect(CONDITION_MAP['dmg']).toBe(4);
  });
});
