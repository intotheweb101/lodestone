/**
 * Deck archetype classifier — pure heuristic, no DB access.
 * Scores a list of cards across nine archetypes using oracle text patterns.
 */

export interface ArchetypeScore {
  archetype: string;
  score: number;
  reasons: string[];
}

export interface ArchetypeResult {
  primary: string;
  scores: ArchetypeScore[];
}

export interface CardInput {
  oracle_text: string | null;
  type_line: string | null;
  quantity: number;
  mana_cost: string | null;
  is_commander?: boolean;
}

// ─── CMC helper ───────────────────────────────────────────────────────────────

function parseCmc(manaCost: string | null): number {
  if (!manaCost) return 0;
  let total = 0;
  // Generic mana: {5}, {10}, etc.
  for (const m of manaCost.matchAll(/\{(\d+)\}/g)) total += parseInt(m[1], 10);
  // Each single-symbol pip counts as 1
  total += (manaCost.match(/\{[WUBRG2XYZ]\}/g) ?? []).length;
  // Hybrid: {W/U} counts as 1
  total += (manaCost.match(/\{[WUBRG]\/[WUBRG2P]\}/g) ?? []).length;
  return total;
}

function isLand(typeLine: string | null): boolean {
  return (typeLine ?? '').toLowerCase().includes('land');
}

function isCreature(typeLine: string | null): boolean {
  return (typeLine ?? '').toLowerCase().includes('creature');
}

function lc(text: string | null): string {
  return (text ?? '').toLowerCase();
}

// ─── Per-card signals ─────────────────────────────────────────────────────────

interface CardSignals {
  cmc: number;
  isLand: boolean;
  isCreature: boolean;
  hasHaste: boolean;
  hasFlash: boolean;
  isLowCurve: boolean;   // CMC <= 2, non-land
  isMidCurve: boolean;   // CMC 2-4
  isCounterspell: boolean;
  isBoardWipe: boolean;
  isTutor: boolean;
  isRamp: boolean;
  isDrawEngine: boolean;
  isDamageSpell: boolean;
  isToken: boolean;
  isReanimator: boolean;
  isStax: boolean;
  isBounce: boolean;
  isCombo: boolean;
}

function getSignals(card: CardInput): CardSignals {
  const o = lc(card.oracle_text);
  const t = lc(card.type_line);
  const cmc = parseCmc(card.mana_cost);
  const creature = isCreature(card.type_line);
  const land = isLand(card.type_line);

  return {
    cmc,
    isLand: land,
    isCreature: creature,
    hasHaste: o.includes('haste'),
    hasFlash: o.includes('flash'),
    isLowCurve: !land && cmc <= 2,
    isMidCurve: !land && cmc >= 2 && cmc <= 4,
    isCounterspell:
      o.includes('counter target spell') ||
      o.includes('counter target instant') ||
      o.includes('counter target sorcery') ||
      (o.includes('counter') && o.includes('unless')),
    isBoardWipe:
      o.includes('destroy all') ||
      o.includes('exile all creatures') ||
      o.includes('each creature gets -') ||
      (o.includes('deals') && o.includes('damage to each creature')),
    isTutor:
      (o.includes('search your library') && (o.includes('put it into your hand') || o.includes('put that card'))) ||
      (o.includes('search your library for a card') && o.includes('hand')),
    isRamp:
      (o.includes('search your library for a') && o.includes('land') && o.includes('put it onto the battlefield')) ||
      (o.includes('add {') && (t.includes('artifact') || t.includes('creature') || t.includes('enchantment') || t.includes('land'))) ||
      o.includes('put a land card from your hand onto the battlefield') ||
      o.includes('untap up to'),
    isDrawEngine:
      (o.includes('draw') && o.includes('cards') && (o.includes('whenever') || o.includes('at the beginning'))) ||
      o.includes('draw two cards') ||
      o.includes('draw three cards') ||
      (o.includes('draw a card') && o.includes('whenever')),
    isDamageSpell:
      /deals? \d+ damage/.test(o) && !o.includes('each creature'),
    isToken:
      /creates? \d+ [\w\/]+ creature token/i.test(card.oracle_text ?? '') ||
      o.includes('create a token') ||
      o.includes('populate') ||
      (o.includes('token') && o.includes('create')),
    isReanimator:
      (o.includes('return') && o.includes('graveyard') && o.includes('battlefield')) ||
      o.includes('reanimate') ||
      (o.includes('put') && o.includes('graveyard') && o.includes('onto the battlefield')) ||
      (o.includes('discard') && o.includes('then draw')),
    isStax:
      o.includes("opponents can't") ||
      o.includes("players can't") ||
      (o.includes('each player') && o.includes('sacrifices')) ||
      o.includes('skip your untap') ||
      o.includes("can't cast spells") ||
      o.includes('pay {2} for each') ||
      o.includes("can't be cast"),
    isBounce:
      (o.includes('return target') && o.includes("owner's hand")) ||
      (o.includes('return') && o.includes('hand') && o.includes('target')),
    isCombo:
      o.includes('infinite') ||
      (o.includes('whenever you draw a card') && o.includes('{0}')) ||
      o.includes('storm') ||
      o.includes('doomsday') ||
      (o.includes('whenever') && o.includes('loses life') && o.includes('gains life')),
  };
}

