import type { Metadata } from 'next';
import { BracketCalcClient } from './bracket-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bracket Calculator — Lodestone',
  description: 'Paste any Commander decklist to estimate its power bracket — no login needed.',
};

export default function BracketPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem', color: 'var(--text)' }}>
      <div style={{ marginBottom: '2rem' }}>
        <p style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11, color: 'var(--accent)',
          letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6,
        }}>
          Tools
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          Bracket Calculator
        </h1>
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>
          Paste any Commander decklist to estimate its power bracket — no login needed.
          Powered by Commander Spellbook.
        </p>
      </div>

      <BracketCalcClient />
    </div>
  );
}
