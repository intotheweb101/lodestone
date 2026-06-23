/**
 * CSV collection importer — hand-rolled quote-aware tokenizer, no dependencies.
 *
 * Supports ManaBox, Moxfield, Archidekt, and generic qty/name/set formats.
 */

export type CsvFormat = 'manabox' | 'moxfield' | 'archidekt' | 'generic';

export interface ParsedRow {
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  quantity: number;
  foil: boolean;
  /** Original CSV line for error reporting */
  raw: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  parseErrors: string[];
  formatDetected: CsvFormat;
}

// ── Tokenizer ──────────────────────────────────────────────────────────────────

/** Split one CSV line into fields, handling quoted strings (RFC 4180). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuote = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuote = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { fields.push(field.trim()); field = ''; }
      else { field += ch; }
    }
    i++;
  }
  fields.push(field.trim());
  return fields;
}

/** Strip BOM and normalize line endings. */
function normalizeText(raw: string): string {
  return raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ── Format detection ───────────────────────────────────────────────────────────

const FORMAT_HEADERS: Record<CsvFormat, string[]> = {
  manabox:   ['name', 'set code', 'collector number', 'quantity', 'foil'],
  moxfield:  ['count', 'name', 'edition', 'collector number', 'foil'],
  archidekt: ['quantity', 'name', 'set code', 'collector number', 'finish'],
  generic:   [],
};

function detectFormat(headerFields: string[]): CsvFormat {
  const normalized = headerFields.map(h => h.toLowerCase().trim());
  for (const fmt of ['manabox', 'moxfield', 'archidekt'] as CsvFormat[]) {
    const expected = FORMAT_HEADERS[fmt];
    if (expected.every(h => normalized.includes(h))) return fmt;
  }
  return 'generic';
}

// ── Row parsers per format ─────────────────────────────────────────────────────

function findCol(headers: string[], ...names: string[]): number {
  const normalized = headers.map(h => h.toLowerCase().trim());
  for (const name of names) {
    const idx = normalized.indexOf(name.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseManabox(headers: string[], fields: string[], raw: string): ParsedRow | null {
  const nameIdx    = findCol(headers, 'name');
  const setIdx     = findCol(headers, 'set code', 'set');
  const numIdx     = findCol(headers, 'collector number', 'collector_number');
  const qtyIdx     = findCol(headers, 'quantity', 'count');
  const foilIdx    = findCol(headers, 'foil');
  const name = fields[nameIdx]?.trim();
  if (!name) return null;
  const foilVal = (fields[foilIdx] ?? '').toLowerCase();
  return {
    name,
    setCode: fields[setIdx]?.trim() || null,
    collectorNumber: fields[numIdx]?.trim() || null,
    quantity: parseInt(fields[qtyIdx] ?? '1', 10) || 1,
    foil: foilVal === 'foil' || foilVal === 'etched' || foilVal === 'true' || foilVal === '1',
    raw,
  };
}

function parseMoxfield(headers: string[], fields: string[], raw: string): ParsedRow | null {
  const nameIdx = findCol(headers, 'name');
  const setIdx  = findCol(headers, 'edition', 'set code', 'set');
  const numIdx  = findCol(headers, 'collector number', 'collector_number');
  const qtyIdx  = findCol(headers, 'count', 'quantity');
  const foilIdx = findCol(headers, 'foil');
  const name = fields[nameIdx]?.trim();
  if (!name) return null;
  const foilVal = (fields[foilIdx] ?? '').toLowerCase();
  return {
    name,
    setCode: fields[setIdx]?.trim() || null,
    collectorNumber: fields[numIdx]?.trim() || null,
    quantity: parseInt(fields[qtyIdx] ?? '1', 10) || 1,
    foil: foilVal === 'foil' || foilVal === 'true' || foilVal === '1',
    raw,
  };
}

function parseArchidekt(headers: string[], fields: string[], raw: string): ParsedRow | null {
  const nameIdx   = findCol(headers, 'name');
  const setIdx    = findCol(headers, 'set code', 'set', 'edition');
  const numIdx    = findCol(headers, 'collector number', 'collector_number');
  const qtyIdx    = findCol(headers, 'quantity', 'count');
  const finishIdx = findCol(headers, 'finish', 'foil');
  const name = fields[nameIdx]?.trim();
  if (!name) return null;
  const finishVal = (fields[finishIdx] ?? '').toLowerCase();
  return {
    name,
    setCode: fields[setIdx]?.trim() || null,
    collectorNumber: fields[numIdx]?.trim() || null,
    quantity: parseInt(fields[qtyIdx] ?? '1', 10) || 1,
    foil: finishVal === 'foil' || finishVal === 'etched' || finishVal === 'true',
    raw,
  };
}

function parseGeneric(_headers: string[], fields: string[], raw: string): ParsedRow | null {
  // Expected: qty,name[,set_code]
  // Also handle lines like "4 Counterspell" or "4x Counterspell"
  const joined = raw.trim();
  const inlineMatch = joined.match(/^(\d+)[xX]?\s+(.+)$/);
  if (inlineMatch) {
    return { name: inlineMatch[2].trim(), setCode: null, collectorNumber: null, quantity: parseInt(inlineMatch[1], 10), foil: false, raw };
  }
  if (fields.length >= 2) {
    const qty = parseInt(fields[0], 10);
    const name = fields[1]?.trim();
    if (!name) return null;
    return { name, setCode: fields[2]?.trim() || null, collectorNumber: null, quantity: isNaN(qty) ? 1 : qty, foil: false, raw };
  }
  return null;
}

// ── Main parser ────────────────────────────────────────────────────────────────

export function parseCollectionCsv(text: string): ParseResult {
  const normalized = normalizeText(text);
  const lines = normalized.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { rows: [], parseErrors: [], formatDetected: 'generic' };

  const headerFields = splitCsvLine(lines[0]);
  const formatDetected = detectFormat(headerFields);

  const parseRow = {
    manabox:   parseManabox,
    moxfield:  parseMoxfield,
    archidekt: parseArchidekt,
    generic:   parseGeneric,
  }[formatDetected];

  // For generic format, start from line 0 (no header); for others, skip header
  const dataLines = formatDetected === 'generic' ? lines : lines.slice(1);

  // Deduplicate within the file: aggregate by (name, setCode, foil)
  const dedupeMap = new Map<string, ParsedRow>();
  const parseErrors: string[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;
    const fields = splitCsvLine(line);
    const row = parseRow(
      formatDetected === 'generic' ? [] : headerFields,
      fields,
      line,
    );
    if (!row || !row.name) {
      parseErrors.push(`Could not parse: ${line.slice(0, 80)}`);
      continue;
    }
    // Normalize collector number (strip leading zeros for matching, preserve original)
    const dedupeKey = `${row.name.toLowerCase()}|${(row.setCode ?? '').toLowerCase()}|${row.foil ? '1' : '0'}`;
    const existing = dedupeMap.get(dedupeKey);
    if (existing) {
      existing.quantity += row.quantity;
    } else {
      dedupeMap.set(dedupeKey, { ...row });
    }
  }

  return { rows: Array.from(dedupeMap.values()), parseErrors, formatDetected };
}
