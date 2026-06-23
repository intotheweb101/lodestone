/**
 * Tiered card matcher: SKU data → Scryfall printing identity → match_key
 *
 * Called at ingest time (per variant) to compute match_key + confidence,
 * which is stored in shop_variants for fast indexed pricing queries.
 *
 * Tiers:
 *   0 — SKU set-code + collector-number + finish (authoritative)
 *   1 — Title-embedded (SETCODE-COLLECTOR) regex (Dialect A backup)
 *   2 — Exact normalized name + set-name match (fallback)
 *   3 — No confident match → key = null, confidence = 'none'
 */

import {
  buildMatchKey,
  normalizeCollector,
  normalizeSetCode,
  parseFinishFromSku,
  parseFinishFromTitle,
  parseConditionRank,
} from './normalize';
import { resolveSetCode, resolveSetName } from './setAliases';

export type Confidence = 'exact' | 'probable' | 'weak' | 'none';
export type Finish = 'nonfoil' | 'foil' | 'etched' | 'unknown';

export interface MatchResult {
  match_key: string | null;
  confidence: Confidence;
  set_code_norm: string | null;
  collector_norm: string | null;
  finish: Finish;
  condition: string;
  condition_rank: number;
  warning?: string;
}

export interface VariantInput {
  sku: string | null;
  title: string;               // product title
  option1: string;             // variant option 1 (usually condition or condition+finish)
  option2?: string | null;     // variant option 2
  dialect: 'A' | 'B' | 'unknown';
}

/**
 * Parse Dialect A SKU: MTG-<SET>-<COL>-<FINISH>-<hash>-<condIdx>
 * or SWU/other game prefix stripped.
 * Returns null if unparseable.
 */
function parseDialectASku(sku: string): { setCode: string; collector: string; finish: Finish } | null {
  // Strip leading game prefix (MTG-, SWU-, etc.)
  let s = sku.replace(/^[A-Z]{2,4}-/, '');
  const parts = s.split('-');
  if (parts.length < 3) return null;
  const setCode = parts[0];
  const collector = parts[1];
  const finishToken = parts[2]?.toUpperCase();
  let finish: Finish = 'unknown';
  if (finishToken === 'F') finish = 'foil';
  else if (finishToken === 'NF') finish = 'nonfoil';
  else if (finishToken === 'E') finish = 'etched';
  if (!setCode || !collector) return null;
  return { setCode, collector, finish };
}

/**
 * Parse Dialect B SKU: <SET>-<COL>-<LANG>-<FINISH>-<condIdx>
 * e.g. SOM-179-EN-NF-1
 */
function parseDialectBSku(sku: string): { setCode: string; collector: string; finish: Finish } | null {
  const parts = sku.split('-');
  if (parts.length < 4) return null;
  const setCode = parts[0];
  const collector = parts[1];
  // parts[2] = language (EN, JP, etc.)
  const finishToken = parts[3]?.toUpperCase();
  let finish: Finish = 'unknown';
  if (finishToken === 'FO') finish = 'foil';
  else if (finishToken === 'NF') finish = 'nonfoil';
  else if (finishToken === 'ET') finish = 'etched';
  if (!setCode || !collector) return null;
  return { setCode, collector, finish };
}

/**
 * Title regex for Dialect A: looks for (SETCODE-COLLECTOR) embedded in parens
 * e.g. "(SOA-190)" or "(SOM-179)"
 */
const TITLE_SET_COL_RE = /\(([A-Z0-9]{2,6})-([A-Za-z0-9★✦⋆]+)\)/;

