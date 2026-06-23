/**
 * Set code alias map: shop set codes → Scryfall set codes.
 * This is built at runtime from Scryfall /sets, but we seed known divergences here
 * as a fallback so Phase 1 works before the full bulk ingest runs.
 *
 * Key = shop set code (lowercase), Value = Scryfall set code (lowercase).
 */

// Known divergences observed in NZ shop SKUs and titles
const SEED_ALIASES: Record<string, string> = {
  // Mystical Archive (Japanese promos from Strixhaven)
  'soa': 'spm',     // shops sometimes use SOA for Secret Lair / Mystical Archive
  'sta': 'sta',     // Strixhaven Mystical Archive
  // Tarkir Dragonstorm Special Guests
  'stdm': 'spg',    // placeholder; actual Scryfall code TBD
  // Some shops use full set names as codes
  'dmu': 'dmu',     // Dominaria United
  'mom': 'mom',     // March of the Machine
  // Aliases from Calico Keep's SWU (Star Wars Unlimited) prefix strip
  // (non-MTG, but their SKU parser will handle the MTG- prefix)
};

let _aliasMap: Record<string, string> = { ...SEED_ALIASES };
let _nameToCode: Record<string, string> = {};

/** Load aliases from the sets table (call after migrations + Scryfall ingest) */
export function loadSetAliasesFromDb(): void {
  try {
    const { getDb } = require('../db/connection');
    const db = getDb();
    const rows = db.prepare('SELECT code, name, name_norm FROM sets').all() as { code: string; name: string; name_norm: string }[];
    for (const { code, name, name_norm } of rows) {
      _nameToCode[name_norm] = code;
      _nameToCode[name.toLowerCase()] = code;
    }
    console.log(`[setAliases] Loaded ${rows.length} set codes from DB.`);
  } catch {
    // DB not yet populated; seed aliases still apply
  }
}

/** Resolve a shop set code to its Scryfall equivalent */
export function resolveSetCode(shopCode: string): string {
  const lower = shopCode.toLowerCase();
  return _aliasMap[lower] ?? lower; // if unknown, pass through (may still work if codes match)
}

/** Resolve a set name to a Scryfall set code */
export function resolveSetName(setName: string): string | null {
  const norm = setName.toLowerCase().trim();
  return _nameToCode[norm] ?? null;
}

/** Register a new alias (called by ingest when it encounters an unresolved code) */
export function registerAlias(shopCode: string, scryfallCode: string): void {
  _aliasMap[shopCode.toLowerCase()] = scryfallCode.toLowerCase();
}

/** Get the full alias map (for debugging/logging) */
export function getAliasMap(): Record<string, string> {
  return { ..._aliasMap };
}
