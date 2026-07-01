'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { runMigrations } from '@/lib/db/migrations';
import {
  createDeck, getDeck, addOrUpdateEntry, removeEntry, cloneDeck,
  updateDeckMeta, deleteDeck, listDecks, listPublicDecks, setDeckFolder,
  toggleLike, addComment, deleteComment, editComment, getComment,
  createFolder, deleteFolder, getDeckBySlug, getFolders,
  recomputeDeckColorIdentity, setDeckTags, setEntryCategory, setCommanderRole,
} from '@/lib/deck/store';
import type { Deck, DeckEntry, DeckFormat } from '@/lib/deck/model';
import { parseDecklist, mainboardEntries } from '@/lib/deck/model';
import { namedCard } from '@/lib/scryfall/client';
import { getDb } from '@/lib/db/connection';
import { buildMatchKey } from '@/lib/match/normalize';
import { resolveActingUser, requireUser } from '@/lib/auth/session';
import { assertCanEdit } from '@/lib/auth/access';
import { updateUser, updateUserEmail, changeUserPassword, deleteUser } from '@/lib/auth/index';
import { generatePublicSlug } from '@/lib/deck/slug';
import { getScryfallCardById, getScryfallCardsByOracleId } from '@/lib/db/queries';
import { classifyCard } from '@/lib/recommend/classify';
import { toggleFollow, createNotification, getNotifications, getUnreadCount, markAllRead, markRead, reportContent } from '@/lib/social/store';
import type { NotificationType } from '@/lib/social/store';
import { snapshotDeck, listVersions, restoreVersion } from '@/lib/deck/versions';
import { listPackages, getPackageEntries, createPackage, addEntryToPackage, removeEntryFromPackage, updatePackageMeta, deletePackage } from '@/lib/packages/store';
import { listAlerts, createAlert, deleteAlert } from '@/lib/pricing/alerts';

let migrated = false;
function ensureMigrated() {
  if (!migrated) { runMigrations(); migrated = true; }
}

// ---- Deck CRUD ----

export async function actionCreateDeck(name: string, format: DeckFormat = 'commander'): Promise<{ id: string }> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deck = createDeck(name, format, null, user.id);
  revalidatePath('/decks');
  return { id: deck.id };
}

export async function actionDeleteDeck(deckId: string): Promise<void> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deck = getDeck(deckId);
  if (deck) assertCanEdit(deck, user);
  deleteDeck(deckId);
  revalidatePath('/decks');
  redirect('/decks');
}

export async function actionUpdateDeckMeta(deckId: string, updates: Partial<Pick<Deck, 'name' | 'format' | 'commander' | 'custom_value' | 'description'>>): Promise<void> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deck = getDeck(deckId);
  if (deck) assertCanEdit(deck, user);
  updateDeckMeta(deckId, updates);
  revalidatePath(`/decks/${deckId}`);
}

export async function actionSetDeckSpend(deckId: string, amount: number | null): Promise<void> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deck = getDeck(deckId);
  if (deck) assertCanEdit(deck, user);
  updateDeckMeta(deckId, { custom_value: amount });
  revalidatePath(`/decks/${deckId}`);
}

export async function actionListDecks() {
  ensureMigrated();
  const user = await resolveActingUser();
  // Local sentinel sees all decks; real users see only their own
  return user.id === 'local' ? listDecks() : listDecks(user.id);
}

export async function actionListPublicDecks(limit = 8) {
  ensureMigrated();
  return listPublicDecks(limit);
}

export async function actionSetDeckFolder(deckId: string, folderId: string | null): Promise<void> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deck = getDeck(deckId);
  if (deck) assertCanEdit(deck, user);
  setDeckFolder(deckId, folderId);
  revalidatePath('/decks');
}

/** Set deck visibility and mint/clear a public slug. */
export async function actionSetDeckVisibility(deckId: string, visibility: Deck['visibility']): Promise<{ public_slug: string | null }> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deck = getDeck(deckId);
  if (!deck) throw new Error('Deck not found');
  assertCanEdit(deck, user);

  let slug: string | null = deck.public_slug ?? null;
  if (visibility === 'public' || visibility === 'unlisted') {
    if (!slug) slug = generatePublicSlug();
  } else {
    slug = null;  // private — revoke the slug
  }
  updateDeckMeta(deckId, { visibility, public_slug: slug });
  revalidatePath(`/decks/${deckId}`);
  if (slug) revalidatePath(`/d/${slug}`);
  return { public_slug: slug };
}

