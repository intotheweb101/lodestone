/**
 * Scryfall bulk data loader.
 * Downloads default_cards.json and populates scryfall_cards + sets tables.
 * Called from scripts/sync.ts — not inside a request.
 */

import { getDb } from '../db/connection';
import { getBulkDataInfo, getAllSets, ScryfallCardRaw } from './client';
import { normalizeNameIndex } from '../match/normalize';
import { registerAlias } from '../match/setAliases';
import { syncLog } from '../sync-log';
import https from 'https';
import http from 'http';
import { createWriteStream } from 'fs';
import { unlink, stat } from 'fs/promises';
import path from 'path';
import os from 'os';

const CACHE_PATH = path.join(process.cwd(), 'data', 'scryfall_bulk.json');

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'mtg-deck-builder/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    }).on('error', reject);
  });
}

export async function loadSets(): Promise<void> {
  syncLog('[bulk] Loading Scryfall sets...');
  const sets = await getAllSets();
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO sets (code, name, name_norm, set_type, parent_set_code, released_at, card_count, icon_svg_uri)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAll = db.transaction(() => {
    for (const s of sets) {
      const nameNorm = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      insert.run(
        s.code, s.name, nameNorm, s.set_type, s.parent_set_code ?? null,
        s.released_at ?? null, s.card_count ?? null, s.icon_svg_uri ?? null,
      );
    }
  });
  insertAll();
  syncLog(`[bulk] Loaded ${sets.length} sets.`);
}

// Zero-dependency streaming JSON array parser.
// Reads an array like [{...},{...}] from a large file without ever
// holding the whole thing as a string — avoids V8's 512MB string limit.
//
// Key design: `pending` accumulates object text from prior chunks only.
// We scan each rawChunk fresh, tracking depth/string state carried across
// chunk boundaries. No re-scanning of already-processed bytes.
async function* streamJsonObjects(filePath: string): AsyncGenerator<ScryfallCardRaw> {
  const { createReadStream } = await import('fs');
  const stream = createReadStream(filePath, { encoding: 'utf8', highWaterMark: 8 * 1024 * 1024 });

  let pending = '';       // object text accumulated from previous chunks
  let depth = 0;          // brace nesting depth (carried across chunks)
  let inStr = false;      // inside a JSON string (carried across chunks)
  let esc = false;        // next char is escaped (carried across chunks)

  for await (const rawChunk of stream as AsyncIterable<string>) {
    // If we're mid-object, accumulate this whole chunk from the start;
    // otherwise wait until we see the opening '{'.
    let objChunkStart: number = depth > 0 ? 0 : -1;

    for (let i = 0; i < rawChunk.length; i++) {
      const ch = rawChunk[i];

      if (esc)                  { esc = false; continue; }
      if (inStr && ch === '\\') { esc = true;  continue; }
      if (ch === '"')           { inStr = !inStr; continue; }
      if (inStr)                continue;

      if (ch === '{') {
        if (depth === 0) {
          objChunkStart = i;
          pending = ''; // discard any non-JSON between objects
        }
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && objChunkStart !== -1) {
          yield JSON.parse(pending + rawChunk.slice(objChunkStart, i + 1)) as ScryfallCardRaw;
          pending = '';
          objChunkStart = -1;
        }
      }
    }

    // Carry the incomplete object tail into the next chunk
    if (depth > 0 && objChunkStart !== -1) {
      pending += rawChunk.slice(objChunkStart);
    }
  }
}

