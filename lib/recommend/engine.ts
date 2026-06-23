/**
 * Deck recommendation engine — rule-based, using Scryfall fields.
 * Runs against the deck's oracle_ids and the Scryfall SQLite data.
 */

import { getDb } from '../db/connection';
import { getScryfallCardById, parseScryfallRow, ScryfallCard } from '../db/queries';
import type { Deck } from '../deck/model';
import { mainboardEntries } from '../deck/model';
import { isLand, isBasicLand, mentionsRamp, mentionsDraw, mentionsRemoval, mentionsBoardWipe } from './classify';

export interface Recommendation {
  type: 'add' | 'remove' | 'info';
  severity: 'error' | 'warning' | 'suggestion';
  title: string;
  detail: string;
  card_name?: string;   // for 'add' suggestions
  oracle_id?: string;
  reason?: string;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  stats: {
    land_count: number;
    ramp_count: number;
    draw_count: number;
    removal_count: number;
    wipes_count: number;
    avg_cmc: number;
    cmc_histogram: Record<string, number>;
  };
}

// Commander staples that should almost always be in an EDH deck
const COMMANDER_STAPLES: { name: string; oracle_id?: string; reason: string; colors: string[] }[] = [
  { name: 'Sol Ring', reason: 'Best mana rock in EDH', colors: [] },
  { name: 'Arcane Signet', reason: 'Essential on-color mana rock', colors: [] },
  { name: 'Command Tower', reason: 'Best land in EDH', colors: [] },
  { name: 'Swiftfoot Boots', reason: 'Cheap commander protection', colors: [] },
  { name: 'Lightning Greaves', reason: 'Free equip commander protection', colors: [] },
  { name: 'Swords to Plowshares', reason: 'Best white removal', colors: ['W'] },
  { name: 'Path to Exile', reason: 'Cheap exile removal', colors: ['W'] },
  { name: 'Cyclonic Rift', reason: 'Best blue sweeper', colors: ['U'] },
  { name: 'Counterspell', reason: 'Baseline counter', colors: ['U'] },
  { name: 'Demonic Tutor', reason: 'Best tutor in EDH', colors: ['B'] },
  { name: 'Vampiric Tutor', reason: 'Efficient tutor', colors: ['B'] },
  { name: 'Toxic Deluge', reason: 'Flexible black sweeper', colors: ['B'] },
  { name: 'Chaos Warp', reason: 'Red\'s best removal for any permanent', colors: ['R'] },
  { name: 'Cultivate', reason: 'Ramp and land fixing', colors: ['G'] },
  { name: 'Kodama\'s Reach', reason: 'Ramp and land fixing', colors: ['G'] },
  { name: 'Rampant Growth', reason: 'Cheap ramp', colors: ['G'] },
  { name: 'Beast Within', reason: 'Green\'s removal for any permanent', colors: ['G'] },
  { name: 'Smothering Tithe', reason: 'White ramp staple', colors: ['W'] },
  { name: 'Rhystic Study', reason: 'Powerful card draw', colors: ['U'] },
  { name: 'Sylvan Library', reason: 'Green card advantage', colors: ['G'] },
];