// ─── Social actions ───────────────────────────────────────────────────────────

/** Toggle a like on a public/unlisted deck. Requires a real (non-local) account. */
export async function actionToggleLike(deckId: string): Promise<{ liked: boolean }> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required to like decks');
  const result = toggleLike(user.id, deckId);
  if (result.liked) {
    const deck = getDeck(deckId);
    if (deck?.user_id) createNotification({ recipientId: deck.user_id, actorId: user.id, type: 'like', deckId });
  }
  revalidatePath(`/d`);
  return result;
}

/** Add a comment to a deck. Requires a real account. */
export async function actionAddComment(deckId: string, body: string, parentId?: string): Promise<{ id: string }> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required to comment');
  if (!body.trim()) throw new Error('Comment cannot be empty');
  const id = randomUUID();
  addComment({ id, deckId, userId: user.id, body, parentId });
  const deck = getDeck(deckId);
  // Notify deck owner of new comment
  if (deck?.user_id) createNotification({ recipientId: deck.user_id, actorId: user.id, type: 'comment', deckId, commentId: id });
  if (deck?.public_slug) revalidatePath(`/d/${deck.public_slug}`);
  revalidatePath(`/decks/${deckId}`);
  return { id };
}

/** Delete a deck comment. Allowed for: comment author, deck owner, or admin. */
export async function actionDeleteComment(commentId: string): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  const comment = getComment(commentId);
  if (!comment) return; // already gone
  const deck = getDeck(comment.deck_id);
  const isAuthor = comment.user_id === user.id;
  const isDeckOwner = deck?.user_id === user.id;
  const isAdmin = user.role === 'admin';
  if (!isAuthor && !isDeckOwner && !isAdmin) throw new Error('Not authorized to delete this comment');
  deleteComment(commentId);
  if (deck?.public_slug) revalidatePath(`/d/${deck.public_slug}`);
  revalidatePath(`/decks/${comment.deck_id}`);
}

/** Delete a card comment. Allowed for: comment author or admin. */
export async function actionDeleteCardComment(commentId: string): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  const comment = getCardComment(commentId);
  if (!comment) return;
  if (comment.user_id !== user.id && user.role !== 'admin') throw new Error('Not authorized');
  deleteCardComment(commentId);
}

/** Report a piece of content (deck comment, card comment, or deck). */
export async function actionReportContent(opts: {
  targetType: 'deck_comment' | 'card_comment' | 'deck';
  targetId: string;
  reason: string;
}): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required to report content');
  if (!opts.reason.trim()) throw new Error('Reason is required');
  reportContent({ reporterId: user.id, ...opts });
}

/** Create a folder. Requires a real account. */
export async function actionCreateFolder(name: string): Promise<{ id: string }> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required to create folders');
  const id = randomUUID();
  createFolder(id, user.id, name);
  revalidatePath('/decks');
  return { id };
}

/** Update the current user's profile name, username, and bio. */
export async function actionUpdateProfile(name: string, bio: string, username?: string): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  if (!name.trim()) throw new Error('Name required');
  const slug = username?.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
  if (slug !== undefined && slug.length < 2) throw new Error('Username must be at least 2 characters (letters, numbers, underscores).');
  const db = getDb();
  if (slug && slug !== user.username) {
    const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(slug, user.id);
    if (taken) throw new Error('That username is already taken.');
  }
  updateUser(user.id, { name: name.trim(), bio: bio.trim() || null, ...(slug ? { username: slug } : {}) });
  revalidatePath(`/u/${slug ?? user.username}`);
}

export async function actionUpdateEmail(email: string): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  const clean = email.toLowerCase().trim();
  if (!clean.includes('@')) throw new Error('Enter a valid email address.');
  updateUserEmail(user.id, clean);
  revalidatePath('/account');
}

export async function actionChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  await changeUserPassword(user.id, currentPassword, newPassword);
}

