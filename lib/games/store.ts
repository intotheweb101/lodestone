/**
 * Game logging store — records per-deck game results and computes win-rate stats.
 * Mirror idiom: getDb() per call, userId first, no direct import of auth.
 */

import { getDb } from '@/lib/db/connection';
import { randomUUID } from 'crypto';

export type GameResult = 'win' | 'loss' | 'draw';

export interface GameEntry {
  id: string;
  deck_id: string;
  user_id: string;
  result: GameResult;
  turns: number | null;
  opponent: string | null;
  opponent_archetype: string | null;
  notes: string | null;
  played_at: string;
}

export interface WinRateStats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winPct: number;
  avgTurns: number | null;
  byArchetype: { archetype: string; games: number; wins: number; winPct: number }[];
}

export function logGame(
  userId: string,
  deckId: string,
  opts: {
    result: GameResult;
    turns?: number | null;
    opponent?: string | null;
    opponentArchetype?: string | null;
    notes?: string | null;
  },
): GameEntry {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO deck_games (id, deck_id, user_id, result, turns, opponent, opponent_archetype, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, deckId, userId, opts.result,
    opts.turns ?? null,
    opts.opponent ?? null,
    opts.opponentArchetype ?? null,
    opts.notes ?? null,
  );
  return getDb().prepare('SELECT * FROM deck_games WHERE id = ?').get(id) as GameEntry;
}

export function getGames(deckId: string, limit = 50): GameEntry[] {
  return getDb().prepare(
    'SELECT * FROM deck_games WHERE deck_id = ? ORDER BY played_at DESC LIMIT ?'
  ).all(deckId, limit) as GameEntry[];
}

export function deleteGame(userId: string, gameId: string): void {
  // Only the owner can delete — join on user_id as auth guard
  getDb().prepare(
    'DELETE FROM deck_games WHERE id = ? AND user_id = ?'
  ).run(gameId, userId);
}

export function getWinRate(deckId: string): WinRateStats {
  const db = getDb();

  const rows = db.prepare(
    `SELECT result, turns, opponent_archetype FROM deck_games WHERE deck_id = ? ORDER BY played_at DESC`
  ).all(deckId) as { result: GameResult; turns: number | null; opponent_archetype: string | null }[];

  let wins = 0, losses = 0, draws = 0, turnSum = 0, turnCount = 0;
  const archetypeMap: Record<string, { games: number; wins: number }> = {};

  for (const r of rows) {
    if (r.result === 'win') wins++;
    else if (r.result === 'loss') losses++;
    else draws++;

    if (r.turns != null) { turnSum += r.turns; turnCount++; }

    if (r.opponent_archetype) {
      const key = r.opponent_archetype.trim().toLowerCase();
      if (!archetypeMap[key]) archetypeMap[key] = { games: 0, wins: 0 };
      archetypeMap[key].games++;
      if (r.result === 'win') archetypeMap[key].wins++;
    }
  }

  const games = rows.length;
  const winPct = games > 0 ? Math.round((wins / games) * 100) : 0;
  const avgTurns = turnCount > 0 ? Math.round((turnSum / turnCount) * 10) / 10 : null;

  const byArchetype = Object.entries(archetypeMap)
    .map(([archetype, s]) => ({
      archetype,
      games: s.games,
      wins: s.wins,
      winPct: Math.round((s.wins / s.games) * 100),
    }))
    .sort((a, b) => b.games - a.games);

  return { games, wins, losses, draws, winPct, avgTurns, byArchetype };
}