// ─── Main classifier ──────────────────────────────────────────────────────────

export function classifyArchetype(cards: CardInput[]): ArchetypeResult {
  const nonLand = cards.filter(c => !isLand(c.type_line));
  const totalNonLand = nonLand.reduce((s, c) => s + c.quantity, 0);

  // Aggregated counts (quantity-weighted)
  let lowCurveCreatures = 0;
  let hasteCount = 0;
  let flashCount = 0;
  let counterspellCount = 0;
  let boardWipeCount = 0;
  let tutorCount = 0;
  let rampCount = 0;
  let drawEngineCount = 0;
  let damageCount = 0;
  let tokenCount = 0;
  let reanimatorCount = 0;
  let staxCount = 0;
  let bounceCount = 0;
  let comboCount = 0;
  let totalCreatures = 0;
  let midCurveCount = 0;
  let totalCmc = 0;
  let landCount = 0;

  for (const card of cards) {
    const s = getSignals(card);
    const q = card.quantity;
    if (s.isLand) { landCount += q; continue; }
    totalCmc += s.cmc * q;
    if (s.isCreature) totalCreatures += q;
    if (s.isLowCurve && s.isCreature) lowCurveCreatures += q;
    if (s.hasHaste) hasteCount += q;
    if (s.hasFlash) flashCount += q;
    if (s.isMidCurve) midCurveCount += q;
    if (s.isCounterspell) counterspellCount += q;
    if (s.isBoardWipe) boardWipeCount += q;
    if (s.isTutor) tutorCount += q;
    if (s.isRamp) rampCount += q;
    if (s.isDrawEngine) drawEngineCount += q;
    if (s.isDamageSpell) damageCount += q;
    if (s.isToken) tokenCount += q;
    if (s.isReanimator) reanimatorCount += q;
    if (s.isStax) staxCount += q;
    if (s.isBounce) bounceCount += q;
    if (s.isCombo) comboCount += q;
  }

  const avgCmc = totalNonLand > 0 ? totalCmc / totalNonLand : 0;
  const creatureDensity = totalNonLand > 0 ? totalCreatures / totalNonLand : 0;

  const results: ArchetypeScore[] = [];

  // ── Aggro ──────────────────────────────────────────────────────────────────
  {
    let score = 0;
    const reasons: string[] = [];
    if (lowCurveCreatures >= 15) { score += 30; reasons.push(`${lowCurveCreatures} creatures CMC≤2`); }
    else if (lowCurveCreatures >= 8) { score += 15; reasons.push(`${lowCurveCreatures} creatures CMC≤2`); }
    if (hasteCount >= 3) { score += 10; reasons.push(`${hasteCount} haste sources`); }
    if (damageCount >= 4) { score += 10; reasons.push(`${damageCount} direct damage spells`); }
    if (avgCmc < 2.5 && totalNonLand > 10) { score += 10; reasons.push(`avg CMC ${avgCmc.toFixed(1)}`); }
    if (score > 0) results.push({ archetype: 'Aggro', score, reasons });
  }

  // ── Control ────────────────────────────────────────────────────────────────
  {
    let score = 0;
    const reasons: string[] = [];
    if (counterspellCount >= 4) { score += 25; reasons.push(`${counterspellCount} counterspells`); }
    else if (counterspellCount >= 2) { score += 12; reasons.push(`${counterspellCount} counterspells`); }
    if (boardWipeCount >= 3) { score += 20; reasons.push(`${boardWipeCount} board wipes`); }
    else if (boardWipeCount >= 1) { score += 8; reasons.push(`${boardWipeCount} board wipe${boardWipeCount > 1 ? 's' : ''}`); }
    if (creatureDensity < 0.25) { score += 10; reasons.push(`low creature density (${Math.round(creatureDensity * 100)}%)`); }
    if (avgCmc >= 3.5) { score += 8; reasons.push(`high avg CMC ${avgCmc.toFixed(1)}`); }
    if (score > 0) results.push({ archetype: 'Control', score, reasons });
  }

  // ── Combo ──────────────────────────────────────────────────────────────────
  {
    let score = 0;
    const reasons: string[] = [];
    if (tutorCount >= 6) { score += 25; reasons.push(`${tutorCount} tutors`); }
    else if (tutorCount >= 3) { score += 12; reasons.push(`${tutorCount} tutors`); }
    if (drawEngineCount >= 5) { score += 15; reasons.push(`${drawEngineCount} draw engines`); }
    if (comboCount >= 2) { score += 20; reasons.push(`${comboCount} combo pieces`); }
    if (score > 0) results.push({ archetype: 'Combo', score, reasons });
  }

  // ── Midrange ───────────────────────────────────────────────────────────────
  {
    let score = 0;
    const reasons: string[] = [];
    if (midCurveCount >= 20) { score += 20; reasons.push(`${midCurveCount} CMC 2–4 cards`); }
    else if (midCurveCount >= 10) { score += 10; reasons.push(`${midCurveCount} CMC 2–4 cards`); }
    if (creatureDensity >= 0.3 && creatureDensity <= 0.6) { score += 10; reasons.push(`balanced creature ratio`); }
    if (avgCmc >= 2.5 && avgCmc <= 3.5) { score += 10; reasons.push(`avg CMC ${avgCmc.toFixed(1)}`); }
    // Midrange is the fallback; boost if no other archetype dominates
    if (score > 0) results.push({ archetype: 'Midrange', score, reasons });
  }

  // ── Stax ───────────────────────────────────────────────────────────────────
  {
    let score = 0;
    const reasons: string[] = [];
    if (staxCount >= 5) { score += 40; reasons.push(`${staxCount} prison/tax effects`); }
    else if (staxCount >= 2) { score += 20; reasons.push(`${staxCount} prison/tax effects`); }
    if (score > 0) results.push({ archetype: 'Stax', score, reasons });
  }

  // ── Tokens ─────────────────────────────────────────────────────────────────
  {
    let score = 0;
    const reasons: string[] = [];
    if (tokenCount >= 8) { score += 35; reasons.push(`${tokenCount} token generators`); }
    else if (tokenCount >= 4) { score += 18; reasons.push(`${tokenCount} token generators`); }
    if (score > 0) results.push({ archetype: 'Tokens', score, reasons });
  }

  // ── Reanimator ─────────────────────────────────────────────────────────────
  {
    let score = 0;
    const reasons: string[] = [];
    if (reanimatorCount >= 5) { score += 35; reasons.push(`${reanimatorCount} reanimation effects`); }
    else if (reanimatorCount >= 2) { score += 18; reasons.push(`${reanimatorCount} reanimation effects`); }
    if (score > 0) results.push({ archetype: 'Reanimator', score, reasons });
  }

  // ── Ramp ───────────────────────────────────────────────────────────────────
  {
    let score = 0;
    const reasons: string[] = [];
    if (rampCount >= 10) { score += 30; reasons.push(`${rampCount} ramp pieces`); }
    else if (rampCount >= 5) { score += 15; reasons.push(`${rampCount} ramp pieces`); }
    const landRatio = totalNonLand > 0 ? landCount / (landCount + totalNonLand) : 0;
    if (landRatio >= 0.4) { score += 10; reasons.push(`${landCount} lands (${Math.round(landRatio * 100)}%)`); }
    if (avgCmc >= 4) { score += 10; reasons.push(`high avg CMC ${avgCmc.toFixed(1)} — big spells`); }
    if (score > 0) results.push({ archetype: 'Ramp', score, reasons });
  }

  // ── Tempo ──────────────────────────────────────────────────────────────────
  {
    let score = 0;
    const reasons: string[] = [];
    if (bounceCount >= 4) { score += 20; reasons.push(`${bounceCount} bounce effects`); }
    else if (bounceCount >= 2) { score += 10; reasons.push(`${bounceCount} bounce effects`); }
    if (flashCount >= 4) { score += 15; reasons.push(`${flashCount} flash sources`); }
    if (counterspellCount >= 2 && avgCmc < 3) { score += 10; reasons.push(`${counterspellCount} counterspells + low curve`); }
    if (score > 0) results.push({ archetype: 'Tempo', score, reasons });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // If nothing matched, default to Midrange
  if (results.length === 0) {
    results.push({ archetype: 'Midrange', score: 1, reasons: ['balanced deck profile'] });
  }

  return { primary: results[0].archetype, scores: results };
}

// ─── Color map ────────────────────────────────────────────────────────────────

const ARCHETYPE_COLORS: Record<string, string> = {
  Aggro:      '#e05b3c',
  Control:    '#4a90d9',
  Combo:      '#9b8fba',
  Midrange:   '#54c08a',
  Stax:       '#888888',
  Tokens:     '#e8b14a',
  Reanimator: '#7b6bd6',
  Ramp:       '#4caf7a',
  Tempo:      '#48c8c8',
};

export function getArchetypeColor(archetype: string): string {
  return ARCHETYPE_COLORS[archetype] ?? '#a0b0b4';
}