export async function actionDeleteAccount(): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  // Clear session cookie before deleting so the browser doesn't hold a dead token
  const { cookies } = await import('next/headers');
  (await cookies()).set('session', '', { maxAge: 0, path: '/' });
  deleteUser(user.id);
  redirect('/');
}

/** List folders for the current user. */
export async function actionListFolders() {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') return [];
  return getFolders(user.id);
}

/** Delete a folder (owner only). */
export async function actionDeleteFolder(folderId: string): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  deleteFolder(folderId, user.id);
  revalidatePath('/decks');
}

// ---- Card search + add ----

export async function actionSearchCard(query: string) {
  const db = getDb();
  const norm = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  const rows = db.prepare(
    'SELECT scryfall_id, oracle_id, name, set_code, collector_number, type_line, mana_cost, image_uris_json, color_identity_json FROM scryfall_cards WHERE name_norm LIKE ? GROUP BY oracle_id ORDER BY name LIMIT 20'
  ).all(`%${norm}%`) as Record<string, unknown>[];

  return rows.map(r => ({
    scryfall_id: r.scryfall_id,
    oracle_id: r.oracle_id,
    name: r.name,
    set_code: r.set_code,
    collector_number: r.collector_number,
    type_line: r.type_line,
    mana_cost: r.mana_cost,
    image_url: r.image_uris_json ? (JSON.parse(r.image_uris_json as string) as Record<string, string>).normal ?? null : null,
    color_identity: JSON.parse(r.color_identity_json as string ?? '[]'),
  }));
}

export async function actionAddCard(
  deckId: string,
  entry: {
    oracle_id: string;
    scryfall_id: string | null;
    card_name: string;
    quantity?: number;
    is_commander?: boolean;
    treatment?: DeckEntry['treatment'];
    finish?: DeckEntry['finish'];
    condition_floor?: DeckEntry['condition_floor'];
    board?: DeckEntry['board'];
  }
): Promise<void> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deck = getDeck(deckId);
  if (deck) assertCanEdit(deck, user);
  const sc = entry.scryfall_id
    ? getScryfallCardById(entry.scryfall_id)
    : getScryfallCardsByOracleId(entry.oracle_id)[0] ?? null;
  const autoCategory = sc ? classifyCard({ type_line: sc.type_line, oracle_text: sc.oracle_text, card_name: sc.name }) : null;
  addOrUpdateEntry(deckId, {
    oracle_id: entry.oracle_id,
    scryfall_id: entry.scryfall_id ?? null,
    card_name: entry.card_name,
    quantity: entry.quantity ?? 1,
    is_commander: entry.is_commander ?? false,
    treatment: entry.treatment ?? 'normal',
    finish: entry.finish ?? 'nonfoil',
    condition_floor: entry.condition_floor ?? 'lp',
    board: entry.board ?? 'main',
    category: autoCategory,
  });
  recomputeDeckColorIdentity(deckId);
  revalidatePath(`/decks/${deckId}`);
}

export async function actionSetCommander(deckId: string, oracleId: string): Promise<void> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deckCheck = getDeck(deckId);
  if (deckCheck) assertCanEdit(deckCheck, user);
  const db = getDb();
  const deck = getDeck(deckId);
  if (!deck) return;
  db.transaction(() => {
    // Clear all existing command-zone roles (companions keep their role)
    db.prepare("UPDATE deck_entries SET is_commander = 0, commander_role = NULL WHERE deck_id = ? AND (commander_role IS NULL OR commander_role != 'companion')").run(deckId);
    // Set new commander
    db.prepare("UPDATE deck_entries SET is_commander = 1, commander_role = 'commander' WHERE deck_id = ? AND oracle_id = ?").run(deckId, oracleId);
    // Update deck.commander name
    const entry = deck.entries.find(e => e.oracle_id === oracleId);
    if (entry) db.prepare("UPDATE decks SET commander = ?, updated_at = datetime('now') WHERE id = ?").run(entry.card_name, deckId);
  })();
  revalidatePath(`/decks/${deckId}`);
}

