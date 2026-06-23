/**
 * Access-control helpers: canView / canEdit per deck.
 */

import type { User } from './index';

export interface AccessibleDeck {
  user_id?: string | null;
  visibility?: string;  // 'private' | 'unlisted' | 'public'
}

/**
 * A deck is viewable when:
 * - The viewer is the owner, OR
 * - The deck is 'public' or 'unlisted' (accessible via link)
 */
export function canView(deck: AccessibleDeck, viewer: User | null): boolean {
  if (!deck.user_id || deck.user_id === viewer?.id) return true;
  const vis = deck.visibility ?? 'private';
  if (vis === 'public' || vis === 'unlisted') return true;
  return false;
}

/**
 * A deck is editable only by its owner.
 * The 'local' sentinel user owns all decks that have user_id='local'.
 */
export function canEdit(deck: AccessibleDeck, editor: User | null): boolean {
  if (!editor) return false;
  if (!deck.user_id) return true;   // legacy deck with no owner — allow
  return deck.user_id === editor.id;
}

/** Throws a 403 if the viewer cannot edit the deck. */
export function assertCanEdit(deck: AccessibleDeck, editor: User | null): void {
  if (!canEdit(deck, editor)) {
    throw Object.assign(new Error('Not authorized to edit this deck'), { status: 403 });
  }
}
