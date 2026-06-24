/**
 * AST → parameterized SQL compiler.
 *
 * SECURITY: Every user value is bound with `?`.
 * Only whitelisted column names, operators, and format-path strings are assembled in code.
 * No user value is ever string-concatenated into SQL.
 */

import type { ParsedQuery, SearchTerm, CompareOp, FilterField } from './parser';

// ── Safe SQL operator whitelist ────────────────────────────────────────────────

const NUMERIC_OPS: Record<CompareOp, string> = {
  ':': '=', '=': '=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
};

// ── Rarity rank (for >= / <= comparisons) ────────────────────────────────────

const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, mythic: 3 };

// ── Known formats (whitelist to prevent injection via path construction) ──────

const KNOWN_FORMATS = new Set([
  'standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper',
  'brawl', 'historicbrawl', 'historic', 'alchemy', 'explorer', 'oathbreaker', 'duel',
]);

// ── Whitelisted ORDER BY expressions ─────────────────────────────────────────

const ORDER_EXPR: Record<string, string> = {
  name:     'name COLLATE NOCASE ASC',
  cmc:      'cmc ASC NULLS LAST',
  price:    "CAST(json_extract(prices_json,'$.usd') AS REAL) ASC NULLS LAST",
  released: 'released_at IS NULL ASC, released_at ASC',
};

const ORDER_EXPR_DESC: Record<string, string> = {
  name:     'name COLLATE NOCASE DESC',
  cmc:      'cmc DESC NULLS LAST',
  price:    "CAST(json_extract(prices_json,'$.usd') AS REAL) DESC NULLS LAST",
  released: 'released_at IS NULL ASC, released_at DESC',
};

// ── Per-field predicate builders ──────────────────────────────────────────────