export async function actionSetCommanderRole2(deckId: string, oracleId: string, role: 'commander' | 'partner' | 'background' | 'companion' | null): Promise<void> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deck = getDeck(deckId);
  if (!deck) return;
  assertCanEdit(deck, user);
  const db = getDb();

  db.transaction(() => {
    if (role === null) {
      // Remove from command zone
      db.prepare("UPDATE deck_entries SET is_commander = 0, commander_role = NULL WHERE deck_id = ? AND oracle_id = ?").run(deckId, oracleId);
    } else if (role === 'commander') {
      // Single commander: clear all existing non-companion command-zone entries
      db.prepare("UPDATE deck_entries SET is_commander = 0, commander_role = NULL WHERE deck_id = ? AND (commander_role IS NULL OR commander_role != 'companion')").run(deckId);
      db.prepare("UPDATE deck_entries SET is_commander = 1, commander_role = 'commander' WHERE deck_id = ? AND oracle_id = ?").run(deckId, oracleId);
    } else if (role === 'partner' || role === 'background') {
      // Allow up to 2 command-zone entries of partner/background — clear solo commander if present
      db.prepare("UPDATE deck_entries SET is_commander = 0, commander_role = NULL WHERE deck_id = ? AND commander_role = 'commander'").run(deckId);
      db.prepare("UPDATE deck_entries SET is_commander = 1, commander_role = ? WHERE deck_id = ? AND oracle_id = ?").run(role, deckId, oracleId);
    } else if (role === 'companion') {
      // Companion: outside the 100, is_commander=0
      db.prepare("UPDATE deck_entries SET is_commander = 0, commander_role = 'companion' WHERE deck_id = ? AND oracle_id = ?").run(deckId, oracleId);
    }
    // Sync deck.commander to command-zone card names (excluding companion)
    const commanderEntries = db.prepare(
      "SELECT card_name FROM deck_entries WHERE deck_id = ? AND is_commander = 1 ORDER BY commander_role, card_name"
    ).all(deckId) as { card_name: string }[];
    const commanderStr = commanderEntries.map(r => r.card_name).join(' / ') || null;
    db.prepare("UPDATE decks SET commander = ?, updated_at = datetime('now') WHERE id = ?").run(commanderStr, deckId);
  })();
  revalidatePath(`/decks/${deckId}`);
}

export async function actionRemoveCard(deckId: string, oracleId: string, board?: string): Promise<void> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deck = getDeck(deckId);
  if (deck) assertCanEdit(deck, user);
  removeEntry(deckId, oracleId, board);
  recomputeDeckColorIdentity(deckId);
  revalidatePath(`/decks/${deckId}`);
}

export async function actionCloneDeck(deckId: string): Promise<{ id: string } | null> {
  ensureMigrated();
  const user = await resolveActingUser();
  const source = getDeck(deckId);
  if (!source) return null;
  const cloned = cloneDeck(deckId, `${source.name} (copy)`, user.id !== 'local' ? user.id : null);
  if (!cloned) return null;
  recomputeDeckColorIdentity(cloned.id);
  revalidatePath('/decks');
  return { id: cloned.id };
}

export async function actionUpdateEntry(
  deckId: string,
  oracleId: string,
  updates: Partial<Omit<DeckEntry, 'oracle_id' | 'card_name'>>
): Promise<void> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deck = getDeck(deckId);
  if (!deck) return;
  assertCanEdit(deck, user);
  const existing = deck.entries.find(e => e.oracle_id === oracleId);
  if (!existing) return;
  addOrUpdateEntry(deckId, { ...existing, ...updates });
  recomputeDeckColorIdentity(deckId);
  revalidatePath(`/decks/${deckId}`);
}

