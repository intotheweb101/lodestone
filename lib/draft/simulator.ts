import { generateSealedPool } from '../sealed/packs';
import type { SealedCard } from '../sealed/packs';

export type { SealedCard };

export interface DraftState {
  picks: SealedCard[];
  currentPack: SealedCard[];
  remainingPacks: SealedCard[][];
  packNum: number;   // 1-based, 1–3
  pickNum: number;   // 1-based within current pack
  done: boolean;
}

/**
 * Generate 3 draft packs for a set.
 * Reuses generateSealedPool(setCode, 3) then splits into 3 groups of ~15 cards each.
 * Returns an empty array of arrays if the set has insufficient cards.
 */
export function generateDraftPacks(setCode: string): SealedCard[][] {
  const pool = generateSealedPool(setCode, 3);
  if (!pool || pool.cards.length === 0) return [[], [], []];

  const cards = pool.cards;
  const perPack = Math.floor(cards.length / 3);
  return [
    cards.slice(0, perPack),
    cards.slice(perPack, perPack * 2),
    cards.slice(perPack * 2),
  ];
}

export function initDraft(packs: SealedCard[][]): DraftState {
  const [first, ...rest] = packs;
  return {
    picks: [],
    currentPack: first ?? [],
    remainingPacks: rest,
    packNum: 1,
    pickNum: 1,
    done: false,
  };
}

export function pickCard(state: DraftState, card: SealedCard): DraftState {
  const newCurrentPack = state.currentPack.filter(c => c.scryfall_id !== card.scryfall_id);
  const newPicks = [...state.picks, card];

  if (newCurrentPack.length > 0) {
    return {
      ...state,
      picks: newPicks,
      currentPack: newCurrentPack,
      pickNum: state.pickNum + 1,
    };
  }

  // Pack exhausted — move to next pack
  const [nextPack, ...remaining] = state.remainingPacks;
  if (!nextPack || nextPack.length === 0) {
    return { ...state, picks: newPicks, currentPack: [], remainingPacks: [], done: true };
  }

  return {
    picks: newPicks,
    currentPack: nextPack,
    remainingPacks: remaining,
    packNum: state.packNum + 1,
    pickNum: 1,
    done: false,
  };
}
