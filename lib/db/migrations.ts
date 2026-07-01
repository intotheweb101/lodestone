import { getDb } from './connection';

export function runMigrations(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS shops (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      base_url  TEXT NOT NULL UNIQUE,
      dialect   TEXT NOT NULL CHECK(dialect IN ('A','B','unknown')),
      collection_handles TEXT NOT NULL DEFAULT '["mtg-singles-instock"]',
      last_synced_at TEXT,
      enabled   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS shop_products (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id          INTEGER NOT NULL REFERENCES shops(id),
      shopify_id       TEXT NOT NULL,
      handle           TEXT NOT NULL,
      title            TEXT NOT NULL,
      card_name_norm   TEXT,
      set_name_norm    TEXT,
      set_code_norm    TEXT,
      collector_norm   TEXT,
      treatment_flags  TEXT NOT NULL DEFAULT '{}',
      product_url      TEXT,
      raw_json         TEXT,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(shop_id, shopify_id)
    );
    CREATE INDEX IF NOT EXISTS idx_products_shop ON shop_products(shop_id);
    CREATE INDEX IF NOT EXISTS idx_products_name ON shop_products(card_name_norm);

    CREATE TABLE IF NOT EXISTS shop_variants (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id     INTEGER NOT NULL REFERENCES shop_products(id),
      shop_id        INTEGER NOT NULL REFERENCES shops(id),
      shopify_var_id TEXT NOT NULL,
      finish         TEXT NOT NULL CHECK(finish IN ('nonfoil','foil','etched','unknown')),
      condition      TEXT NOT NULL,
      condition_rank INTEGER NOT NULL,
      price_nzd      REAL NOT NULL,
      available      INTEGER NOT NULL DEFAULT 0,
      sku            TEXT,
      match_key      TEXT,
      confidence     TEXT NOT NULL DEFAULT 'none' CHECK(confidence IN ('exact','probable','weak','none')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(shop_id, shopify_var_id)
    );
    CREATE INDEX IF NOT EXISTS idx_variants_match_key ON shop_variants(match_key);
    CREATE INDEX IF NOT EXISTS idx_variants_shop_available ON shop_variants(shop_id, available);
    CREATE INDEX IF NOT EXISTS idx_variants_product ON shop_variants(product_id);

    CREATE TABLE IF NOT EXISTS scryfall_cards (
      scryfall_id      TEXT PRIMARY KEY,
      oracle_id        TEXT NOT NULL,
      name             TEXT NOT NULL,
      name_norm        TEXT NOT NULL,
      set_code         TEXT NOT NULL,
      collector_number TEXT NOT NULL,
      finishes_json    TEXT NOT NULL DEFAULT '[]',
      frame_effects_json TEXT NOT NULL DEFAULT '[]',
      border_color     TEXT,
      full_art         INTEGER NOT NULL DEFAULT 0,
      promo_types_json TEXT,
      color_identity_json TEXT NOT NULL DEFAULT '[]',
      mana_cost        TEXT,
      cmc              REAL,
      type_line        TEXT,
      oracle_text      TEXT,
      rarity           TEXT,
      legalities_json  TEXT NOT NULL DEFAULT '{}',
      prices_json      TEXT NOT NULL DEFAULT '{}',
      image_uris_json  TEXT,
      card_faces_json  TEXT,
      prints_search_uri TEXT,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scryfall_oracle ON scryfall_cards(oracle_id);
    CREATE INDEX IF NOT EXISTS idx_scryfall_name_norm ON scryfall_cards(name_norm);
    CREATE INDEX IF NOT EXISTS idx_scryfall_set_col ON scryfall_cards(set_code, collector_number);

    CREATE TABLE IF NOT EXISTS sets (
      code       TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      name_norm  TEXT NOT NULL,
      set_type   TEXT,
      parent_set_code TEXT
    );

    CREATE TABLE IF NOT EXISTS decks (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      format      TEXT NOT NULL DEFAULT 'commander',
      commander   TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deck_entries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id         TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      oracle_id       TEXT NOT NULL,
      scryfall_id     TEXT,
      card_name       TEXT NOT NULL,
      quantity        INTEGER NOT NULL DEFAULT 1,
      is_commander    INTEGER NOT NULL DEFAULT 0,
      treatment       TEXT NOT NULL DEFAULT 'normal',
      finish          TEXT NOT NULL DEFAULT 'nonfoil',
      condition_floor TEXT NOT NULL DEFAULT 'lp',
      UNIQUE(deck_id, oracle_id)
    );
    CREATE INDEX IF NOT EXISTS idx_entries_deck ON deck_entries(deck_id);

    CREATE TABLE IF NOT EXISTS ingest_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id     INTEGER REFERENCES shops(id),
      started_at  TEXT NOT NULL,
      finished_at TEXT,
      products    INTEGER DEFAULT 0,
      variants    INTEGER DEFAULT 0,
      matched     INTEGER DEFAULT 0,
      errors      TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT,
      google_id TEXT UNIQUE,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

    CREATE TABLE IF NOT EXISTS user_collection (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      oracle_id TEXT NOT NULL,
      scryfall_id TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      foil INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, oracle_id, foil)
    );
    CREATE INDEX IF NOT EXISTS idx_collection_user ON user_collection(user_id);

    CREATE TABLE IF NOT EXISTS sync_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      auto_sync_enabled INTEGER NOT NULL DEFAULT 0,
      sync_interval_hours INTEGER NOT NULL DEFAULT 24,
      last_auto_sync_at TEXT
    );
    INSERT OR IGNORE INTO sync_settings (id, auto_sync_enabled, sync_interval_hours) VALUES (1, 0, 24);
  `);

  // Add role column to users if missing
  const userCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userCols.find(c => c.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }

  // Add region column to shops if missing
  const shopCols = db.prepare('PRAGMA table_info(shops)').all() as { name: string }[];
  if (!shopCols.find(c => c.name === 'region')) {
    db.exec("ALTER TABLE shops ADD COLUMN region TEXT NOT NULL DEFAULT 'NZ'");
  }
  if (!shopCols.find(c => c.name === 'currency')) {
    db.exec("ALTER TABLE shops ADD COLUMN currency TEXT NOT NULL DEFAULT 'NZD'");
    // Immediately seed AUS shops with AUD
    db.exec("UPDATE shops SET currency = 'AUD' WHERE region = 'AUS'");
  }
  if (!shopCols.find(c => c.name === 'shipping_flat')) {
    db.exec("ALTER TABLE shops ADD COLUMN shipping_flat REAL NOT NULL DEFAULT 0");
    // Seed reasonable flat-rate defaults (editable in admin)
    db.exec("UPDATE shops SET shipping_flat = 5.00 WHERE region = 'NZ'");
    db.exec("UPDATE shops SET shipping_flat = 10.00 WHERE region = 'AUS'");
  }
  if (!shopCols.find(c => c.name === 'free_shipping_threshold')) {
    db.exec("ALTER TABLE shops ADD COLUMN free_shipping_threshold REAL");
    // Common NZ free-shipping thresholds
    db.exec("UPDATE shops SET free_shipping_threshold = 100.00 WHERE region = 'NZ'");
    db.exec("UPDATE shops SET free_shipping_threshold = 150.00 WHERE region = 'AUS'");
  }
  if (!shopCols.find(c => c.name === 'enabled')) {
    db.exec("ALTER TABLE shops ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
  }

  // Add price_original / currency to shop_variants if missing
  const variantCols = db.prepare('PRAGMA table_info(shop_variants)').all() as { name: string }[];
  if (!variantCols.find(c => c.name === 'price_original')) {
    db.exec("ALTER TABLE shop_variants ADD COLUMN price_original REAL");
    // Back-fill: for existing NZ variants the original equals price_nzd
    db.exec("UPDATE shop_variants SET price_original = price_nzd");
  }
  if (!variantCols.find(c => c.name === 'currency')) {
    db.exec("ALTER TABLE shop_variants ADD COLUMN currency TEXT");
    // Back-fill from shop region; join is not possible in ALTER, do it with a subquery
    db.exec(`
      UPDATE shop_variants SET currency = (
        SELECT CASE WHEN s.region = 'AUS' THEN 'AUD' ELSE 'NZD' END
        FROM shops s WHERE s.id = shop_variants.shop_id
      )
    `);
  }

  // Add aud_nzd_rate to sync_settings if missing
  const syncCols = db.prepare('PRAGMA table_info(sync_settings)').all() as { name: string }[];
  if (!syncCols.find(c => c.name === 'aud_nzd_rate')) {
    db.exec("ALTER TABLE sync_settings ADD COLUMN aud_nzd_rate REAL NOT NULL DEFAULT 1.10");
  }

  // Add custom_price to deck_entries if missing
  const entryCols = db.prepare('PRAGMA table_info(deck_entries)').all() as { name: string }[];
  if (!entryCols.find(c => c.name === 'custom_price')) {
    db.exec("ALTER TABLE deck_entries ADD COLUMN custom_price REAL");
  }

  // Add custom_value to decks if missing (what the user paid for the deck as a whole)
  const deckCols = db.prepare('PRAGMA table_info(decks)').all() as { name: string }[];
  if (!deckCols.find(c => c.name === 'custom_value')) {
    db.exec("ALTER TABLE decks ADD COLUMN custom_value REAL");
  }

  // ── Cluster 1: Advanced search schema additions ────────────────────────────

  // New columns on scryfall_cards for pow:/tou:/loy:/kw: filters and rich card pages
  const scryCols = db.prepare('PRAGMA table_info(scryfall_cards)').all() as { name: string }[];
  const scryHas = (n: string) => scryCols.some(c => c.name === n);
  if (!scryHas('power'))         db.exec("ALTER TABLE scryfall_cards ADD COLUMN power TEXT");
  if (!scryHas('toughness'))     db.exec("ALTER TABLE scryfall_cards ADD COLUMN toughness TEXT");
  if (!scryHas('loyalty'))       db.exec("ALTER TABLE scryfall_cards ADD COLUMN loyalty TEXT");
  if (!scryHas('power_num'))     db.exec("ALTER TABLE scryfall_cards ADD COLUMN power_num REAL");
  if (!scryHas('toughness_num')) db.exec("ALTER TABLE scryfall_cards ADD COLUMN toughness_num REAL");
  if (!scryHas('loyalty_num'))   db.exec("ALTER TABLE scryfall_cards ADD COLUMN loyalty_num REAL");
  if (!scryHas('keywords_json')) db.exec("ALTER TABLE scryfall_cards ADD COLUMN keywords_json TEXT NOT NULL DEFAULT '[]'");
  if (!scryHas('colors_json'))   db.exec("ALTER TABLE scryfall_cards ADD COLUMN colors_json TEXT NOT NULL DEFAULT '[]'");
  // Cluster 2: rich card page additions
  if (!scryHas('artist'))        db.exec("ALTER TABLE scryfall_cards ADD COLUMN artist TEXT");
  if (!scryHas('flavor_text'))   db.exec("ALTER TABLE scryfall_cards ADD COLUMN flavor_text TEXT");
  if (!scryHas('released_at'))   db.exec("ALTER TABLE scryfall_cards ADD COLUMN released_at TEXT");

  // Indexes for new numeric columns (help pow:/tou:/loy: filters)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scry_rarity   ON scryfall_cards(rarity);
    CREATE INDEX IF NOT EXISTS idx_scry_cmc       ON scryfall_cards(cmc);
    CREATE INDEX IF NOT EXISTS idx_scry_power_num ON scryfall_cards(power_num);
    CREATE INDEX IF NOT EXISTS idx_scry_tou_num   ON scryfall_cards(toughness_num);
    CREATE INDEX IF NOT EXISTS idx_scry_loy_num   ON scryfall_cards(loyalty_num);
  `);

  // FTS5 external-content table for oracle-text search (o: filter)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS scryfall_fts USING fts5(
      oracle_text,
      name,
      type_line,
      content='scryfall_cards',
      content_rowid='rowid'
    );
  `);

  // Auto-rebuild FTS index when it's empty but base table has data
  // (happens on first run after migration on an existing install — no full re-sync needed)
  try {
    const ftsCount = (db.prepare('SELECT COUNT(*) as n FROM scryfall_fts').get() as { n: number }).n;
    const cardCount = (db.prepare('SELECT COUNT(*) as n FROM scryfall_cards').get() as { n: number }).n;
    if (ftsCount === 0 && cardCount > 0) {
      db.exec("INSERT INTO scryfall_fts(scryfall_fts) VALUES('rebuild')");
    }
  } catch {
    // FTS might not be available in all builds; silently skip
  }

  // Cluster 2: rulings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_rulings (
      id          TEXT PRIMARY KEY,
      oracle_id   TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'wotc',
      published_at TEXT NOT NULL,
      comment     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rulings_oracle ON card_rulings(oracle_id);
  `);

  // ── EDHREC card cache ─────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS edhrec_card_cache (
      oracle_id        TEXT PRIMARY KEY,
      slug             TEXT NOT NULL,
      salt             REAL,
      num_decks        INTEGER,
      potential_decks  INTEGER,
      top_commanders_json TEXT NOT NULL DEFAULT '[]',
      synergy_cards_json  TEXT NOT NULL DEFAULT '[]',
      fetched_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Cluster 0: Multi-user / social schema ─────────────────────────────────

  // Seed sentinel 'local' user so foreign-key refs to user_id='local' are valid
  db.exec(`
    INSERT OR IGNORE INTO users (id, email, name, role)
    VALUES ('local', 'local@localhost', 'Local User', 'user')
  `);

  // users: username (profile handle) + bio
  const userCols2 = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userCols2.find(c => c.name === 'username')) {
    db.exec("ALTER TABLE users ADD COLUMN username TEXT");
    // Backfill from email local-part
    db.exec(`UPDATE users SET username = LOWER(SUBSTR(email, 1, INSTR(email, '@') - 1)) WHERE username IS NULL`);
  }
  if (!userCols2.find(c => c.name === 'bio')) {
    db.exec("ALTER TABLE users ADD COLUMN bio TEXT");
  }

  // decks: user ownership + visibility + public sharing + primer description
  const deckCols2 = db.prepare('PRAGMA table_info(decks)').all() as { name: string }[];
  if (!deckCols2.find(c => c.name === 'user_id')) {
    db.exec("ALTER TABLE decks ADD COLUMN user_id TEXT REFERENCES users(id)");
    db.exec("UPDATE decks SET user_id = 'local'");
    db.exec("CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id)");
  }
  if (!deckCols2.find(c => c.name === 'visibility')) {
    db.exec("ALTER TABLE decks ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
    db.exec("CREATE INDEX IF NOT EXISTS idx_decks_visibility ON decks(visibility)");
  }
  if (!deckCols2.find(c => c.name === 'public_slug')) {
    db.exec("ALTER TABLE decks ADD COLUMN public_slug TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_decks_slug ON decks(public_slug) WHERE public_slug IS NOT NULL");
  }
  if (!deckCols2.find(c => c.name === 'description')) {
    db.exec("ALTER TABLE decks ADD COLUMN description TEXT");
  }
  if (!deckCols2.find(c => c.name === 'folder_id')) {
    db.exec("ALTER TABLE decks ADD COLUMN folder_id TEXT REFERENCES deck_folders(id) ON DELETE SET NULL");
  }
  if (!deckCols2.find(c => c.name === 'color_identity')) {
    db.exec("ALTER TABLE decks ADD COLUMN color_identity TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_decks_format ON decks(format)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_decks_ci ON decks(color_identity)");
    // Backfill: compute WUBRG color identity for every existing deck
    const WUBRG = ['W', 'U', 'B', 'R', 'G'];
    const allDecks = db.prepare("SELECT id FROM decks").all() as { id: string }[];
    const ciStmt = db.prepare("UPDATE decks SET color_identity = ? WHERE id = ?");
    const ciBackfill = db.transaction(() => {
      for (const { id } of allDecks) {
        const rows = db.prepare(`
          SELECT sc.color_identity_json
          FROM deck_entries de
          JOIN scryfall_cards sc ON sc.oracle_id = de.oracle_id
          WHERE de.deck_id = ? AND (de.board = 'main' OR de.board IS NULL)
        `).all(id) as { color_identity_json: string }[];
        const colorSet = new Set<string>();
        for (const row of rows) {
          try { for (const c of JSON.parse(row.color_identity_json || '[]')) colorSet.add(c as string); } catch {}
        }
        ciStmt.run(WUBRG.filter(c => colorSet.has(c)).join('') || null, id);
      }
    });
    ciBackfill();
  }

  // Social tables: folders, likes, comments
  db.exec(`
    CREATE TABLE IF NOT EXISTS deck_folders (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      sort       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_folders_user ON deck_folders(user_id);

    CREATE TABLE IF NOT EXISTS deck_likes (
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deck_id    TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, deck_id)
    );
    CREATE INDEX IF NOT EXISTS idx_likes_deck ON deck_likes(deck_id);

    CREATE TABLE IF NOT EXISTS deck_comments (
      id         TEXT PRIMARY KEY,
      deck_id    TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      parent_id  TEXT REFERENCES deck_comments(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_comments_deck ON deck_comments(deck_id);
  `);

  // Wishlist: cards users want to buy (feeds the NZ shopping-list optimizer)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_wishlist (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      oracle_id       TEXT NOT NULL,
      scryfall_id     TEXT,
      quantity        INTEGER NOT NULL DEFAULT 1,
      finish          TEXT NOT NULL DEFAULT 'nonfoil',
      condition_floor TEXT NOT NULL DEFAULT 'lp',
      priority        INTEGER NOT NULL DEFAULT 0,
      notes           TEXT,
      card_name       TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, oracle_id, finish)
    );
    CREATE INDEX IF NOT EXISTS idx_wishlist_user ON user_wishlist(user_id);
  `);

  // Following/followers
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_follows (
      follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (follower_id, followee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);
    CREATE INDEX IF NOT EXISTS idx_follows_followee ON user_follows(followee_id);
  `);

  // Notifications
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      deck_id    TEXT REFERENCES decks(id) ON DELETE SET NULL,
      comment_id TEXT REFERENCES deck_comments(id) ON DELETE SET NULL,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, read);
  `);

  // Deck tags: free-form labels on a deck
  db.exec(`
    CREATE TABLE IF NOT EXISTS deck_tags (
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      tag     TEXT NOT NULL,
      PRIMARY KEY (deck_id, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_deck_tags_tag ON deck_tags(tag);
  `);

  // Card category (custom group label, e.g. "Ramp", "Removal")
  const entryColumns3b = (db.prepare("PRAGMA table_info(deck_entries)").all() as {name: string}[]).map(r => r.name);
  if (!entryColumns3b.includes('category')) {
    db.exec("ALTER TABLE deck_entries ADD COLUMN category TEXT");
  }
  if (!entryColumns3b.includes('commander_role')) {
    db.exec("ALTER TABLE deck_entries ADD COLUMN commander_role TEXT");
  }

  // Seed shops using INSERT OR IGNORE so re-runs are safe
  const insert = db.prepare(`
    INSERT OR IGNORE INTO shops (id, name, base_url, dialect, collection_handles, region, currency, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Dead/excluded shops (Vagabond, Battle Geek Plus, Wizard's Retreat, MTG Oasis, Good Games)
  // are intentionally absent from seedShops — they are not seeded at all, not seeded as enabled=0.
  const seedShops: [number, string, string, string, string, string, string, number][] = [
    [1,  'Calico Keep',                'https://calicokeep.co.nz',                 'A', '["mtg-singles-instock"]',              'NZ',  'NZD', 1],
    [2,  'Shuffle n Cut',              'https://www.shuffleandcutgames.co.nz',      'A', '["mtg-singles-instock"]',              'NZ',  'NZD', 1],
    [3,  'Card Merchant Auckland',     'https://cardmerchant.co.nz',               'B', '["mtg-singles-instock"]',              'NZ',  'NZD', 1],
    [4,  'Card Merchant Christchurch', 'https://cardmerchantchristchurch.co.nz',   'B', '["mtg-singles-instock"]',              'NZ',  'NZD', 1],
    [5,  'Card Merchant Nelson',       'https://cardmerchantnelson.co.nz',         'B', '["mtg-singles-instock"]',              'NZ',  'NZD', 1],
    [11, 'Gameology',                  'https://gameology.com.au',                 'A', '["magic-the-gathering-singles"]',      'AUS', 'AUD', 1],
    [13, 'Card Merchant Hamilton',     'https://cardmerchanthamilton.co.nz',       'B', '["mtg-singles-instock"]',              'NZ',  'NZD', 1],
    [14, 'Card Merchant Wellington',   'https://cardmerchantwellington.co.nz',     'B', '["magic-the-gathering-singles"]',      'NZ',  'NZD', 1],
    [15, 'GUF',                        'https://guf.com.au',                       'A', '["mtg-singles"]',                     'AUS', 'AUD', 1],
  ];
  const insertAll = db.transaction(() => {
    for (const [id, name, url, dialect, handles, region, currency, enabled] of seedShops) {
      insert.run(id, name, url, dialect, handles, region, currency, enabled);
    }
  });
  insertAll();

  // EDHREC card data cache (7-day TTL, lazy-fetched on first card page view)
  db.exec(`
    CREATE TABLE IF NOT EXISTS edhrec_card_cache (
      oracle_id        TEXT PRIMARY KEY,
      slug             TEXT NOT NULL,
      salt             REAL,
      num_decks        INTEGER,
      potential_decks  INTEGER,
      top_commanders_json TEXT NOT NULL DEFAULT '[]',
      synergy_cards_json  TEXT NOT NULL DEFAULT '[]',
      raw_json         TEXT,
      fetched_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Board column on deck_entries — requires table rebuild to change UNIQUE constraint
  // from (deck_id, oracle_id) to (deck_id, oracle_id, board) so the same card can appear
  // in mainboard and sideboard independently.
  const entryCols5 = db.prepare('PRAGMA table_info(deck_entries)').all() as { name: string }[];
  if (!entryCols5.find(c => c.name === 'board')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE deck_entries_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        deck_id         TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        oracle_id       TEXT NOT NULL,
        scryfall_id     TEXT,
        card_name       TEXT NOT NULL,
        quantity        INTEGER NOT NULL DEFAULT 1,
        is_commander    INTEGER NOT NULL DEFAULT 0,
        treatment       TEXT NOT NULL DEFAULT 'normal',
        finish          TEXT NOT NULL DEFAULT 'nonfoil',
        condition_floor TEXT NOT NULL DEFAULT 'lp',
        custom_price    REAL,
        board           TEXT NOT NULL DEFAULT 'main',
        UNIQUE(deck_id, oracle_id, board)
      )
    `);
    db.exec(`
      INSERT INTO deck_entries_new
        (id, deck_id, oracle_id, scryfall_id, card_name, quantity, is_commander,
         treatment, finish, condition_floor, custom_price, board)
      SELECT id, deck_id, oracle_id, scryfall_id, card_name, quantity, is_commander,
             treatment, finish, condition_floor, custom_price, 'main'
      FROM deck_entries
    `);
    db.exec('DROP TABLE deck_entries');
    db.exec('ALTER TABLE deck_entries_new RENAME TO deck_entries');
    db.exec('CREATE INDEX IF NOT EXISTS idx_entries_deck ON deck_entries(deck_id)');
    db.pragma('foreign_keys = ON');
  }

  // Price history — captures best available price per match_key on each sync pass
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      match_key   TEXT NOT NULL,
      shop_id     INTEGER NOT NULL REFERENCES shops(id),
      finish      TEXT NOT NULL,
      condition   TEXT NOT NULL,
      price_nzd   REAL NOT NULL,
      available   INTEGER NOT NULL DEFAULT 0,
      captured_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_price_hist_key ON price_history(match_key, captured_at DESC);
  `);
  // Day-unique index: at most one price_history row per (match_key, shop_id, finish) per calendar day
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_price_hist_day
    ON price_history(match_key, shop_id, finish, date(captured_at));
  `);

  // Fix Card Merchant Christchurch handle — was 'mtg-singles-instock' (returns empty), correct is 'mtg-singles'
  // seedShops uses INSERT OR IGNORE so config changes don't auto-propagate; this one-time UPDATE does.
  db.prepare(`
    UPDATE shops SET collection_handles = '["mtg-singles"]'
    WHERE base_url = 'https://cardmerchantchristchurch.co.nz'
    AND collection_handles = '["mtg-singles-instock"]'
  `).run();

  // Reverse-lookup index: allows fast "decks using this card" queries (Phase 2A)
  db.exec('CREATE INDEX IF NOT EXISTS idx_entries_oracle ON deck_entries(oracle_id)');

  // Add note_text column to notifications for system-generated alerts (idempotent)
  try {
    db.exec('ALTER TABLE notifications ADD COLUMN note_text TEXT');
  } catch { /* column already exists — no-op */ }

  // ── Phase 1 feature tables ──────────────────────────────────────────────────

  // Combo cache: keyed by hash of sorted card names; TTL-expired by client
  db.exec(`
    CREATE TABLE IF NOT EXISTS combo_cache (
      deck_hash  TEXT PRIMARY KEY,
      result_json TEXT NOT NULL,
      fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Bracket cache: same key as combo cache, separate entry
  db.exec(`
    CREATE TABLE IF NOT EXISTS bracket_cache (
      deck_hash  TEXT PRIMARY KEY,
      result_json TEXT NOT NULL,
      fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Card packages + entries
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_packages (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS package_entries (
      id          TEXT PRIMARY KEY,
      package_id  TEXT NOT NULL REFERENCES card_packages(id) ON DELETE CASCADE,
      oracle_id   TEXT NOT NULL,
      card_name   TEXT NOT NULL,
      quantity    INTEGER NOT NULL DEFAULT 1,
      board       TEXT NOT NULL DEFAULT 'main',
      category    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pkg_entries_pkg ON package_entries(package_id);
  `);

  // Deck version history
  db.exec(`
    CREATE TABLE IF NOT EXISTS deck_versions (
      id            TEXT PRIMARY KEY,
      deck_id       TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      label         TEXT,
      snapshot_json TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_deck_versions_deck ON deck_versions(deck_id, created_at DESC);
  `);

  // Price alerts
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      oracle_id    TEXT NOT NULL,
      card_name    TEXT NOT NULL,
      match_key    TEXT,
      finish       TEXT NOT NULL DEFAULT 'nonfoil',
      target_nzd   REAL NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      triggered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_price_alerts_user  ON price_alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_price_alerts_match ON price_alerts(match_key);
  `);

  // ── 3A: Game logging ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS deck_games (
      id                TEXT PRIMARY KEY,
      deck_id           TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      result            TEXT NOT NULL,
      turns             INTEGER,
      opponent          TEXT,
      opponent_archetype TEXT,
      notes             TEXT,
      played_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_games_deck ON deck_games(deck_id);
    CREATE INDEX IF NOT EXISTS idx_games_user ON deck_games(user_id);
  `);

  // ── 3B: Trade binder — for_trade column on user_collection ───────────────────
  try {
    db.exec(`ALTER TABLE user_collection ADD COLUMN for_trade INTEGER NOT NULL DEFAULT 0`);
  } catch { /* already exists */ }

  // ── 4A: Password reset tokens ─────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
  `);

  // ── 5A: Card-level comments & upvotes ────────────────────────────────────────
  db.prepare(`
    CREATE TABLE IF NOT EXISTS card_comments (
      id          TEXT PRIMARY KEY,
      oracle_id   TEXT NOT NULL,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body        TEXT NOT NULL,
      parent_id   TEXT REFERENCES card_comments(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_card_comments_oracle ON card_comments(oracle_id)`).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS card_upvotes (
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      oracle_id   TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, oracle_id)
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_card_upvotes_oracle ON card_upvotes(oracle_id)`).run();

  // ── 5C: API keys ─────────────────────────────────────────────────────────────
  db.prepare(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_hash     TEXT NOT NULL UNIQUE,
      label        TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      revoked_at   TEXT
    )
  `).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`).run();

  // ── 7G: Sets table extensions + released_at index ───────────────────────────
  try { db.exec('ALTER TABLE sets ADD COLUMN released_at TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE sets ADD COLUMN card_count INTEGER'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE sets ADD COLUMN icon_svg_uri TEXT'); } catch { /* already exists */ }
  db.exec('CREATE INDEX IF NOT EXISTS idx_scryfall_released ON scryfall_cards(released_at DESC)');

  // ── 7F: Collection value history ────────────────────────────────────────────
  // Snapshots are written once per day by the scheduler after each sync.
  // Cannot be backfilled — accumulates from when this migration first runs.
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_value_history (
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snapshot_date TEXT NOT NULL,
      value_usd     REAL NOT NULL,
      card_count    INTEGER NOT NULL,
      PRIMARY KEY (user_id, snapshot_date)
    );
    CREATE INDEX IF NOT EXISTS idx_cvh_user ON collection_value_history(user_id, snapshot_date DESC);
  `);

  // ── User profile: pinned deck ─────────────────────────────────────────────
  const userColsPinned = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userColsPinned.find(c => c.name === 'pinned_deck_id')) {
    db.exec('ALTER TABLE users ADD COLUMN pinned_deck_id TEXT REFERENCES decks(id) ON DELETE SET NULL');
  }

  // Remove defunct/non-Shopify shops from existing DBs (idempotent — no-op if already gone)
  const deadUrls = [
    'https://vagabond.co.nz',
    'https://battlegeekplus.co.nz',
    'https://wizardsretreat.co.nz',
    'https://goodgames.com.au',
    'https://eternalgames.com.au',
    'https://mtgoasis.com.au',
  ];
  const deadIds = (db.prepare(
    `SELECT id FROM shops WHERE base_url IN (${deadUrls.map(() => '?').join(',')})`
  ).all(...deadUrls) as { id: number }[]).map(r => r.id);
  if (deadIds.length > 0) {
    const ph = deadIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM price_history WHERE shop_id IN (${ph})`).run(...deadIds);
    db.prepare(`DELETE FROM ingest_log WHERE shop_id IN (${ph})`).run(...deadIds);
    db.prepare(`DELETE FROM shop_variants WHERE shop_id IN (${ph})`).run(...deadIds);
    db.prepare(`DELETE FROM shop_products WHERE shop_id IN (${ph})`).run(...deadIds);
    db.prepare(`DELETE FROM shops WHERE id IN (${ph})`).run(...deadIds);
  }

  // User blocks and content reports (Phase 3 — community moderation)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (blocker_id, blocked_id)
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON user_blocks(blocker_id);
    CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON user_blocks(blocked_id);

    CREATE TABLE IF NOT EXISTS content_reports (
      id          TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK(target_type IN ('deck_comment','card_comment','deck')),
      target_id   TEXT NOT NULL,
      reason      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status);
    CREATE INDEX IF NOT EXISTS idx_reports_target ON content_reports(target_type, target_id);
  `);
}
