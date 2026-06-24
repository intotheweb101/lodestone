export interface ShopConfig {
  name: string;
  base_url: string;
  dialect: 'A' | 'B' | 'unknown';
  /** Collection handles to ingest. Products outside these are ignored. */
  collection_handles: string[];
  region: 'NZ' | 'AUS';
  /** false = skip during ingest (wrong platform, defunct domain, no MTG singles) */
  enabled: boolean;
}

export const SHOPS: ShopConfig[] = [
  // ── Active NZ (Shopify) ─────────────────────────────────────────────────────
  {
    name: 'Calico Keep',
    base_url: 'https://calicokeep.co.nz',
    dialect: 'A',
    collection_handles: ['mtg-singles-instock'],
    region: 'NZ',
    enabled: true,
  },
  {
    name: 'Shuffle n Cut',
    base_url: 'https://www.shuffleandcutgames.co.nz',
    dialect: 'A',
    collection_handles: ['mtg-singles-instock'],
    region: 'NZ',
    enabled: true,
  },
  {
    name: 'Card Merchant Auckland',
    base_url: 'https://cardmerchant.co.nz',
    dialect: 'B',
    collection_handles: ['mtg-singles-instock'],
    region: 'NZ',
    enabled: true,
  },
  {
    name: 'Card Merchant Christchurch',
    base_url: 'https://cardmerchantchristchurch.co.nz',
    dialect: 'B',
    collection_handles: ['mtg-singles'],
    region: 'NZ',
    enabled: true,
  },
  {
    name: 'Card Merchant Nelson',
    base_url: 'https://cardmerchantnelson.co.nz',
    dialect: 'B',
    collection_handles: ['mtg-singles-instock'],
    region: 'NZ',
    enabled: true,
  },
  {
    name: 'Card Merchant Hamilton',
    base_url: 'https://cardmerchanthamilton.co.nz',
    dialect: 'B',
    collection_handles: ['mtg-singles-instock'],
    region: 'NZ',
    enabled: true,
  },
  {
    name: 'Card Merchant Wellington',
    base_url: 'https://cardmerchantwellington.co.nz',
    dialect: 'B',
    collection_handles: ['magic-the-gathering-singles'],
    region: 'NZ',
    enabled: true,
  },
  // ── Active AUS (Shopify) ────────────────────────────────────────────────────
  {
    name: 'Gameology',
    base_url: 'https://gameology.com.au',
    dialect: 'A',
    collection_handles: ['magic-the-gathering-singles'],
    region: 'AUS',
    enabled: true,
  },
  {
    name: 'GUF',
    base_url: 'https://guf.com.au',
    dialect: 'A',
    collection_handles: ['mtg-singles'],
    region: 'AUS',
    enabled: true,
  },
];