export async function loadBulkCards(forceDownload = false): Promise<void> {
  // Check if we need to download
  let needDownload = forceDownload;
  try {
    const s = await stat(CACHE_PATH);
    const ageHours = (Date.now() - s.mtimeMs) / 1000 / 3600;
    if (ageHours > 20) needDownload = true; // refresh if older than 20h
    else syncLog(`[bulk] Using cached bulk file (${Math.round(ageHours)}h old).`);
  } catch {
    needDownload = true;
  }

  if (needDownload) {
    syncLog('[bulk] Fetching bulk data manifest...');
    const infos = await getBulkDataInfo();
    const defaultCards = infos.find(i => i.type === 'default_cards');
    if (!defaultCards) throw new Error('Could not find default_cards bulk file');
    syncLog(`[bulk] Downloading ${Math.round(defaultCards.size / 1024 / 1024)}MB bulk file...`);
    await downloadFile(defaultCards.download_uri, CACHE_PATH);
    syncLog('[bulk] Download complete.');
  }

  syncLog('[bulk] Parsing and loading cards into SQLite (streaming)...');
  const db = getDb();

  // Coerce Scryfall's sometimes-non-numeric P/T/loyalty values ('*', '1+*', 'X') to a REAL
  const toNum = (s: string | null | undefined): number | null => {
    if (s == null) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO scryfall_cards (
      scryfall_id, oracle_id, name, name_norm,
      set_code, collector_number,
      finishes_json, frame_effects_json,
      border_color, full_art, promo_types_json,
      color_identity_json, colors_json, mana_cost, cmc,
      type_line, oracle_text, rarity,
      legalities_json, prices_json, image_uris_json,
      card_faces_json, prints_search_uri,
      power, toughness, loyalty,
      power_num, toughness_num, loyalty_num,
      keywords_json, artist, flavor_text, released_at,
      updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      datetime('now')
    )
  `);

  const insertBatch = db.transaction((batch: ScryfallCardRaw[]) => {
    for (const c of batch) {
      if (!c.oracle_id || !c.id || !c.name) continue; // skip tokens/art cards

      // For double-faced cards, top-level P/T/oracle_text may be absent;
      // fall back to the front face so pow:/tou:/o: still work.
      const frontFace = c.card_faces?.[0];
      const power     = c.power     ?? frontFace?.power     ?? null;
      const toughness = c.toughness ?? frontFace?.toughness ?? null;
      const loyalty   = c.loyalty   ?? frontFace?.loyalty   ?? null;

      // Concatenate oracle_text from all faces so o: searches find text on either face
      let oracleText = c.oracle_text ?? null;
      if (!oracleText && c.card_faces?.length) {
        oracleText = c.card_faces.map(f => f.oracle_text ?? '').filter(Boolean).join('\n') || null;
      }

      const nameNorm = normalizeNameIndex(c.name);
      upsert.run(
        c.id, c.oracle_id, c.name, nameNorm,
        c.set, c.collector_number,
        JSON.stringify(c.finishes ?? []),
        JSON.stringify(c.frame_effects ?? []),
        c.border_color ?? null,
        c.full_art ? 1 : 0,
        c.promo_types ? JSON.stringify(c.promo_types) : null,
        JSON.stringify(c.color_identity ?? []),
        JSON.stringify(c.colors ?? []),
        c.mana_cost ?? null,
        c.cmc ?? null,
        c.type_line ?? null,
        oracleText,
        c.rarity,
        JSON.stringify(c.legalities ?? {}),
        JSON.stringify(c.prices ?? {}),
        c.image_uris ? JSON.stringify(c.image_uris) : null,
        c.card_faces ? JSON.stringify(c.card_faces) : null,
        c.prints_search_uri ?? null,
        power, toughness, loyalty,
        toNum(power), toNum(toughness), toNum(loyalty),
        JSON.stringify(c.keywords ?? []),
        c.artist ?? null,
        c.flavor_text ?? null,
        c.released_at ?? null,
      );
    }
  });

  // Stream-parse using only built-in fs — avoids the V8 512MB string limit
  // and requires no external packages that Turbopack can't resolve.
  let count = 0;
  const batchSize = 1000;
  let batch: ScryfallCardRaw[] = [];

  for await (const card of streamJsonObjects(CACHE_PATH)) {
    batch.push(card);
    if (batch.length >= batchSize) {
      insertBatch(batch);
      count += batch.length;
      batch = [];
      if (count % 50000 === 0) process.stdout.write(`[bulk] ${count} cards loaded...\r`);
    }
  }
  if (batch.length > 0) { insertBatch(batch); count += batch.length; }

  console.log(`\n[bulk] Loaded ${count} cards into scryfall_cards.`);

  // Rebuild the FTS5 oracle-text index so o: searches are current
  try {
    syncLog('[bulk] Rebuilding FTS index...');
    db.exec("INSERT INTO scryfall_fts(scryfall_fts) VALUES('rebuild')");
    syncLog('[bulk] FTS index rebuilt.');
  } catch (err) {
    syncLog(`[bulk] WARN FTS rebuild skipped: ${(err as Error).message}`);
  }
}
