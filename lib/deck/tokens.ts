/**
 * Produced-tokens parser — detects token/emblem creators in a deck.
 *
 * Scans oracle_text and card_faces[].oracle_text (DFCs) for:
 *  - "create[s] … token" patterns
 *  - emblem patterns
 *
 * Mirrors the lowercase-substring + regex idiom from lib/recommend/classify.ts.
 */

interface CardFace {
  oracle_text?: string | null;
}

export interface TokenEntry {
  cardName: string;
  descriptors: string[];
}

// Regex to extract the token descriptor between "create/creates" and "token"
const TOKEN_RE = /\bcreates?\b[^.]*?\btoken/gi;
const EMBLEM_RE = /\bgets?\s+an?\s+emblem\b|\bemblem\s+with\b/gi;

/** Extract all "token/emblem" descriptors from a single oracle text string. */
function extractDescriptors(oracleText: string): string[] {
  const descriptors: string[] = [];

  // Token patterns: grab up to 80 chars around the match for context
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(oracleText)) !== null) {
    const raw = m[0];
    // Trim filler words to produce a human-readable descriptor
    const descriptor = raw
      .replace(/\bcreates?\b\s*/i, '')
      .replace(/\s*token\b.*/i, ' token')
      .trim();
    if (descriptor && !descriptors.includes(descriptor)) {
      descriptors.push(descriptor);
    }
  }

  // Emblem patterns
  EMBLEM_RE.lastIndex = 0;
  if (EMBLEM_RE.test(oracleText)) {
    if (!descriptors.includes('emblem')) descriptors.push('emblem');
  }

  return descriptors;
}

/** All oracle texts to scan for a single card (handles DFCs). */
function allOracleTexts(oracleText: string | null, cardFacesJson: string | null): string[] {
  const texts: string[] = [];
  if (oracleText) texts.push(oracleText);
  if (cardFacesJson) {
    try {
      const faces = JSON.parse(cardFacesJson) as CardFace[];
      for (const face of faces) {
        if (face.oracle_text) texts.push(face.oracle_text);
      }
    } catch { /* malformed json — skip */ }
  }
  return texts;
}

export interface ProducedTokensResult {
  tokenMakers: TokenEntry[];   // cards that produce at least one token/emblem
}

export interface CardRow {
  card_name: string;
  oracle_text: string | null;
  card_faces_json: string | null;
}

export function getProducedTokens(cards: CardRow[]): ProducedTokensResult {
  const tokenMakers: TokenEntry[] = [];

  for (const card of cards) {
    const texts = allOracleTexts(card.oracle_text, card.card_faces_json);
    const descriptors: string[] = [];

    for (const text of texts) {
      for (const d of extractDescriptors(text)) {
        if (!descriptors.includes(d)) descriptors.push(d);
      }
    }

    if (descriptors.length > 0) {
      tokenMakers.push({ cardName: card.card_name, descriptors });
    }
  }

  return { tokenMakers };
}
