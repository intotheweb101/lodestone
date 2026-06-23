/**
 * Normalization utilities — all string-equality comparisons must go through these.
 * Correctness of the matcher entirely depends on these being stable.
 */

// Words in card/product titles that indicate finish/treatment — strip when normalizing the card name
const STRIP_WORDS = [
  'foil', 'nonfoil', 'non-foil', 'borderless', 'showcase', 'extended art', 'extended-art',
  'full art', 'full-art', 'etched', 'retro frame', 'retro', 'promo', 'prerelease',
  'buy-a-box', 'buy a box', 'galaxy foil', 'surge foil', 'gilded foil', 'silver screen foil',
  'scroll foil', 'confetti foil', 'dragonscale foil', 'jp alternate art', 'alternate art',
  'alt art', 'japanese', 'step-and-compleat foil',
];

/**
 * Normalize a card name for comparison.
 * - NFKD accent fold (Lim-Dûl → lim-dul)
 * - lowercase
 * - collapse MDFC/split "A // B" → try both sides
 * - strip treatment tokens
 * - collapse non-alphanumeric to single space, trim
 */
export function normalizeName(raw: string): string {
  let s = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase();

  // Handle split/MDFC: take the front half for matching (full name is in DB too)
  if (s.includes(' // ')) {
    s = s.split(' // ')[0].trim();
  }

  // Strip everything after a parenthesis or bracket (treatment/set annotations)
  s = s.replace(/\s*[\(\[].*/g, '').trim();

  // Normalise punctuation variants
  s = s.replace(/['']/g, "'"); // smart quotes → plain apostrophe

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/** Normalize for DB storage — strips ALL non-alphanumeric for fast LIKE queries */
export function normalizeNameIndex(raw: string): string {
  return normalizeName(raw).replace(/[^a-z0-9]/g, '');
}

/**
 * Normalize a collector number.
 * - Lowercase letter suffixes, keep them (121a ≠ 121)
 * - Strip leading zeros: "019" → "19"
 * - Preserve special chars: ★, ✦ (promo markers) — map to 'star'
 */
export function normalizeCollector(raw: string): string {
  let s = raw.trim().toLowerCase();
  // Preserve star/promo markers
  s = s.replace(/[★✦⋆]/g, 'star');
  // Strip leading zeros but keep the rest (including trailing letters)
  s = s.replace(/^0+(\d)/, '$1');
  return s;
}

/** Normalize a set code for the match_key */
export function normalizeSetCode(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Build the canonical match key used in shop_variants.match_key */
export function buildMatchKey(setCode: string, collectorNumber: string, finish: 'nonfoil' | 'foil' | 'etched'): string {
  return `${normalizeSetCode(setCode)}::${normalizeCollector(collectorNumber)}::${finish}`;
}

/**
 * Parse finish from a SKU string or variant title.
 * Returns 'foil' | 'nonfoil' | 'etched' | 'unknown'
 */
export function parseFinishFromSku(sku: string): 'foil' | 'nonfoil' | 'etched' | 'unknown' {
  const s = sku.toUpperCase();
  // Dialect B: -FO- or ends with -FO-N, -NF- etc.
  if (/-FO[-_]/i.test(sku) || /-F-/i.test(sku) || s.includes('-FO-') || s.endsWith('-FO')) return 'foil';
  if (/-NF[-_]/i.test(sku) || s.includes('-NF-') || s.endsWith('-NF')) return 'nonfoil';
  if (/ETCH/i.test(sku)) return 'etched';
  // Dialect A: MTG-<SET>-<COL>-F-<hash> or MTG-<SET>-<COL>-NF-<hash>
  // Already covered above
  return 'unknown';
}

/**
 * Parse finish from a human-readable option/title.
 */
export function parseFinishFromTitle(title: string): 'foil' | 'nonfoil' | 'etched' | 'unknown' {
  const lower = title.toLowerCase();
  if (lower.includes('etched')) return 'etched';
  if (lower.includes('foil')) return 'foil';
  if (lower.includes('non-foil') || lower.includes('nonfoil') || lower.includes('non foil')) return 'nonfoil';
  return 'unknown';
}

/** Map a condition string to a 0-based rank (lower = better) */
export const CONDITION_MAP: Record<string, number> = {
  'near mint':       0,
  'nm':              0,
  'lightly played':  1,
  'lp':              1,
  'slightly played': 1,
  'sp':              1,
  'moderately played': 2,
  'mp':              2,
  'heavily played':  3,
  'hp':              3,
  'damaged':         4,
  'dmg':             4,
  'd':               4,
};

export function parseConditionRank(raw: string): { condition: string; rank: number } {
  const lower = raw.toLowerCase().trim();

  // Handle combined "Near Mint / Lightly Played" (Dialect B) — take the WORSE grade (conservative)
  if (lower.includes('/')) {
    const parts = lower.split('/').map(p => p.trim());
    const ranks = parts.map(p => {
      // try exact then prefix
      return CONDITION_MAP[p] ?? CONDITION_MAP[p.split(' ')[0]] ?? 99;
    });
    const worstRank = Math.max(...ranks);
    const worstLabel = parts[ranks.indexOf(worstRank)] ?? raw;
    return { condition: worstLabel, rank: worstRank };
  }

  // Strip foil suffix that sometimes appears
  const stripped = lower.replace(/\s*(foil|non-?foil)\s*/gi, '').trim();

  const rank = CONDITION_MAP[stripped] ?? CONDITION_MAP[stripped.split(' ')[0]] ?? 99;
  return { condition: raw.trim(), rank };
}