export async function getRecommendations(deck: Deck): Promise<RecommendationResult> {
  const recommendations: Recommendation[] = [];
  const db = getDb();

  // Hydrate mainboard cards only — sideboard/maybeboard don't count toward legality or stats
  const mainboard = mainboardEntries(deck);
  const cardRows = mainboard
    .map(e => e.scryfall_id ? getScryfallCardById(e.scryfall_id) : null)
    .filter((c): c is ScryfallCard => c !== null);

  // Fallback: look up by oracle_id
  const hydratedOracleIds = new Set(cardRows.map(c => c.oracle_id));
  for (const entry of mainboard) {
    if (!hydratedOracleIds.has(entry.oracle_id)) {
      const row = db.prepare('SELECT * FROM scryfall_cards WHERE oracle_id = ? LIMIT 1').get(entry.oracle_id) as Record<string, unknown> | undefined;
      if (row) {
        cardRows.push(parseScryfallRow(row));
      }
    }
  }

  const cardNames = new Set(cardRows.map(c => c.name.toLowerCase()));

  // ---- 1. Legality ----
  if (deck.format === 'commander') {
    for (const card of cardRows) {
      const legality = card.legalities?.commander;
      if (legality === 'banned') {
        recommendations.push({
          type: 'remove',
          severity: 'error',
          title: `${card.name} is BANNED in Commander`,
          detail: 'This card is on the Commander banned list.',
          card_name: card.name,
          oracle_id: card.oracle_id,
        });
      } else if (legality === 'not_legal') {
        recommendations.push({
          type: 'remove',
          severity: 'error',
          title: `${card.name} is not legal in Commander`,
          detail: 'This card cannot be played in Commander format.',
          card_name: card.name,
          oracle_id: card.oracle_id,
        });
      }
    }
  }

  // ---- 2. Deck size (Commander = 100) ----
  if (deck.format === 'commander') {
    const total = mainboard.reduce((s, e) => s + e.quantity, 0);
    if (total < 100) {
      recommendations.push({ type: 'info', severity: 'warning', title: `Deck is ${100 - total} cards short`, detail: `Commander requires exactly 100 cards; you have ${total}.` });
    } else if (total > 100) {
      recommendations.push({ type: 'info', severity: 'error', title: `Deck is ${total - 100} cards over`, detail: `Commander requires exactly 100 cards; you have ${total}.` });
    }
  }

  // ---- 3. Stats ----
  let land_count = 0, ramp_count = 0, draw_count = 0, removal_count = 0, wipes_count = 0;
  let total_cmc = 0, cmc_card_count = 0;
  const cmc_histogram: Record<string, number> = {};

  for (const card of cardRows) {
    const qty = mainboard.find(e => e.oracle_id === card.oracle_id)?.quantity ?? 1;
    if (isLand(card.type_line)) {
      land_count += qty;
      continue; // lands don't count for CMC curve
    }
    const cmc = card.cmc ?? 0;
    total_cmc += cmc * qty;
    cmc_card_count += qty;
    const bucket = cmc >= 7 ? '7+' : String(Math.floor(cmc));
    cmc_histogram[bucket] = (cmc_histogram[bucket] ?? 0) + qty;

    if (mentionsRamp(card.oracle_text)) ramp_count += qty;
    if (mentionsDraw(card.oracle_text)) draw_count += qty;
    if (mentionsBoardWipe(card.type_line, card.oracle_text)) wipes_count += qty;
    else if (mentionsRemoval(card.oracle_text)) removal_count += qty;
  }

  const avg_cmc = cmc_card_count > 0 ? total_cmc / cmc_card_count : 0;

  // ---- 4. Land count ----
  if (deck.format === 'commander') {
    if (land_count < 33) {
      recommendations.push({ type: 'info', severity: 'error', title: `Very low land count: ${land_count}`, detail: 'Commander decks typically run 36–38 lands. With fewer than 33 you risk frequent mana-flooding.' });
    } else if (land_count < 36) {
      recommendations.push({ type: 'info', severity: 'warning', title: `Low land count: ${land_count}`, detail: 'Most Commander decks run 36–38 lands. Consider adding lands if your curve is above 3.' });
    } else if (land_count > 40) {
      recommendations.push({ type: 'info', severity: 'suggestion', title: `High land count: ${land_count}`, detail: 'You may be able to cut a land for a spell if you have heavy ramp.' });
    }
  }

  // ---- 5. Ramp ----
  if (deck.format === 'commander' && ramp_count < 8) {
    recommendations.push({ type: 'info', severity: 'warning', title: `Low ramp: ${ramp_count} pieces`, detail: 'Commander decks typically want 8–12 ramp sources. Low ramp = slow starts.' });
  }

  // ---- 6. Draw ----
  if (deck.format === 'commander' && draw_count < 5) {
    recommendations.push({ type: 'info', severity: 'warning', title: `Low card draw: ${draw_count} sources`, detail: 'Aim for at least 8–10 card draw/advantage sources to avoid running out of gas.' });
  }

  // ---- 7. Removal ----
  if (deck.format === 'commander' && removal_count + wipes_count < 5) {
    recommendations.push({ type: 'info', severity: 'warning', title: `Low interaction: ${removal_count} removal + ${wipes_count} wipes`, detail: 'Most Commander decks want at least 5–8 pieces of removal/interaction to deal with threats.' });
  }

  // ---- 8. Mana curve ----
  const highCmcCount = (cmc_histogram['6'] ?? 0) + (cmc_histogram['7+'] ?? 0);
  if (highCmcCount > 8) {
    recommendations.push({ type: 'info', severity: 'suggestion', title: `Top-heavy curve: ${highCmcCount} cards at CMC 6+`, detail: `Average CMC: ${avg_cmc.toFixed(1)}. Consider replacing some high-cost cards with lower-CMC value pieces.` });
  }

  // ---- 9. Staple suggestions ----
  if (deck.format === 'commander') {
    // Get commander's color identity
    const commanderEntry = deck.entries.find(e => e.is_commander);
    const commanderCard = commanderEntry ? cardRows.find(c => c.oracle_id === commanderEntry.oracle_id) : null;
    const colorIdentity = commanderCard?.color_identity ?? [];

    for (const staple of COMMANDER_STAPLES) {
      // Skip if already in deck
      if (cardNames.has(staple.name.toLowerCase())) continue;
      // Skip if requires a color not in the deck's identity
      if (staple.colors.length > 0 && !staple.colors.some(c => colorIdentity.includes(c))) continue;

      recommendations.push({
        type: 'add',
        severity: 'suggestion',
        title: `Consider adding ${staple.name}`,
        detail: staple.reason,
        card_name: staple.name,
        reason: staple.reason,
      });
    }
  }

  return {
    recommendations,
    stats: {
      land_count,
      ramp_count,
      draw_count,
      removal_count,
      wipes_count,
      avg_cmc,
      cmc_histogram,
    },
  };
}