function buildPredicate(term: SearchTerm): { sql: string; params: unknown[] } | null {
  const { field, op, value, negate } = term;

  let sql = '';
  const params: unknown[] = [];

  switch (field) {
    case 'name': {
      // Match normalized name substring
      const norm = value.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!norm) return null;
      sql = 'name_norm LIKE ?';
      params.push(`%${norm}%`);
      break;
    }

    case 'type': {
      sql = 'LOWER(type_line) LIKE ?';
      params.push(`%${value}%`);
      break;
    }

    case 'oracle': {
      // Handled via FTS join; returns a sentinel that the assembler checks
      const escaped = value.replace(/"/g, '""');
      sql = `sc_fts_rowid_match`;  // marker — swapped by assembler
      params.push(`"${escaped}"`);
      break;
    }

    case 'colors':
    case 'identity': {
      // Both use color_identity_json (we only store identity in the DB)
      const col = 'color_identity_json';
      const letters = value.toUpperCase().split('').filter(c => 'WUBRG'.includes(c));

      if (value === 'C' || value === '') {
        // Colorless: no color identity at all
        sql = `json_array_length(${col}) = 0`;
      } else if (value === 'M') {
        // Multicolor: 2+ colors
        sql = `json_array_length(${col}) >= 2`;
      } else if (op === '=' || (op === ':' && field === 'colors')) {
        // For c: default is "contains at least these colors" (Scryfall default)
        // For c= it's exact
        if (op === '=') {
          // Exact: includes all AND count matches
          const includes = letters.map(() => `EXISTS (SELECT 1 FROM json_each(${col}) WHERE value = ?)`).join(' AND ');
          sql = `(${includes} AND json_array_length(${col}) = ?)`;
          params.push(...letters, letters.length);
        } else {
          // Contains all of (c:wub — has at least W, U, B)
          sql = letters.map(() => `EXISTS (SELECT 1 FROM json_each(${col}) WHERE value = ?)`).join(' AND ');
          params.push(...letters);
        }
      } else if (op === '>=') {
        // Superset: contains all of
        sql = letters.map(() => `EXISTS (SELECT 1 FROM json_each(${col}) WHERE value = ?)`).join(' AND ');
        params.push(...letters);
      } else if (op === '<=') {
        // Subset: no colors outside this set
        const placeholders = letters.map(() => '?').join(',');
        sql = `NOT EXISTS (SELECT 1 FROM json_each(${col}) WHERE value NOT IN (${placeholders}))`;
        params.push(...letters);
      } else {
        // Fallback to contains-all
        sql = letters.map(() => `EXISTS (SELECT 1 FROM json_each(${col}) WHERE value = ?)`).join(' AND ');
        params.push(...letters);
      }
      if (!sql) sql = 'TRUE';
      break;
    }

    case 'mv':
    case 'pow':
    case 'tou':
    case 'loy': {
      const colMap: Partial<Record<FilterField, string>> = {
        mv: 'cmc', pow: 'power_num', tou: 'toughness_num', loy: 'loyalty_num',
      };
      const col = colMap[field];
      if (!col) return null;
      const sqlOp = NUMERIC_OPS[op] ?? '=';
      const num = parseFloat(value);
      if (isNaN(num)) return null;
      // Null-safe: numeric filters exclude cards where the column is NULL
      sql = `${col} IS NOT NULL AND ${col} ${sqlOp} ?`;
      params.push(num);
      break;
    }

    case 'rarity': {
      const rank = RARITY_RANK[value.toLowerCase()];
      if (rank === undefined) {
        // Exact string match for unknown rarities
        sql = 'LOWER(rarity) = ?';
        params.push(value.toLowerCase());
      } else if (op === '>=' || op === '<=') {
        const sqlOp = op === '>=' ? '>=' : '<=';
        // Use CASE to convert rarity to a rank number inline
        sql = `CASE LOWER(rarity) WHEN 'common' THEN 0 WHEN 'uncommon' THEN 1 WHEN 'rare' THEN 2 WHEN 'mythic' THEN 3 ELSE -1 END ${sqlOp} ?`;
        params.push(rank);
      } else {
        sql = 'LOWER(rarity) = ?';
        params.push(value.toLowerCase());
      }
      break;
    }

    case 'format': {
      const fmt = value.toLowerCase().replace(/[^a-z]/g, '');
      if (!KNOWN_FORMATS.has(fmt)) {
        // Unknown format — return a falsy predicate (no results) rather than erroring
        sql = '1 = 0 /* unknown format */';
        break;
      }
      // Bind the full JSON path string (derived from whitelist, not raw user text)
      const path = `$.${fmt}`;
      sql = `json_extract(legalities_json, ?) = 'legal'`;
      params.push(path);
      break;
    }

    case 'set': {
      sql = 'LOWER(set_code) = ?';
      params.push(value.toLowerCase());
      break;
    }

    case 'is': {
      switch (value.toLowerCase()) {
        case 'foil':
          sql = `EXISTS (SELECT 1 FROM json_each(finishes_json) WHERE value = 'foil')`;
          break;
        case 'nonfoil':
          sql = `EXISTS (SELECT 1 FROM json_each(finishes_json) WHERE value = 'nonfoil')`;
          break;
        case 'etched':
          sql = `EXISTS (SELECT 1 FROM json_each(finishes_json) WHERE value = 'etched')`;
          break;
        case 'fullart': case 'full-art': case 'full_art':
          sql = 'full_art = 1';
          break;
        case 'promo':
          sql = `promo_types_json IS NOT NULL AND json_array_length(promo_types_json) > 0`;
          break;
        case 'land':
          sql = `LOWER(type_line) LIKE '%land%'`;
          break;
        case 'spell':
          sql = `LOWER(type_line) NOT LIKE '%land%'`;
          break;
        case 'permanent':
          sql = `(LOWER(type_line) LIKE '%creature%' OR LOWER(type_line) LIKE '%artifact%' OR LOWER(type_line) LIKE '%enchantment%' OR LOWER(type_line) LIKE '%planeswalker%' OR LOWER(type_line) LIKE '%battle%' OR LOWER(type_line) LIKE '%land%')`;
          break;
        case 'commander':
          sql = `(LOWER(type_line) LIKE '%legendary%creature%' OR LOWER(oracle_text) LIKE '%can be your commander%')`;
          break;
        case 'historic':
          sql = `(LOWER(type_line) LIKE '%legendary%' OR LOWER(type_line) LIKE '%artifact%' OR LOWER(type_line) LIKE '%saga%')`;
          break;
        case 'dfc': case 'transform': case 'flip':
          sql = `card_faces_json IS NOT NULL`;
          break;
        case 'split':
          sql = `type_line LIKE '%//%'`;
          break;
        case 'borderless':
          sql = `LOWER(border_color) = 'borderless'`;
          break;
        case 'showcase':
          sql = `EXISTS (SELECT 1 FROM json_each(frame_effects_json) WHERE value = 'showcase')`;
          break;
        case 'extendedart': case 'extended-art': case 'extended_art':
          sql = `EXISTS (SELECT 1 FROM json_each(frame_effects_json) WHERE value = 'extendedart')`;
          break;
        case 'retro':
          sql = `EXISTS (SELECT 1 FROM json_each(frame_effects_json) WHERE value = 'retro')`;
          break;
        case 'textless':
          sql = `(oracle_text IS NULL OR oracle_text = '')`;
          break;
        default:
          // Unknown is: — treat as no-op (don't crash)
          return null;
      }
      break;
    }

    case 'keyword': {
      sql = `EXISTS (SELECT 1 FROM json_each(keywords_json) WHERE LOWER(value) = ?)`;
      params.push(value.toLowerCase());
      break;
    }

    case 'price_usd': {
      const sqlOp = NUMERIC_OPS[op] ?? '=';
      const num = parseFloat(value);
      if (isNaN(num)) return null;
      const col = `CAST(json_extract(prices_json,'$.usd') AS REAL)`;
      sql = `${col} IS NOT NULL AND ${col} ${sqlOp} ?`;
      params.push(num);
      break;
    }

    case 'price_eur': {
      const sqlOp = NUMERIC_OPS[op] ?? '=';
      const num = parseFloat(value);
      if (isNaN(num)) return null;
      const col = `CAST(json_extract(prices_json,'$.eur') AS REAL)`;
      sql = `${col} IS NOT NULL AND ${col} ${sqlOp} ?`;
      params.push(num);
      break;
    }

    case 'artist': {
      sql = `LOWER(artist) LIKE ?`;
      params.push(`%${value.toLowerCase()}%`);
      break;
    }

    case 'flavor': {
      sql = `LOWER(flavor_text) LIKE ?`;
      params.push(`%${value.toLowerCase()}%`);
      break;
    }

    case 'year': {
      const sqlOp = NUMERIC_OPS[op] ?? '=';
      const num = parseInt(value, 10);
      if (isNaN(num)) return null;
      sql = `released_at IS NOT NULL AND CAST(strftime('%Y', released_at) AS INTEGER) ${sqlOp} ?`;
      params.push(num);
      break;
    }

    case 'banned': {
      const fmt = value.toLowerCase().replace(/[^a-z]/g, '');
      if (!KNOWN_FORMATS.has(fmt)) { sql = '1 = 0'; break; }
      sql = `json_extract(legalities_json, ?) = 'banned'`;
      params.push(`$.${fmt}`);
      break;
    }

    case 'restricted': {
      const fmt = value.toLowerCase().replace(/[^a-z]/g, '');
      if (!KNOWN_FORMATS.has(fmt)) { sql = '1 = 0'; break; }
      sql = `json_extract(legalities_json, ?) = 'restricted'`;
      params.push(`$.${fmt}`);
      break;
    }

    case 'cn': {
      if (op === ':' || op === '=') {
        sql = `collector_number = ?`;
        params.push(value);
      } else {
        const sqlOp = NUMERIC_OPS[op] ?? '=';
        const num = parseInt(value, 10);
        if (isNaN(num)) return null;
        sql = `CAST(collector_number AS INTEGER) ${sqlOp} ?`;
        params.push(num);
      }
      break;
    }

    case 'border': {
      sql = `LOWER(border_color) = ?`;
      params.push(value.toLowerCase());
      break;
    }

    case 'frame': {
      sql = `EXISTS (SELECT 1 FROM json_each(frame_effects_json) WHERE LOWER(value) = ?)`;
      params.push(value.toLowerCase());
      break;
    }

    default:
      return null;
  }

  if (negate) {
    // For the FTS sentinel we handle negation in the assembler
    if (sql === 'sc_fts_rowid_match') {
      return { sql: 'sc_fts_rowid_not_match', params };
    }
    sql = `NOT (${sql})`;
  }

  return { sql, params };
}

