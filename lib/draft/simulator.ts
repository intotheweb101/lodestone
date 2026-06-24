// Pure, client-safe draft state machine — no DB imports.

export interface SealedCard {
  scryfall_id: string;
  oracle_id: string;
  name: string;
  image_url: string | null;
  mana_cost: string | null;
  type_line: string | null;
  rarity: string;
  color_identity: string[];
  colors: string[];
  cmc: number | null;
  set_code: string;
}

export interface DraftState {
  picks: SealedCard[];
  currentPack: SealedCard[];
  remainingPacks: SealedCard[][];
  packNum: number;   // 1-based, 1–3
  pickNum: number;   // 1-based within current pack
  done: boolean;
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
