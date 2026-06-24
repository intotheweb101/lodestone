'use server';
import { parseArenaList } from '@/lib/import/deck-sources';
import { estimateBracket } from '@/lib/commander-spellbook/client';

export async function actionEstimateBracket(text: string) {
  const { cards } = parseArenaList(text);
  const commanders = cards.filter(c => c.is_commander).map(c => c.name);
  const main = cards.filter(c => !c.is_commander).map(c => c.name);
  if (main.length === 0 && commanders.length === 0) return null;
  return estimateBracket(main, commanders);
}
