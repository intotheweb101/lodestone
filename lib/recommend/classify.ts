import type { CardCategory } from '@/lib/deck/model';

export function isLand(typeLine: string | null): boolean {
  return (typeLine ?? '').toLowerCase().includes('land');
}

export function isBasicLand(typeLine: string | null, name: string): boolean {
  if (!isLand(typeLine)) return false;
  return /^(plains|island|swamp|mountain|forest|wastes)/i.test(name);
}

export function mentionsRamp(oracleText: string | null): boolean {
  if (!oracleText) return false;
  const lower = oracleText.toLowerCase();
  return (
    lower.includes('add {') ||
    (lower.includes('search your library for a') && lower.includes('land')) ||
    lower.includes('put a land') ||
    (lower.includes('mana') && (lower.includes('artifact') || lower.includes('creature')) && lower.includes('add'))
  );
}

export function mentionsDraw(oracleText: string | null): boolean {
  if (!oracleText) return false;
  const lower = oracleText.toLowerCase();
  return (
    (lower.includes('draw') && lower.includes('card')) ||
    (lower.includes('draws') && lower.includes('card'))
  );
}

export function mentionsRemoval(oracleText: string | null): boolean {
  if (!oracleText) return false;
  const lower = oracleText.toLowerCase();
  return (
    lower.includes('destroy target') ||
    lower.includes('exile target') ||
    lower.includes('counter target') ||
    (lower.includes('return target') && lower.includes('hand')) ||
    /deals? \d+ damage to target/i.test(oracleText)
  );
}

export function mentionsBoardWipe(typeLine: string | null, oracleText: string | null): boolean {
  if (!oracleText) return false;
  const lower = oracleText.toLowerCase();
  return (
    lower.includes('destroy all') ||
    lower.includes('exile all') ||
    lower.includes('each player sacrifices') ||
    (lower.includes('deals') && lower.includes('damage to each'))
  );
}

/** Auto-classify a card into one of the broad grouping categories. */
export function classifyCard(opts: {
  type_line: string | null;
  oracle_text: string | null;
  card_name: string;
}): CardCategory {
  const { type_line, oracle_text, card_name } = opts;
  if (isLand(type_line)) return 'Lands';
  if (mentionsBoardWipe(type_line, oracle_text)) return 'Board Wipes';
  if (mentionsRemoval(oracle_text)) return 'Removal';
  if (mentionsRamp(oracle_text)) return 'Ramp';
  if (mentionsDraw(oracle_text)) return 'Card Draw';
  const tl = (type_line ?? '').toLowerCase();
  if (tl.includes('artifact')) return 'Artifacts';
  if (tl.includes('enchantment')) return 'Enchantments';
  if (tl.includes('creature')) return 'Creatures';
  if (tl.includes('instant')) return 'Instants';
  if (tl.includes('sorcery')) return 'Sorceries';
  void card_name;
  return 'Other';
}