/** Import a full decklist text (Arena format) */
export async function actionImportDecklist(deckId: string, text: string): Promise<{ added: number; errors: string[] }> {
  ensureMigrated();
  const user = await resolveActingUser();
  const deckCheck = getDeck(deckId);
  if (deckCheck) assertCanEdit(deckCheck, user);
  const db = getDb();
  const lines = parseDecklist(text);
  let added = 0;
  const errors: string[] = [];

  for (const { name, quantity, is_commander, board } of lines) {
    // Resolve via local DB first
    const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const row = db.prepare(
      'SELECT scryfall_id, oracle_id, name FROM scryfall_cards WHERE name_norm = ? LIMIT 1'
    ).get(norm) as { scryfall_id: string; oracle_id: string; name: string } | undefined;

    if (row) {
      const dbCard = getScryfallCardById(row.scryfall_id);
      const autoCategory = dbCard ? classifyCard({ type_line: dbCard.type_line, oracle_text: dbCard.oracle_text, card_name: dbCard.name }) : null;
      addOrUpdateEntry(deckId, {
        oracle_id: row.oracle_id,
        scryfall_id: row.scryfall_id,
        card_name: row.name,
        quantity,
        is_commander,
        treatment: 'normal',
        finish: 'nonfoil',
        condition_floor: 'lp',
        board: board ?? 'main',
        category: autoCategory,
      });
      added++;
    } else {
      // Try Scryfall live
      try {
        const sc = await namedCard(name);
        if (sc) {
          // For live Scryfall results, attempt local DB classification by oracle_id
          const dbCard = getScryfallCardsByOracleId(sc.oracle_id)[0] ?? null;
          const autoCategory = dbCard ? classifyCard({ type_line: dbCard.type_line, oracle_text: dbCard.oracle_text, card_name: dbCard.name }) : null;
          addOrUpdateEntry(deckId, {
            oracle_id: sc.oracle_id,
            scryfall_id: sc.id,
            card_name: sc.name,
            quantity,
            is_commander,
            treatment: 'normal',
            finish: 'nonfoil',
            condition_floor: 'lp',
            board: board ?? 'main',
            category: autoCategory,
          });
          added++;
        } else {
          errors.push(`Not found: ${name}`);
        }
      } catch {
        errors.push(`Error resolving: ${name}`);
      }
    }
  }

  recomputeDeckColorIdentity(deckId);
  revalidatePath(`/decks/${deckId}`);
  return { added, errors };
}

// ─── Wishlist ─────────────────────────────────────────────────────────────────

import { upsertWishlistEntry, deleteWishlistEntry, moveWishlistToCollection } from '@/lib/wishlist/store';
import { getCollectionMap } from '@/lib/collection/store';

export async function actionAddToWishlist(entry: {
  oracle_id: string;
  scryfall_id?: string | null;
  card_name: string;
  quantity?: number;
  finish?: string;
  condition_floor?: string;
}): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  upsertWishlistEntry(user.id, {
    oracle_id: entry.oracle_id,
    scryfall_id: entry.scryfall_id ?? null,
    card_name: entry.card_name,
    quantity: entry.quantity ?? 1,
    finish: entry.finish ?? 'nonfoil',
    condition_floor: entry.condition_floor ?? 'lp',
  });
  revalidatePath('/wishlist');
}

export async function actionRemoveFromWishlist(oracleId: string, finish: string): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  deleteWishlistEntry(user.id, oracleId, finish);
  revalidatePath('/wishlist');
}

export async function actionUpdateWishlistEntry(entry: {
  oracle_id: string;
  finish: string;
  quantity: number;
  condition_floor?: string;
  priority?: number;
  notes?: string | null;
}): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  upsertWishlistEntry(user.id, {
    oracle_id: entry.oracle_id,
    finish: entry.finish,
    card_name: '', // preserved by ON CONFLICT update
    quantity: entry.quantity,
    condition_floor: entry.condition_floor,
    priority: entry.priority,
    notes: entry.notes,
  });
  revalidatePath('/wishlist');
}

export async function actionMoveWishlistToCollection(oracleId: string, finish: string, quantity: number): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  moveWishlistToCollection(user.id, oracleId, finish, quantity);
  revalidatePath('/wishlist');
  revalidatePath('/collection');
}

export async function actionAddMissingToWishlist(deckId: string): Promise<{ added: number }> {
  ensureMigrated();
  const user = await requireUser();
  const deck = getDeck(deckId);
  if (!deck) return { added: 0 };

  const collection = getCollectionMap(user.id);
  let added = 0;

  for (const entry of mainboardEntries(deck)) {
    const foil = entry.finish === 'foil' || entry.finish === 'etched';
    const haveKey = entry.oracle_id + ':' + (foil ? '1' : '0');
    const have = collection.get(haveKey)?.quantity ?? 0;
    const need = Math.max(0, entry.quantity - have);
    if (need > 0) {
      upsertWishlistEntry(user.id, {
        oracle_id: entry.oracle_id,
        scryfall_id: entry.scryfall_id ?? null,
        card_name: entry.card_name,
        finish: entry.finish,
        quantity: need,
        condition_floor: entry.condition_floor,
      });
      added++;
    }
  }

  revalidatePath('/wishlist');
  return { added };
}

