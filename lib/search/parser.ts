/**
 * Scryfall-style query syntax parser.
 *
 * Tokenizes a raw query string into a ParsedQuery (list of typed terms + ordering).
 * Every filter key maps to a typed field; unknown keys become name terms + error entries.
 * serializeQuery() is the inverse — used by the filter UI to round-trip chips ↔ raw text.
 */

export type CompareOp = ':' | '=' | '>' | '<' | '>=' | '<=';

export type FilterField =
  | 'name'
  | 'type'
  | 'oracle'
  | 'colors'
  | 'identity'
  | 'mv'
  | 'pow'
  | 'tou'
  | 'loy'
  | 'rarity'
  | 'format'
  | 'set'
  | 'is'
  | 'keyword';

export interface SearchTerm {
  field: FilterField;
  op: CompareOp;
  value: string;     // lowercased for most fields; kept as-is for display
  negate: boolean;
}

export interface ParsedQuery {
  terms: SearchTerm[];
  order: { key: 'name' | 'cmc' | 'price'; dir: 'asc' | 'desc' } | null;
  errors: string[];  // unrecognised keys — surfaced in UI but non-fatal
}

// ── Guild / shard / wedge → letter map ───────────────────────────────────────

const COLOR_NAMES: Record<string, string> = {
  white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G',
  colorless: 'C', c: 'C',
  // Guilds
  azorius: 'WU', dimir: 'UB', rakdos: 'BR', gruul: 'RG', selesnya: 'GW',
  orzhov: 'WB', izzet: 'UR', golgari: 'BG', boros: 'RW', simic: 'GU',
  // Shards
  esper: 'WUB', grixis: 'UBR', jund: 'BRG', naya: 'RGW', bant: 'GWU',
  // Wedges
  mardu: 'RWB', temur: 'GUR', abzan: 'WBG', jeskai: 'URW', sultai: 'BGU',
  // 4-colour
  artifice: 'WUBR', chaos: 'UBRG', altruism: 'BRGW', growth: 'RGWU', aggression: 'GWUB',
};

function parseColorValue(raw: string): string {
  const lo = raw.toLowerCase();
  if (COLOR_NAMES[lo]) return COLOR_NAMES[lo];
  // Strip duplicates, uppercase
  return [...new Set(lo.toUpperCase().split('').filter(c => 'WUBRG'.includes(c)))].join('');
}

// ── Key → field map ───────────────────────────────────────────────────────────

const KEY_TO_FIELD: Record<string, FilterField> = {
  t: 'type', type: 'type',
  o: 'oracle', oracle: 'oracle', text: 'oracle',
  c: 'colors', color: 'colors', col: 'colors',
  id: 'identity', identity: 'identity', ci: 'identity',
  mv: 'mv', cmc: 'mv', manavalue: 'mv',
  pow: 'pow', power: 'pow',
  tou: 'tou', toughness: 'tou',
  loy: 'loy', loyalty: 'loy',
  r: 'rarity', rarity: 'rarity',
  f: 'format', format: 'format', legal: 'format',
  s: 'set', e: 'set', set: 'set',
  is: 'is',
  kw: 'keyword', keyword: 'keyword', keywords: 'keyword',
};

const NUMERIC_FIELDS: Set<FilterField> = new Set(['mv', 'pow', 'tou', 'loy']);
const ORDER_KEYS: Record<string, 'name' | 'cmc' | 'price'> = {
  name: 'name', cmc: 'cmc', mv: 'cmc', manavalue: 'cmc', price: 'price',
};

// ── Tokenizer ─────────────────────────────────────────────────────────────────

function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < raw.length) {
    // Skip whitespace
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) break;

    const start = i;
    let token = '';
    let inQuote = false;

    while (i < raw.length && (inQuote || !/\s/.test(raw[i]))) {
      if (raw[i] === '"') {
        if (inQuote && raw[i - 1] === '\\') {
          token = token.slice(0, -1) + '"';
        } else {
          inQuote = !inQuote;
          token += raw[i];
        }
        i++;
      } else {
        token += raw[i++];
      }
    }
    if (token) tokens.push(token);
  }
  return tokens;
}

// ── Parse a single token into a SearchTerm ───────────────────────────────────

