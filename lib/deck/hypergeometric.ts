/**
 * Hypergeometric distribution — probability of drawing exactly k successes
 * in n draws from a population of N with K successes.
 *
 * P(X = k) = C(K,k) * C(N-K, n-k) / C(N, n)
 *
 * Uses log-gamma arithmetic to avoid overflow at N=100.
 */

function logGamma(x: number): number {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function logBinom(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/** P(X = k): exactly k successes */
export function hypergeomExact(N: number, K: number, n: number, k: number): number {
  const logP = logBinom(K, k) + logBinom(N - K, n - k) - logBinom(N, n);
  return Math.exp(logP);
}

/** P(X >= k): at least k successes */
export function hypergeomAtLeast(N: number, K: number, n: number, k: number): number {
  let p = 0;
  const maxK = Math.min(K, n);
  for (let i = k; i <= maxK; i++) p += hypergeomExact(N, K, n, i);
  return Math.min(1, p);
}

/**
 * Probability of drawing at least minCopies of a card (copies in deck) by turn T.
 * Accounts for the opening hand (7 cards) + draws each subsequent turn.
 * librarySize = deck size (commander decks are 99 excluding commander, or supply directly).
 */
export function oddsOfDrawingByTurn(opts: {
  librarySize: number;
  copiesInDeck: number;
  minCopies: number;
  turn: number;
  onDraw?: boolean;
}): number {
  const { librarySize, copiesInDeck, minCopies, turn, onDraw = false } = opts;
  // Cards seen = 7 opening hand + (turn - 1) draws + (onDraw ? 1 : 0)
  const cardsSeen = 7 + (turn - 1) + (onDraw ? 1 : 0);
  const n = Math.min(cardsSeen, librarySize);
  return hypergeomAtLeast(librarySize, copiesInDeck, n, minCopies);
}