// ─── Collection CSV import ────────────────────────────────────────────────────

import { parseCollectionCsv } from '@/lib/collection/csv';
import { resolveAndImport, type ImportMode } from '@/lib/collection/import';
import type { ImportReport } from '@/lib/collection/import';

export async function actionImportCollectionCsv(text: string, mode: ImportMode = 'merge'): Promise<ImportReport> {
  ensureMigrated();
  const user = await requireUser();
  const { rows, parseErrors, formatDetected } = parseCollectionCsv(text);
  const report = resolveAndImport(user.id, rows, { mode, formatDetected });
  // Fold parse errors into unmatched for simplicity
  for (const e of parseErrors) report.unmatched.push({ name: e, setCode: null, reason: 'Parse error' });
  revalidatePath('/collection');
  return report;
}

// ─── Collection quick-paste (Arena-format bulk add) ──────────────────────────

import { parseArenaList } from '@/lib/import/deck-sources';
import type { ParsedRow } from '@/lib/collection/csv';

/**
 * Bulk-add cards to collection from a pasted Arena/MTGO list.
 * Each line: "4 Lightning Bolt" or "1 Sol Ring (M13) 201".
 */
export async function actionBulkPasteToCollection(
  text: string,
  mode: ImportMode = 'merge',
): Promise<ImportReport> {
  ensureMigrated();
  const user = await requireUser();
  const { cards } = parseArenaList(text);
  const rows: ParsedRow[] = cards.map(c => ({
    name: c.name,
    quantity: c.quantity,
    foil: false,
    setCode: null,
    collectorNumber: null,
    raw: `${c.quantity} ${c.name}`,
  }));
  const report = resolveAndImport(user.id, rows, { mode, formatDetected: 'paste' });
  revalidatePath('/collection');
  return report;
}

// ─── Phase 3: Deck tags ───────────────────────────────────────────────────────

export async function actionSetDeckTags(deckId: string, tags: string[]): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  const deck = getDeck(deckId);
  if (!deck) throw new Error('Deck not found');
  assertCanEdit(deck, user);
  setDeckTags(deckId, tags);
  revalidatePath(`/decks/${deckId}`);
  revalidatePath(`/d/${deck.public_slug ?? ''}`);
}

// ─── Phase 3: Entry category ──────────────────────────────────────────────────

export async function actionSetEntryCategory(
  deckId: string,
  oracleId: string,
  board: string,
  category: string | null,
): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  const deck = getDeck(deckId);
  if (!deck) throw new Error('Deck not found');
  assertCanEdit(deck, user);
  setEntryCategory(deckId, oracleId, board, category);
  revalidatePath(`/decks/${deckId}`);
}

export async function actionReclassifyDeck(deckId: string): Promise<{ updated: number }> {
  ensureMigrated();
  const user = await requireUser();
  const deck = getDeck(deckId);
  if (!deck) throw new Error('Deck not found');
  assertCanEdit(deck, user);

  const db = getDb();
  const entries = db.prepare(
    `SELECT de.oracle_id, de.board,
            sc.type_line, sc.oracle_text
     FROM deck_entries de
     LEFT JOIN scryfall_cards sc ON sc.oracle_id = de.oracle_id
     WHERE de.deck_id = ?
     GROUP BY de.oracle_id, de.board`
  ).all(deckId) as { oracle_id: string; board: string | null; type_line: string | null; oracle_text: string | null }[];

  let updated = 0;
  for (const row of entries) {
    if (!row.oracle_id) continue;
    const category = classifyCard({ type_line: row.type_line, oracle_text: row.oracle_text, card_name: '' });
    setEntryCategory(deckId, row.oracle_id, row.board ?? 'main', category);
    updated++;
  }

  revalidatePath(`/decks/${deckId}`);
  return { updated };
}

// ─── Phase 3: Commander role ──────────────────────────────────────────────────

