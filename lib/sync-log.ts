/**
 * Shared in-memory sync log buffer.
 * Written by ingest/sync processes, read by the SSE log stream.
 * Circular: capped at MAX_LINES so memory stays bounded across long syncs.
 */

const MAX_LINES = 500;
const lines: { ts: string; msg: string }[] = [];
let seq = 0;

export function syncLog(msg: string) {
  const entry = { ts: new Date().toISOString(), msg };
  if (lines.length >= MAX_LINES) lines.shift();
  lines.push(entry);
  seq++;
  console.log(`[sync] ${msg}`);
}

export function getSyncLines(afterSeq = 0): { seq: number; lines: { ts: string; msg: string }[] } {
  const start = Math.max(0, lines.length - (seq - afterSeq));
  return { seq, lines: lines.slice(start) };
}

export function clearSyncLog() {
  lines.length = 0;
  seq = 0;
}