// ── Main assembler ────────────────────────────────────────────────────────────

export interface CompiledQuery {
  sql: string;
  params: unknown[];
}

export function compileQuery(
  parsed: ParsedQuery,
  opts: { limit?: number; offset?: number; countOnly?: boolean } = {}
): CompiledQuery {
  const { limit = 60, offset = 0, countOnly = false } = opts;
  const predicates: string[] = [];
  const params: unknown[] = [];
  const ftsPositive: string[] = [];
  const ftsNegative: string[] = [];

  for (const term of parsed.terms) {
    const result = buildPredicate(term);
    if (!result) continue;

    if (result.sql === 'sc_fts_rowid_match') {
      ftsPositive.push(result.params[0] as string);
    } else if (result.sql === 'sc_fts_rowid_not_match') {
      ftsNegative.push(result.params[0] as string);
    } else {
      predicates.push(result.sql);
      params.push(...result.params);
    }
  }

  // FTS positive terms → rowid IN (...)
  for (const matchExpr of ftsPositive) {
    predicates.push(`scryfall_cards.rowid IN (SELECT rowid FROM scryfall_fts WHERE scryfall_fts MATCH ?)`);
    params.push(matchExpr);
  }

  // FTS negative terms → rowid NOT IN (...)
  for (const matchExpr of ftsNegative) {
    predicates.push(`scryfall_cards.rowid NOT IN (SELECT rowid FROM scryfall_fts WHERE scryfall_fts MATCH ?)`);
    params.push(matchExpr);
  }

  const whereClause = predicates.length ? `WHERE ${predicates.join(' AND ')}` : '';

  if (countOnly) {
    const sql = `
      SELECT COUNT(DISTINCT oracle_id) as total
      FROM scryfall_cards
      ${whereClause}
    `;
    return { sql, params };
  }

  // Order BY
  let orderBy = ORDER_EXPR.name;  // default
  if (parsed.order) {
    const expr = parsed.order.dir === 'desc'
      ? ORDER_EXPR_DESC[parsed.order.key]
      : ORDER_EXPR[parsed.order.key];
    if (expr) orderBy = expr;
  }

  const sql = `
    SELECT scryfall_id, oracle_id, name, name_norm, set_code, collector_number,
           type_line, mana_cost, cmc, oracle_text, rarity,
           color_identity_json, colors_json, finishes_json, frame_effects_json,
           border_color, full_art, image_uris_json, prices_json, legalities_json,
           card_faces_json, keywords_json, artist, flavor_text, released_at,
           power, toughness, loyalty, prints_search_uri
    FROM scryfall_cards
    ${whereClause}
    GROUP BY oracle_id
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  return { sql, params: [...params, limit, offset] };
}
