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
  name: 'name COLLATE NOCASE ASC',
  cmc:  'cmc ASC NULLS LAST',
  price: "CAST(json_extract(prices_json,'$.usd') AS REAL) ASC NULLS LAST",
};

const ORDER_EXPR_DESC: Record<string, string> = {
  name:  'name COLLATE NOCASE DESC',
  cmc:   'cmc DESC NULLS LAST',
  price: "CAST(json_extract(prices_json,'$.usd') AS REAL) DESC NULLS LAST",
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
      const colMap: Record<FilterField, string> = {
        mv: 'cmc', pow: 'power_num', tou: 'toughness_num', loy: 'loyalty_num',
        // unused but required for exhaustive map
        name: '', type: '', oracle: '', colors: '', identity: '',
        rarity: '', format: '', set: '', is: '', keyword: '',
      };
      const col = colMap[field];
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
        case 'commander':
          sql = `(LOWER(type_line) LIKE '%legendary%creature%' OR LOWER(oracle_text) LIKE '%can be your commander%')`;
          break;
        case 'dfc': case 'transform': case 'flip':
          sql = `card_faces_json IS NOT NULL`;
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
           type_line, mana_cost, cmc, oracle_text, rarity, color_identity_json,
           finishes_json, full_art, image_uris_json, prices_json, legalities_json,
           card_faces_json
    FROM scryfall_cards
    ${whereClause}
    GROUP BY oracle_id
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  return { sql, params: [...params, limit, offset] };
}
