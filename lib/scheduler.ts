import { runMigrations } from '@/lib/db/migrations';

let schedulerStarted = false;

export function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const CHECK_INTERVAL_MS = 60 * 1000; // check every 60s

  async function checkAndSync() {
    try {
      runMigrations();
      const { getDb } = await import('@/lib/db/connection');
      const db = getDb();
      const settings = db.prepare('SELECT auto_sync_enabled, sync_interval_hours, last_auto_sync_at FROM sync_settings WHERE id = 1').get() as {
        auto_sync_enabled: number;
        sync_interval_hours: number;
        last_auto_sync_at: string | null;
      } | null;

      if (!settings?.auto_sync_enabled) return;

      const intervalMs = (settings.sync_interval_hours ?? 24) * 3600 * 1000;
      const lastSync = settings.last_auto_sync_at ? new Date(settings.last_auto_sync_at).getTime() : 0;
      const now = Date.now();

      if (now - lastSync < intervalMs) return;

      console.log('[Lodestone scheduler] Auto-sync triggered');
      const { ingestAllShops } = await import('@/lib/shopify/ingest');
      await ingestAllShops();
      // Stamp AFTER success so a failed sync retries on the next check interval
      db.prepare("UPDATE sync_settings SET last_auto_sync_at = datetime('now') WHERE id = 1").run();
      console.log('[Lodestone scheduler] Auto-sync complete');

      // Snapshot collection values for all real users after each sync
      try {
        const { snapshotCollectionValue } = await import('@/lib/collection/store');
        const users = db.prepare("SELECT id FROM users WHERE id != 'local'").all() as { id: string }[];
        for (const u of users) {
          try { snapshotCollectionValue(u.id); } catch { /* non-fatal */ }
        }
        console.log(`[Lodestone scheduler] Snapshotted collection values for ${users.length} users`);
      } catch { /* non-fatal — don't block scheduler on snapshot errors */ }
    } catch (err) {
      console.error('[Lodestone scheduler] Error:', err);
    }
  }

  setInterval(checkAndSync, CHECK_INTERVAL_MS);
  console.log('[Lodestone scheduler] Started');
}