export async function actionSetCommanderRole(
  deckId: string,
  oracleId: string,
  board: string,
  role: string | null,
): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  const deck = getDeck(deckId);
  if (!deck) throw new Error('Deck not found');
  assertCanEdit(deck, user);
  setCommanderRole(deckId, oracleId, board, role);
  revalidatePath(`/decks/${deckId}`);
}

// ─── Phase 4: Social — following, notifications ───────────────────────────────

export async function actionToggleFollow(targetUserId: string): Promise<{ following: boolean }> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  if (user.id === targetUserId) throw new Error('Cannot follow yourself');
  const result = toggleFollow(user.id, targetUserId);
  if (result.following) {
    createNotification({ recipientId: targetUserId, actorId: user.id, type: 'follow' });
  }
  revalidatePath(`/u`);
  return result;
}

export async function actionGetNotifications() {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') return [];
  return getNotifications(user.id);
}

export async function actionGetUnreadCount(): Promise<number> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') return 0;
  return getUnreadCount(user.id);
}

export async function actionMarkAllRead(): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id !== 'local') markAllRead(user.id);
}

export async function actionMarkRead(notificationId: string): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id !== 'local') markRead(notificationId, user.id);
}

// Void unused import warning
void (null as unknown as NotificationType);

// ─── Deck versions ────────────────────────────────────────────────────────────

export async function actionSnapshotDeck(deckId: string, label?: string) {
  ensureMigrated();
  const user = await requireUser();
  const deck = getDeck(deckId);
  if (!deck) throw new Error('Deck not found');
  assertCanEdit(deck, user);
  return snapshotDeck(deckId, label);
}

export async function actionListVersions(deckId: string) {
  ensureMigrated();
  const user = await requireUser();
  const deck = getDeck(deckId);
  if (!deck) throw new Error('Deck not found');
  assertCanEdit(deck, user);
  return listVersions(deckId);
}

export async function actionRestoreVersion(deckId: string, versionId: string) {
  ensureMigrated();
  const user = await requireUser();
  const ok = restoreVersion(deckId, versionId, user.id);
  if (!ok) throw new Error('Restore failed');
  revalidatePath(`/decks/${deckId}`);
}

// ─── Card packages ────────────────────────────────────────────────────────────

export async function actionListPackages() {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') return [];
  return listPackages(user.id);
}

export async function actionGetPackageEntries(packageId: string) {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') return [];
  return getPackageEntries(packageId);
}

export async function actionCreatePackage(name: string, description?: string) {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  const pkg = createPackage(user.id, name, description);
  revalidatePath('/packages');
  return pkg;
}

export async function actionAddEntryToPackage(packageId: string, entry: {
  oracle_id: string;
  card_name: string;
  quantity?: number;
  board?: string;
  category?: string;
}) {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  return addEntryToPackage(packageId, entry);
}

export async function actionRemoveEntryFromPackage(entryId: string, packageId: string) {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  removeEntryFromPackage(entryId, packageId);
}

export async function actionUpdatePackageMeta(id: string, name: string, description?: string) {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  updatePackageMeta(id, user.id, name, description);
  revalidatePath('/packages');
}

export async function actionDeletePackage(id: string) {
  ensureMigrated();
  const user = await requireUser();
  deletePackage(id, user.id);
  revalidatePath('/packages');
}

/** Insert all entries from a package into a deck. */
export async function actionInsertPackageToDeck(deckId: string, packageId: string) {
  ensureMigrated();
  const user = await requireUser();
  const deck = getDeck(deckId);
  if (!deck) throw new Error('Deck not found');
  assertCanEdit(deck, user);

  const entries = getPackageEntries(packageId);
  for (const e of entries) {
    const sc = getScryfallCardsByOracleId(e.oracle_id)[0] ?? null;
    const autoCategory = sc ? classifyCard({ type_line: sc.type_line, oracle_text: sc.oracle_text, card_name: e.card_name }) : (e.category as Parameters<typeof addOrUpdateEntry>[1]['category'] ?? null);
    addOrUpdateEntry(deckId, {
      oracle_id: e.oracle_id,
      scryfall_id: sc?.scryfall_id ?? null,
      card_name: e.card_name,
      quantity: e.quantity,
      is_commander: false,
      treatment: 'normal',
      finish: 'nonfoil',
      condition_floor: 'nm',
      board: (e.board as 'main' | 'side' | 'maybe') ?? 'main',
      category: autoCategory,
    });
  }
  revalidatePath(`/decks/${deckId}`);
  return { inserted: entries.length };
}

