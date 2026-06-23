/**
 * Get all treatment/finish options for a card by oracle_id.
 * Returns structured printing options the UI presents to the user.
 */

import { getScryfallCardsByOracleId, ScryfallCard } from '../db/queries';

export type TreatmentType = 'normal' | 'borderless' | 'extended-art' | 'showcase' | 'full-art' | 'retro' | 'other';

export interface PrintingOption {
  scryfall_id: string;
  oracle_id: string;
  name: string;
  set_code: string;
  set_name?: string;
  collector_number: string;
  treatment: TreatmentType;
  finishes: string[];
  rarity: string | null;
  image_url: string | null;
  prices_usd: { nonfoil?: string | null; foil?: string | null; etched?: string | null };
  /** Human-readable label e.g. "Commander 2021 #019 – Borderless Foil" */
  label: string;
}

function detectTreatment(card: ScryfallCard): TreatmentType {
  if (card.full_art) return 'full-art';
  if (card.border_color === 'borderless') return 'borderless';
  if (card.frame_effects.includes('extendedart')) return 'extended-art';
  if (card.frame_effects.includes('showcase')) return 'showcase';
  if (card.frame_effects.includes('retro') || card.frame_effects.includes('inverted')) return 'retro';
  // Check promo_types (not stored in ScryfallCard directly — use scryfall_id lookup if needed)
  return 'normal';
}

function getImageUrl(card: ScryfallCard): string | null {
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.image_uris?.large) return card.image_uris.large;
  if (card.image_uris?.small) return card.image_uris.small;
  // Card face (transform/MDFC)
  if (card.card_faces && Array.isArray(card.card_faces)) {
    const face = card.card_faces[0] as Record<string, unknown>;
    const uris = face?.image_uris as Record<string, string> | undefined;
    return uris?.normal ?? uris?.large ?? null;
  }
  return null;
}

function buildLabel(card: ScryfallCard, treatment: TreatmentType): string {
  const parts: string[] = [];
  parts.push(card.set_code.toUpperCase());
  parts.push(`#${card.collector_number}`);
  if (treatment !== 'normal') {
    const treatmentLabels: Record<TreatmentType, string> = {
      borderless: 'Borderless',
      'extended-art': 'Extended Art',
      showcase: 'Showcase',
      'full-art': 'Full Art',
      retro: 'Retro Frame',
      other: 'Special',
      normal: '',
    };
    parts.push(`– ${treatmentLabels[treatment]}`);
  }
  if (card.rarity) parts.push(`(${card.rarity[0].toUpperCase()})`);
  return parts.join(' ');
}

export function getPrintingOptions(oracleId: string): PrintingOption[] {
  const cards = getScryfallCardsByOracleId(oracleId);

  return cards.map(card => {
    const treatment = detectTreatment(card);
    return {
      scryfall_id: card.scryfall_id,
      oracle_id: card.oracle_id,
      name: card.name,
      set_code: card.set_code,
      collector_number: card.collector_number,
      treatment,
      finishes: card.finishes,
      rarity: card.rarity,
      image_url: getImageUrl(card),
      prices_usd: {
        nonfoil: card.prices?.usd ?? null,
        foil: card.prices?.usd_foil ?? null,
        etched: card.prices?.usd_etched ?? null,
      },
      label: buildLabel(card, treatment),
    };
  });
}

/** Group printing options by treatment type for the picker UI */
export function groupPrintingsByTreatment(options: PrintingOption[]): Record<TreatmentType, PrintingOption[]> {
  const groups: Record<TreatmentType, PrintingOption[]> = {
    normal: [],
    borderless: [],
    'extended-art': [],
    showcase: [],
    'full-art': [],
    retro: [],
    other: [],
  };
  for (const opt of options) {
    groups[opt.treatment].push(opt);
  }
  return groups;
}
