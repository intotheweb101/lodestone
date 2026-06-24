import { describe, it, expect } from 'vitest';
import { hypergeomExact, hypergeomAtLeast, oddsOfDrawingByTurn } from './hypergeometric';

// ── hypergeomExact ────────────────────────────────────────────────────────────

describe('hypergeomExact', () => {
  it('returns 1 when the only card in the deck is drawn', () => {
    // N=1, K=1, n=1, k=1: the single card is always drawn
    expect(hypergeomExact(1, 1, 1, 1)).toBeCloseTo(1.0, 10);
  });

  it('returns 0 when there are no successes in the deck', () => {
    // K=0, so k=1 is impossible
    expect(hypergeomExact(100, 0, 7, 1)).toBeCloseTo(0, 10);
  });

  it('returns 0 when drawing fewer cards than required successes', () => {
    // n=3 draws, k=5 successes needed — impossible
    expect(hypergeomExact(100, 50, 3, 5)).toBeCloseTo(0, 10);
  });

  it('sums to 1 over all possible outcome values', () => {
    // P(X=0) + P(X=1) + ... + P(X=min(K,n)) should equal 1
    const N = 60, K = 4, n = 7;
    let total = 0;
    for (let k = 0; k <= Math.min(K, n); k++) {
      total += hypergeomExact(N, K, n, k);
    }
    expect(total).toBeCloseTo(1.0, 5);
  });

  it('calculates a known value: P(X=1) drawing a singleton from 99-card deck in 7', () => {
    // P(exactly 1 success) where N=99, K=1, n=7, k=1
    // = C(1,1) * C(98,6) / C(99,7) = C(98,6)/C(99,7) = 7/99
    expect(hypergeomExact(99, 1, 7, 1)).toBeCloseTo(7 / 99, 5);
  });
});

// ── hypergeomAtLeast ──────────────────────────────────────────────────────────

describe('hypergeomAtLeast', () => {
  it('returns 1 when all cards are successes and we draw k', () => {
    // N=K=100, n=7, k=7 — we must draw 7 successes, and all cards are successes
    expect(hypergeomAtLeast(100, 100, 7, 7)).toBeCloseTo(1.0, 10);
  });

  it('returns 0 when there are no successes in the deck', () => {
    expect(hypergeomAtLeast(100, 0, 7, 1)).toBeCloseTo(0, 10);
  });

  it('equals exactly-k when asking for at-least-all-possible', () => {
    // N=10, K=2, n=2, k=2 — must draw both successes
    const exact = hypergeomExact(10, 2, 2, 2);
    const atLeast = hypergeomAtLeast(10, 2, 2, 2);
    expect(atLeast).toBeCloseTo(exact, 10);
  });

  it('calculates the singleton opening-hand draw chance', () => {
    // P(at least 1 success) for a singleton in a 99-card deck in 7 draws = 7/99
    expect(hypergeomAtLeast(99, 1, 7, 1)).toBeCloseTo(7 / 99, 5);
  });

  it('is never greater than 1', () => {
    expect(hypergeomAtLeast(60, 4, 7, 1)).toBeLessThanOrEqual(1.0);
  });

  it('increases as more copies are added to the deck', () => {
    // 4 copies in 60-card deck is more likely to see than 1 copy
    const p1 = hypergeomAtLeast(60, 1, 7, 1);
    const p4 = hypergeomAtLeast(60, 4, 7, 1);
    expect(p4).toBeGreaterThan(p1);
  });

  it('increases as more cards are drawn', () => {
    const p7 = hypergeomAtLeast(60, 4, 7, 1);   // opening hand
    const p14 = hypergeomAtLeast(60, 4, 14, 1); // 14 draws
    expect(p14).toBeGreaterThan(p7);
  });
});

// ── oddsOfDrawingByTurn ───────────────────────────────────────────────────────

describe('oddsOfDrawingByTurn', () => {
  it('at turn 1 equals hypergeomAtLeast for 7-card opening hand', () => {
    const opts = { librarySize: 60, copiesInDeck: 4, minCopies: 1, turn: 1 };
    const expected = hypergeomAtLeast(60, 4, 7, 1);
    expect(oddsOfDrawingByTurn(opts)).toBeCloseTo(expected, 10);
  });

  it('adds one draw per turn (turn 2 sees 8 cards)', () => {
    const opts = { librarySize: 60, copiesInDeck: 4, minCopies: 1, turn: 2 };
    const expected = hypergeomAtLeast(60, 4, 8, 1);
    expect(oddsOfDrawingByTurn(opts)).toBeCloseTo(expected, 10);
  });

  it('adds one more card when onDraw=true', () => {
    const base = oddsOfDrawingByTurn({ librarySize: 60, copiesInDeck: 4, minCopies: 1, turn: 1 });
    const onDraw = oddsOfDrawingByTurn({ librarySize: 60, copiesInDeck: 4, minCopies: 1, turn: 1, onDraw: true });
    // On-draw sees 8 cards vs 7; should be slightly higher
    expect(onDraw).toBeGreaterThan(base);
  });

  it('does not exceed 1', () => {
    const p = oddsOfDrawingByTurn({ librarySize: 20, copiesInDeck: 20, minCopies: 1, turn: 1 });
    expect(p).toBeLessThanOrEqual(1.0);
  });

  it('clips cardsSeen to librarySize', () => {
    // A 7-card library with 7 draws won't try to draw more than the library
    const p = oddsOfDrawingByTurn({ librarySize: 7, copiesInDeck: 1, minCopies: 1, turn: 1 });
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1.0);
  });

  it('returns near-zero for a singleton at turn 1 in a large deck', () => {
    const p = oddsOfDrawingByTurn({ librarySize: 99, copiesInDeck: 1, minCopies: 1, turn: 1 });
    expect(p).toBeCloseTo(7 / 99, 4);
  });
});