// ─── Price alerts ─────────────────────────────────────────────────────────────

export async function actionListPriceAlerts() {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') return [];
  return listAlerts(user.id);
}

export async function actionCreatePriceAlert(opts: {
  oracleId: string;
  cardName: string;
  matchKey?: string;
  finish?: string;
  targetNzd: number;
}) {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  return createAlert({ userId: user.id, ...opts });
}

export async function actionDeletePriceAlert(alertId: string) {
  ensureMigrated();
  const user = await requireUser();
  deleteAlert(alertId, user.id);
}

// ─── Game logging (3A) ────────────────────────────────────────────────────────

import { logGame, deleteGame } from '@/lib/games/store';
import type { GameResult } from '@/lib/games/store';

export async function actionLogGame(
  deckId: string,
  opts: {
    result: GameResult;
    turns?: number | null;
    opponent?: string | null;
    opponentArchetype?: string | null;
    notes?: string | null;
  }
): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  const deck = getDeck(deckId);
  if (!deck) throw new Error('Deck not found');
  assertCanEdit(deck, user);
  logGame(user.id, deckId, opts);
  revalidatePath(`/decks/${deckId}`);
}

export async function actionDeleteGame(deckId: string, gameId: string): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  deleteGame(user.id, gameId);
  revalidatePath(`/decks/${deckId}`);
}

// ─── Trade binder (3B) ────────────────────────────────────────────────────────

import { setForTrade } from '@/lib/collection/store';

export async function actionSetForTrade(oracleId: string, forTrade: boolean): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  setForTrade(user.id, oracleId, forTrade);
  revalidatePath('/collection');
  revalidatePath('/trades');
}

// ─── Card social (5A) ────────────────────────────────────────────────────────

import { addCardComment, toggleCardUpvote, deleteCardComment, getCardComment } from '@/lib/card/social';

export async function actionAddCardComment(
  oracleId: string,
  body: string,
  parentId?: string
): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  if (!body.trim()) throw new Error('Comment cannot be empty');
  addCardComment({ oracleId, userId: user.id, body, parentId });
  revalidatePath(`/card`);
}

export async function actionToggleCardUpvote(oracleId: string): Promise<{ upvoted: boolean }> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  return toggleCardUpvote(user.id, oracleId);
}

// ─── API keys (5C) ───────────────────────────────────────────────────────────

import { randomBytes, createHash } from 'crypto';
import { getDb as getDbDirect } from '@/lib/db/connection';

export async function actionCreateApiKey(label: string): Promise<string> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  const raw = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  const id = randomUUID();
  const db = getDbDirect();
  db.prepare(`
    INSERT INTO api_keys (id, user_id, key_hash, label) VALUES (?, ?, ?, ?)
  `).run(id, user.id, hash, label.trim() || 'My key');
  revalidatePath('/account');
  // Return the raw key — shown ONCE to the user, never stored in plaintext
  return raw;
}

export async function actionRevokeApiKey(keyId: string): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  const db = getDbDirect();
  db.prepare(
    `UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND user_id = ?`
  ).run(keyId, user.id);
  revalidatePath('/account');
}

export async function actionListApiKeys(): Promise<{ id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null }[]> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') return [];
  const db = getDbDirect();
  return db.prepare(
    `SELECT id, label, created_at, last_used_at, revoked_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`
  ).all(user.id) as { id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null }[];
}

export async function actionPinDeck(deckId: string | null): Promise<void> {
  ensureMigrated();
  const user = await requireUser();
  if (user.id === 'local') throw new Error('Login required');
  const db = getDbDirect();
  if (deckId) {
    // Verify caller owns the deck before pinning
    const deck = db.prepare('SELECT user_id FROM decks WHERE id = ?').get(deckId) as { user_id: string } | undefined;
    if (!deck || deck.user_id !== user.id) throw new Error('Not your deck');
  }
  db.prepare('UPDATE users SET pinned_deck_id = ? WHERE id = ?').run(deckId, user.id);
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(user.id) as { username: string | null };
  revalidatePath(`/u/${u.username ?? user.id}`);
}
