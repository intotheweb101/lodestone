/**
 * Deep-link builders for US/EU card marketplaces.
 * Uses card name + set/collector to build direct purchase links.
 * No API keys or scraping — links go to the marketplace's own search/card pages.
 */

/** Build a TCGPlayer search URL for a named card (uses their search, not per-printing). */
export function tcgplayerSearchUrl(cardName: string): string {
  return `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(cardName)}&view=grid`;
}

/** Build a TCGPlayer URL for a specific printing (by Scryfall ID mapping via their API — not always available, so fall back to search). */
export function tcgplayerCardUrl(cardName: string, setCode: string, collectorNumber: string): string {
  // TCGPlayer doesn't expose a stable per-printing URL without their API, so use name search with set hint
  const query = `${cardName} ${setCode.toUpperCase()}`;
  return `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(query)}&view=grid`;
}

/** Build a Cardmarket (MKM) URL for a named card. */
export function cardmarketUrl(cardName: string, setCode: string): string {
  // Cardmarket's product name search — most reliable without per-printing IDs
  const encodedName = encodeURIComponent(cardName);
  return `https://www.cardmarket.com/en/Magic/Products/Singles?searchString=${encodedName}`;
}

/** Build a Card Kingdom URL for a named card. */
export function cardKingdomUrl(cardName: string): string {
  const slug = cardName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `https://www.cardkingdom.com/catalog/search?search=${encodeURIComponent(cardName)}&filter[tab]=mtg_singles`;
}
