/**
 * Price alerts — users set a target NZD price; when a shop sync beats it, a notification fires.
 */

import { getDb } from '../db/connection';
import { createPriceNotification } from '../social/store';
import { sendPriceAlertDigest, type TriggeredAlert } from '../email/send';
import { randomUUID } from 'crypto';

export interface PriceAlert {
  id: string;
  user_id: string;
  oracle_id: string;
  card_name: string;
  match_key: string | null;
  finish: string;
  target_nzd: number;
  created_at: string;
  triggered_at: string | null;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function listAlerts(userId: string): PriceAlert[] {
  return getDb().prepare(
    'SELECT * FROM price_alerts WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId) as PriceAlert[];
}

export function createAlert(opts: {
  userId: string;
  oracleId: string;
  cardName: string;
  matchKey?: string;
  finish?: string;
  targetNzd: number;
}): PriceAlert {
  const id = randomUUID();
  const db = getDb();

  // Upsert: one alert per user+oracle+finish
  const existing = db.prepare(
    'SELECT id FROM price_alerts WHERE user_id = ? AND oracle_id = ? AND finish = ?'
  ).get(opts.userId, opts.oracleId, opts.finish ?? 'nonfoil') as { id: string } | undefined;

  if (existing) {
    db.prepare('UPDATE price_alerts SET target_nzd = ?, match_key = ?, triggered_at = NULL WHERE id = ?').run(
      opts.targetNzd, opts.matchKey ?? null, existing.id
    );
    return getDb().prepare('SELECT * FROM price_alerts WHERE id = ?').get(existing.id) as PriceAlert;
  }

  db.prepare(`
    INSERT INTO price_alerts (id, user_id, oracle_id, card_name, match_key, finish, target_nzd)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, opts.userId, opts.oracleId, opts.cardName, opts.matchKey ?? null, opts.finish ?? 'nonfoil', opts.targetNzd);

  return { id, user_id: opts.userId, oracle_id: opts.oracleId, card_name: opts.cardName, match_key: opts.matchKey ?? null, finish: opts.finish ?? 'nonfoil', target_nzd: opts.targetNzd, created_at: new Date().toISOString(), triggered_at: null };
}

export function deleteAlert(id: string, userId: string): void {
  getDb().prepare('DELETE FROM price_alerts WHERE id = ? AND user_id = ?').run(id, userId);
}

// ─── Check alerts after a sync ────────────────────────────────────────────────

/**
 * Called after each ingest run. Checks if any shop variants now beat open alerts.
 * Fires a 'price' notification for each triggered alert and marks it triggered.
 */
export function checkPriceAlerts(): void {
  const db = getDb();

  // Find open alerts where the current best shop price beats the target
  const triggered = db.prepare(`
    SELECT pa.id, pa.user_id, pa.card_name, pa.target_nzd, pa.finish,
           MIN(sv.price_nzd) AS best_price, pa.oracle_id
    FROM price_alerts pa
    JOIN shop_variants sv ON sv.match_key IS NOT NULL AND (
      sv.match_key = pa.match_key
      OR (pa.match_key IS NULL AND sv.match_key IN (
        SELECT match_key FROM shop_variants
        INNER JOIN shop_products sp ON sp.id = shop_variants.product_id
        WHERE sp.card_name_norm = LOWER(REPLACE(REPLACE(pa.card_name, ',', ''), '''', ''))
        LIMIT 1
      ))
    )
    WHERE pa.triggered_at IS NULL
      AND sv.available > 0
      AND sv.finish = pa.finish
    GROUP BY pa.id
    HAVING MIN(sv.price_nzd) <= pa.target_nzd
  `).all() as { id: string; user_id: string; card_name: string; target_nzd: number; finish: string; best_price: number; oracle_id: string }[];

  // Collect per-user digest data while processing
  const digestByUser = new Map<string, TriggeredAlert[]>();

  for (const alert of triggered) {
    // Mark triggered
    db.prepare("UPDATE price_alerts SET triggered_at = datetime('now') WHERE id = ?").run(alert.id);

    // Fire in-app price notification
    try {
      createPriceNotification({
        userId: alert.user_id,
        cardName: alert.card_name,
        bestPriceNzd: alert.best_price,
        targetNzd: alert.target_nzd,
      });
    } catch { /* non-fatal */ }

    // Accumulate for email digest
    if (!digestByUser.has(alert.user_id)) digestByUser.set(alert.user_id, []);
    digestByUser.get(alert.user_id)!.push({
      cardName: alert.card_name,
      bestPriceNzd: alert.best_price,
      targetNzd: alert.target_nzd,
      finish: alert.finish,
      oracleId: alert.oracle_id,
    });
  }

  // Send one digest email per user (fire-and-forget — don't block the sync)
  if (digestByUser.size > 0) {
    const userRows = db.prepare(
      `SELECT id, email FROM users WHERE id IN (${Array.from(digestByUser.keys()).map(() => '?').join(',')})`
    ).all(...Array.from(digestByUser.keys())) as { id: string; email: string }[];

    for (const { id, email } of userRows) {
      const alerts = digestByUser.get(id);
      if (!alerts?.length) continue;
      sendPriceAlertDigest(email, alerts).catch(err =>
        console.error(`[price alerts] digest email failed for ${email}:`, err)
      );
    }
  }
}