export function computeMatchResult(variant: VariantInput): MatchResult {
  const { sku, title, option1, option2, dialect } = variant;
  const condInfo = parseConditionRank(option1 + (option2 ? ` ${option2}` : ''));

  // ---- Tier 0: SKU parsing ----
  let skuParsed: { setCode: string; collector: string; finish: Finish } | null = null;

  if (sku) {
    if (dialect === 'A') {
      skuParsed = parseDialectASku(sku);
    } else if (dialect === 'B') {
      skuParsed = parseDialectBSku(sku);
    } else {
      // Try both
      skuParsed = parseDialectBSku(sku) ?? parseDialectASku(sku);
    }
  }

  if (skuParsed && skuParsed.finish !== 'unknown') {
    const resolvedSet = resolveSetCode(skuParsed.setCode);
    const collNorm = normalizeCollector(skuParsed.collector);
    const key = buildMatchKey(resolvedSet, skuParsed.collector, skuParsed.finish as 'nonfoil' | 'foil' | 'etched');

    // Cross-check: does the title's finish word agree?
    const titleFinish = parseFinishFromTitle(title);
    let confidence: Confidence = 'exact';
    let warning: string | undefined;
    if (titleFinish !== 'unknown' && titleFinish !== skuParsed.finish) {
      confidence = 'probable'; // SKU wins, but flag it
      warning = `SKU finish (${skuParsed.finish}) disagrees with title (${titleFinish})`;
    }

    return {
      match_key: key,
      confidence,
      set_code_norm: normalizeSetCode(resolvedSet),
      collector_norm: collNorm,
      finish: skuParsed.finish,
      condition: condInfo.condition,
      condition_rank: condInfo.rank,
      warning,
    };
  }

  // If SKU parsed but finish was unknown, try to get finish from option/title
  if (skuParsed) {
    const finishFromOpt = parseFinishFromTitle(option1 + ' ' + (option2 ?? '') + ' ' + title);
    if (finishFromOpt !== 'unknown') {
      const resolvedSet = resolveSetCode(skuParsed.setCode);
      const key = buildMatchKey(resolvedSet, skuParsed.collector, finishFromOpt as 'nonfoil' | 'foil' | 'etched');
      return {
        match_key: key,
        confidence: 'probable', // collector OK but finish inferred from text
        set_code_norm: normalizeSetCode(resolvedSet),
        collector_norm: normalizeCollector(skuParsed.collector),
        finish: finishFromOpt,
        condition: condInfo.condition,
        condition_rank: condInfo.rank,
        warning: 'Finish inferred from title/option, not SKU',
      };
    }
  }

  // ---- Tier 1: Title regex for (SETCODE-COLLECTOR) ----
  const titleMatch = TITLE_SET_COL_RE.exec(title);
  if (titleMatch) {
    const setCode = titleMatch[1];
    const collector = titleMatch[2];
    const resolvedSet = resolveSetCode(setCode);
    const finish = parseFinishFromTitle(title + ' ' + option1);
    if (finish !== 'unknown') {
      return {
        match_key: buildMatchKey(resolvedSet, collector, finish as 'nonfoil' | 'foil' | 'etched'),
        confidence: 'probable',
        set_code_norm: normalizeSetCode(resolvedSet),
        collector_norm: normalizeCollector(collector),
        finish,
        condition: condInfo.condition,
        condition_rank: condInfo.rank,
        warning: 'Matched from title regex, not SKU',
      };
    }
  }

  // ---- Tier 2: Name + set-name match (Tier 2 — stored at ingest as 'weak') ----
  // Extract card name = text before first ( or [
  const nameMatch = title.match(/^([^(\[]+)/);
  const rawName = nameMatch ? nameMatch[1].trim() : title;

  // Extract set name from [...]
  const setNameMatch = title.match(/\[([^\]]+)\]/);
  const rawSetName = setNameMatch ? setNameMatch[1] : null;

  const finish = parseFinishFromTitle(title + ' ' + option1);
  let setCodeFromName: string | null = null;
  if (rawSetName) {
    setCodeFromName = resolveSetName(rawSetName);
  }

  if (rawName && finish !== 'unknown') {
    // We can build a "probable" key from name+set, but without collector number
    // we can't make a useful match_key — so we return weak/none for now.
    // The aggregator will surface these for manual review.
    return {
      match_key: null, // no collector number → can't build a reliable key
      confidence: 'weak',
      set_code_norm: setCodeFromName ?? null,
      collector_norm: null,
      finish,
      condition: condInfo.condition,
      condition_rank: condInfo.rank,
      warning: `No collector number found. Name: "${rawName}", Set: "${rawSetName ?? 'unknown'}"`,
    };
  }

  // ---- Tier 3: No match ----
  return {
    match_key: null,
    confidence: 'none',
    set_code_norm: null,
    collector_norm: null,
    finish: finish !== 'unknown' ? finish : 'unknown',
    condition: condInfo.condition,
    condition_rank: condInfo.rank,
  };
}