function parseTerm(token: string, errors: string[]): SearchTerm | null {
  let rest = token;
  let negate = false;
  if (rest.startsWith('-')) {
    negate = true;
    rest = rest.slice(1);
  }
  if (!rest) return null;

  // Try to split on key + operator
  // Match longest key first, then operator
  const opMatch = rest.match(/^([a-zA-Z]+)(>=|<=|:|=|>|<)(.*)$/);
  if (opMatch) {
    const [, rawKey, opStr, rawValue] = opMatch;
    const key = rawKey.toLowerCase();
    const op = opStr as CompareOp;

    // Handle order: / sort: / dir: / direction:
    if (key === 'order' || key === 'sort') {
      // Handled separately in parseQuery; skip here
      return null;
    }
    if (key === 'dir' || key === 'direction') {
      return null;
    }

    const field = KEY_TO_FIELD[key];
    if (!field) {
      errors.push(`Unknown filter key "${key}" — treating as name search`);
      // Treat entire token (minus negate) as a name term
      const value = stripQuotes(rest);
      return { field: 'name', op: ':', value: value.toLowerCase(), negate };
    }

    // Validate op for non-numeric fields
    if (!NUMERIC_FIELDS.has(field) && field !== 'colors' && field !== 'identity' && op !== ':' && op !== '=') {
      errors.push(`Operator "${op}" is not valid for "${key}" — using ":"`);
      return { field, op: ':', value: stripQuotes(rawValue).toLowerCase(), negate };
    }

    let value = stripQuotes(rawValue);
    if (field === 'colors' || field === 'identity') {
      value = parseColorValue(value);
    } else if (!NUMERIC_FIELDS.has(field)) {
      value = value.toLowerCase();
    }

    return { field, op, value, negate };
  }

  // No operator found — treat as bare name term
  const value = stripQuotes(rest);
  return { field: 'name', op: ':', value: value.toLowerCase(), negate };
}

function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1);
  }
  return s;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseQuery(raw: string): ParsedQuery {
  const tokens = tokenize(raw.trim());
  const errors: string[] = [];
  let order: ParsedQuery['order'] = null;
  let orderDir: 'asc' | 'desc' = 'asc';

  // First pass: extract order:/dir: tokens
  const remainingTokens: string[] = [];
  for (const token of tokens) {
    const opMatch = token.match(/^([a-zA-Z]+)(:|=)(.+)$/);
    if (opMatch) {
      const key = opMatch[1].toLowerCase();
      const val = opMatch[3].toLowerCase();
      if (key === 'order' || key === 'sort') {
        const orderKey = ORDER_KEYS[val];
        if (orderKey) {
          order = { key: orderKey, dir: orderDir };
        } else {
          errors.push(`Unknown sort key "${val}"`);
        }
        continue;
      }
      if (key === 'dir' || key === 'direction') {
        orderDir = val === 'desc' ? 'desc' : 'asc';
        if (order) order = { ...order, dir: orderDir };
        continue;
      }
    }
    remainingTokens.push(token);
  }

  // Re-apply orderDir in case dir: came before order:
  if (order) order = { ...order, dir: orderDir };

  const terms: SearchTerm[] = [];
  for (const token of remainingTokens) {
    const term = parseTerm(token, errors);
    if (term) terms.push(term);
  }

  return { terms, order, errors };
}

/** Serialize a ParsedQuery back to a query string (for filter chip round-trips). */
export function serializeQuery(q: ParsedQuery): string {
  const parts: string[] = [];

  for (const term of q.terms) {
    const prefix = term.negate ? '-' : '';
    const needsQuotes = /\s/.test(term.value);
    const val = needsQuotes ? `"${term.value}"` : term.value;

    if (term.field === 'name') {
      parts.push(`${prefix}${val}`);
    } else {
      const key = fieldToKey(term.field);
      parts.push(`${prefix}${key}${term.op}${val}`);
    }
  }

  if (q.order) {
    parts.push(`order:${q.order.key}`);
    if (q.order.dir !== 'asc') parts.push(`dir:${q.order.dir}`);
  }

  return parts.join(' ');
}

function fieldToKey(field: FilterField): string {
  const MAP: Record<FilterField, string> = {
    name: '', type: 't', oracle: 'o', colors: 'c', identity: 'id',
    mv: 'mv', pow: 'pow', tou: 'tou', loy: 'loy',
    rarity: 'r', format: 'f', set: 's', is: 'is', keyword: 'kw',
  };
  return MAP[field] ?? field;
}
