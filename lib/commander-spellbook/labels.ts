/**
 * Commander Spellbook bracket labels — browser-safe, no server imports.
 * Shared by the API client (server-only) and the BracketBadge UI component (client).
 */

// WotC 2025 bracket tag → display label + colour
export const BRACKET_LABELS: Record<string, { num: number; label: string; color: string; desc: string }> = {
  E: { num: 1, label: 'Exhibition', color: '#54c08a', desc: 'Casual / precon level' },
  C: { num: 2, label: 'Core',       color: '#8bc28a', desc: 'Functional casual' },
  U: { num: 3, label: 'Upgraded',   color: '#e8b14a', desc: 'Modified precon / upgraded' },
  P: { num: 4, label: 'Powerful',   color: '#e88a4a', desc: 'Optimised / high power' },
  H: { num: 5, label: 'cEDH',      color: '#e2645c', desc: 'Competitive Commander' },
};

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface BracketCard {
  name: string;
  oracleId: string | null;
  image: string | null;
  gameChanger: boolean;
  massLandDenial: boolean;
  extraTurn: boolean;
  banned: boolean;
}

export interface BracketResult {
  bracketTag: string;
  bracketNum: number;
  bracketLabel: string;
  bracketColor: string;
  bracketDesc: string;
  reasons: string[];
  cards: BracketCard[];
}
