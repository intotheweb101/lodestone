'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Deck } from '@/lib/deck/model';
import { isLegal, mainboardEntries } from '@/lib/deck/model';
import { renderMarkdown } from '@/lib/markdown/render';
import { DeckEntryRow, ManaIcon, Btn } from '@/components/ui';
import { LegalityBadge } from '@/components/legality-badge';
import { SharePanel } from '@/components/share-panel';
import { PlaytestModal } from '@/components/playtest-modal';
import { NzPricePanel } from '@/components/nz-price-panel';
import { ShoppingListPanel } from '@/components/shopping-list-panel';
import {
  actionAddCard, actionRemoveCard, actionUpdateEntry, actionImportDecklist,
  actionSetCommander, actionSetDeckSpend, actionUpdateDeckMeta, actionCloneDeck,
  actionDeleteDeck, actionSetDeckTags, actionSetEntryCategory, actionSetCommanderRole2,
  actionAddToWishlist, actionAddMissingToWishlist,
} from '@/app/actions';

interface CardSearchResult {
  scryfall_id: string;
  oracle_id: string;
  name: string;
  set_code: string;
  type_line: string | null;
  mana_cost: string | null;
  image_url: string | null;
  color_identity: string[];
}

interface PricedDeck {
  card_results: {
    entry_id: string;
    card_name: string;
    best_price: { price_nzd: number; shop_name: string; product_url: string | null } | null;
    not_found: boolean;
  }[];
  best_per_card_total: number;
  fewest_shops_basket: { entry_id: string; card_name: string; shop_name: string; price_nzd: number; product_url: string | null }[];
  fewest_shops_total: number;
  fewest_shops_count: number;
  not_found_count: number;
  as_of: string;
}

interface Recommendation {
  type: string;
  severity: string;
  title: string;
  detail: string;
  card_name?: string;
}

type Tab = 'list' | 'price' | 'buy-missing' | 'recommend' | 'analytics' | 'import' | 'primer';

interface ShopMeta {
  name: string;
  base_url: string;
  shipping_flat: number | null;
  free_threshold: number | null;
}

export function DeckBuilderClient({ deck: initialDeck, shopMeta }: { deck: Deck; shopMeta: Record<number, ShopMeta> }) {
  const [deck, setDeck] = useState(initialDeck);
  const [tags, setTags] = useState<string[]>(initialDeck.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [tab, setTab] = useState<Tab>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CardSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pricedDeck, setPricedDeck] = useState<PricedDeck | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<{ added: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [collection, setCollection] = useState<Record<string, { have: number; foil_have: number }>>({});
  const [cardPanel, setCardPanel] = useState<{ scryfallId: string; name: string } | null>(null);
  const [editCard, setEditCard] = useState<{ oracle_id: string; scryfall_id: string | null; card_name: string; quantity: number; treatment: string; finish: string; custom_price: number | null } | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('list');

  useEffect(() => {
    const stored = localStorage.getItem('lodestone-view-mode');
    if (stored === 'gallery' || stored === 'list') setViewMode(stored);
  }, []);

  function setAndStoreViewMode(v: 'list' | 'gallery') {
    setViewMode(v);
    localStorage.setItem('lodestone-view-mode', v);
  }
  const [imageMap, setImageMap] = useState<Record<string, string | null>>({});
  const [boardTab, setBoardTab] = useState<'main' | 'side' | 'maybe'>('main');
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [showPlaytest, setShowPlaytest] = useState(false);
  const [cloningDeck, setCloningDeck] = useState(false);

  const refreshDeck = useCallback(async () => {
    const res = await fetch(`/api/deck/${deck.id}`);
    if (res.ok) {
      const updated = await res.json() as Deck;
      setDeck(updated);
    }
  }, [deck.id]);

  const loadCollection = useCallback(async () => {
    try {
      const res = await fetch(`/api/deck/${deck.id}/collection`);
      if (res.ok) {
        const data = await res.json() as { owned: Record<string, { have: number; foil_have: number }> };
        setCollection(data.owned ?? {});
      }
    } catch {}
  }, [deck.id]);

  useEffect(() => { loadCollection(); }, [loadCollection]);

  async function toggleImages() {
    const next = !showImages;
    setShowImages(next);
    if (next && Object.keys(imageMap).length === 0) {
      const res = await fetch(`/api/deck/${deck.id}/images`);
      if (res.ok) {
        const data = await res.json() as { images: Record<string, string | null> };
        setImageMap(data.images);
      }
    }
  }

  async function ensureImagesLoaded() {
    if (Object.keys(imageMap).length === 0) {
      const res = await fetch(`/api/deck/${deck.id}/images`);
      if (res.ok) {
        const data = await res.json() as { images: Record<string, string | null> };
        setImageMap(data.images);
      }
    }
  }

  useEffect(() => {
    if (viewMode === 'gallery') ensureImagesLoaded();
  }, [viewMode]);

  async function setCommander(oracleId: string) {
    await actionSetCommander(deck.id, oracleId);
    await refreshDeck();
  }

  function downloadText(content: string, filename: string, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const safeName = deck.name.replace(/[^a-z0-9]/gi, '_');
  const cmdrEntry = deck.entries.find(e => e.is_commander);
  const mainEntries = deck.entries.filter(e => !e.is_commander && (!e.board || e.board === 'main'));
  const sideEntries = deck.entries.filter(e => e.board === 'side');
  const maybeEntries = deck.entries.filter(e => e.board === 'maybe');

  function exportPlainText() {
    const lines: string[] = [];
    if (cmdrEntry) { lines.push('Commander'); lines.push(`1 ${cmdrEntry.card_name}`); lines.push(''); }
    lines.push('Deck');
    for (const e of mainEntries) lines.push(`${e.quantity} ${e.card_name}`);
    if (sideEntries.length) { lines.push(''); lines.push('Sideboard'); for (const e of sideEntries) lines.push(`${e.quantity} ${e.card_name}`); }
    if (maybeEntries.length) { lines.push(''); lines.push('Maybeboard'); for (const e of maybeEntries) lines.push(`${e.quantity} ${e.card_name}`); }
    downloadText(lines.join('\n'), `${safeName}.txt`);
  }

  function exportArena() {
    const lines: string[] = [];
    if (cmdrEntry) { lines.push('Commander'); lines.push(`1 ${cmdrEntry.card_name}`); lines.push(''); }
    lines.push('Deck');
    for (const e of mainEntries) lines.push(`${e.quantity} ${e.card_name}`);
    if (sideEntries.length) { lines.push(''); lines.push('Sideboard'); for (const e of sideEntries) lines.push(`${e.quantity} ${e.card_name}`); }
    downloadText(lines.join('\n'), `${safeName}_arena.txt`);
  }

  function exportMTGO() {
    const lines: string[] = [];
    if (cmdrEntry) lines.push(`1 ${cmdrEntry.card_name}`);
    for (const e of mainEntries) lines.push(`${e.quantity} ${e.card_name}`);
    for (const e of sideEntries) lines.push(`SB: ${e.quantity} ${e.card_name}`);
    downloadText(lines.join('\n'), `${safeName}.dec`);
  }

  function exportCSV() {
    const rows = ['name,quantity,board,finish,treatment'];
    if (cmdrEntry) rows.push(`"${cmdrEntry.card_name}",1,commander,${cmdrEntry.finish},${cmdrEntry.treatment}`);
    for (const e of mainEntries) rows.push(`"${e.card_name}",${e.quantity},main,${e.finish},${e.treatment}`);
    for (const e of sideEntries) rows.push(`"${e.card_name}",${e.quantity},side,${e.finish},${e.treatment}`);
    for (const e of maybeEntries) rows.push(`"${e.card_name}",${e.quantity},maybe,${e.finish},${e.treatment}`);
    downloadText(rows.join('\n'), `${safeName}.csv`, 'text/csv');
  }

  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const [bulkOwning, setBulkOwning] = useState(false);

  async function markAllOwned(owned: boolean) {
    const allEntries = [...(deck.entries.find(e => e.is_commander) ? [deck.entries.find(e => e.is_commander)!] : []), ...deck.entries.filter(e => !e.is_commander)];
    setBulkOwning(true);
    const optimistic: Record<string, { have: number; foil_have: number }> = {};
    for (const e of allEntries) optimistic[e.oracle_id] = { have: owned ? e.quantity : 0, foil_have: 0 };
    setCollection(prev => ({ ...prev, ...optimistic }));
    try {
      await Promise.all(allEntries.map(e =>
        fetch('/api/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oracle_id: e.oracle_id, scryfall_id: e.scryfall_id, quantity: owned ? e.quantity : 0, foil: false }),
        })
      ));
    } finally {
      setBulkOwning(false);
    }
  }

  async function toggleOwned(oracleId: string, scryfallId: string, cardName: string, neededQty: number) {
    const current = collection[oracleId];
    const alreadyHave = (current?.have ?? 0) + (current?.foil_have ?? 0) >= neededQty;
    const newQty = alreadyHave ? 0 : neededQty;
    // Optimistic update
    setCollection(prev => ({
      ...prev,
      [oracleId]: { have: newQty, foil_have: 0 },
    }));
    try {
      await fetch('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oracle_id: oracleId, scryfall_id: scryfallId, quantity: newQty, foil: false }),
      });
    } catch {
      // Revert on failure
      setCollection(prev => ({ ...prev, [oracleId]: current ?? { have: 0, foil_have: 0 } }));
    }
  }

  async function searchCards(q: string) {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json() as { cards: CardSearchResult[] };
      setSearchResults(data.cards ?? []);
    } finally {
      setSearching(false);
    }
  }

  async function addCard(card: CardSearchResult, isCommander = false) {
    const board = isCommander ? 'main' : boardTab;
    await actionAddCard(deck.id, {
      oracle_id: card.oracle_id,
      scryfall_id: card.scryfall_id,
      card_name: card.name,
      quantity: 1,
      is_commander: isCommander,
      board,
    });
    setDeck(prev => ({
      ...prev,
      entries: prev.entries.some(e => e.oracle_id === card.oracle_id && (e.board ?? 'main') === board)
        ? prev.entries
        : [...prev.entries, {
            oracle_id: card.oracle_id,
            scryfall_id: card.scryfall_id,
            card_name: card.name,
            quantity: 1,
            is_commander: isCommander,
            treatment: 'normal',
            finish: 'nonfoil',
            condition_floor: 'lp',
            board,
          }],
    }));
    setSearchQuery('');
    setSearchResults([]);
  }

  async function removeCard(oracleId: string, board?: string) {
    await actionRemoveCard(deck.id, oracleId, board);
    setDeck(prev => ({
      ...prev,
      entries: prev.entries.filter(e =>
        !(e.oracle_id === oracleId && (board ? (e.board ?? 'main') === board : true))
      ),
    }));
    setPricedDeck(null);
  }

  async function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!tag || tags.includes(tag)) return;
    const next = [...tags, tag];
    setTags(next);
    setTagInput('');
    await actionSetDeckTags(deck.id, next);
  }

  async function removeTag(tag: string) {
    const next = tags.filter(t => t !== tag);
    setTags(next);
    await actionSetDeckTags(deck.id, next);
  }

  async function handleClone() {
    setCloningDeck(true);
    try {
      const result = await actionCloneDeck(deck.id);
      if (result) window.location.href = `/decks/${result.id}`;
    } finally {
      setCloningDeck(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${deck.name}"? This cannot be undone.`)) return;
    await actionDeleteDeck(deck.id);
    // actionDeleteDeck redirects server-side; belt-and-suspenders fallback:
    window.location.href = '/decks';
  }

  async function priceWholeDeck() {
    setLoadingPrices(true);
    setPricedDeck(null);
    try {
      const res = await fetch('/api/deck/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deck_id: deck.id }),
      });
      const data = await res.json() as PricedDeck;
      setPricedDeck(data);
    } finally {
      setLoadingPrices(false);
    }
  }

  async function getRecommendations() {
    setLoadingRecs(true);
    setRecommendations(null);
    try {
      const res = await fetch(`/api/deck/${deck.id}/recommend`);
      const data = await res.json() as { recommendations: Recommendation[] };
      setRecommendations(data.recommendations ?? []);
    } finally {
      setLoadingRecs(false);
    }
  }

  async function handleImport() {
    if (!importText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await actionImportDecklist(deck.id, importText);
      setImportResult(result);
      await refreshDeck();
      if (result.errors.length === 0) setTab('list');
    } finally {
      setImporting(false);
    }
  }

  const commandZone = deck.entries.filter(e => e.is_commander);
  const companion = deck.entries.find(e => e.commander_role === 'companion');
  const commander = commandZone[0] ?? null;
  const mainboard = deck.entries.filter(e => !e.is_commander && e.commander_role !== 'companion' && (!e.board || e.board === 'main'));
  const displayedMainboard = filterCategory ? mainboard.filter(e => (e.category ?? 'Other') === filterCategory) : mainboard;
  const sideboard = deck.entries.filter(e => e.board === 'side');
  const maybeboard = deck.entries.filter(e => e.board === 'maybe');
  const totalCards = commandZone.length + mainboard.reduce((s, e) => s + e.quantity, 0);

  const priceMap = new Map<string, number>();
  // Custom prices always win; market prices fill the rest
  for (const e of deck.entries) {
    if (e.custom_price != null) priceMap.set(e.oracle_id, e.custom_price);
  }
  if (pricedDeck) {
    for (const r of pricedDeck.card_results) {
      if (!priceMap.has(r.entry_id) && r.best_price) priceMap.set(r.entry_id, r.best_price.price_nzd);
    }
  }

  const tabs: [Tab, string][] = [
    ['list', 'Decklist'],
    ['price', 'NZ Prices'],
    ['buy-missing', 'Buy Missing'],
    ['analytics', 'Analytics'],
    ['recommend', 'Improve'],
    ['primer', 'Primer'],
    ['import', 'Import'],
  ];

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>
      {cardPanel && (
        <CardDetailPanel
          scryfallId={cardPanel.scryfallId}
          name={cardPanel.name}
          onClose={() => setCardPanel(null)}
        />
      )}
      {editCard && (
        <EditCardPanel
          deckId={deck.id}
          oracleId={editCard.oracle_id}
          cardName={editCard.card_name}
          currentScryfallId={editCard.scryfall_id}
          currentQuantity={editCard.quantity}
          currentTreatment={editCard.treatment}
          currentFinish={editCard.finish}
          currentCustomPrice={editCard.custom_price}
          onClose={() => setEditCard(null)}
          onSaved={async () => { setEditCard(null); await refreshDeck(); }}
        />
      )}
      {showPlaytest && (
        <PlaytestModal
          entries={deck.entries}
          deckName={deck.name}
          onClose={() => setShowPlaytest(false)}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <a href="/decks" style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          color: 'var(--text-faint)', fontSize: '12px', textDecoration: 'none',
          marginBottom: '10px',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          ← Decks
        </a>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '6px' }}>
              {deck.name}
            </h1>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <FormatBadge format={deck.format} />
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '12px', color: 'var(--text-faint)',
              }}>
                {totalCards} / {deck.format === 'commander' ? '100' : '60'}
              </span>
              {(() => { const l = isLegal(deck); return <LegalityBadge legal={l.legal} reason={l.reason} />; })()}
              {commander && (
                <span style={{ fontSize: '12.5px', color: 'var(--accent)', fontStyle: 'italic' }}>
                  {commander.card_name}
                </span>
              )}
              {pricedDeck && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  background: 'rgba(84,192,138,0.1)', border: '1px solid rgba(84,192,138,0.28)',
                  color: '#7fd6a6', fontSize: '12px', padding: '3px 10px', borderRadius: '20px',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#54c08a', flexShrink: 0 }} />
                  NZD ${pricedDeck.best_per_card_total.toFixed(2)}
                </span>
              )}
            </div>
            {/* Tags */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
              {tags.map(t => (
                <span key={t} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: '20px', padding: '2px 10px', fontSize: 11,
                  fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-muted)',
                }}>
                  {t}
                  <button onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 11, padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } }}
                onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                placeholder="+ add tag"
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  fontSize: 11, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace",
                  width: tagInput ? `${tagInput.length + 2}ch` : '7ch', minWidth: '7ch',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
            <SharePanel
              deckId={deck.id}
              initialVisibility={(deck.visibility ?? 'private') as import('@/lib/deck/model').DeckVisibility}
              initialSlug={deck.public_slug ?? null}
            />
            <Btn onClick={() => setShowPlaytest(true)} disabled={mainboard.length === 0 && !commander}>
              ▶ Playtest
            </Btn>
            <Btn onClick={handleClone} disabled={cloningDeck}>
              {cloningDeck ? 'Cloning…' : '⊕ Clone'}
            </Btn>
            <Btn onClick={handleDelete} variant="danger">
              🗑 Delete
            </Btn>
            <Btn onClick={priceWholeDeck} disabled={loadingPrices || deck.entries.length === 0}>
              {loadingPrices ? 'Pricing…' : '✦ Price deck'}
            </Btn>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
        {tabs.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 14px',
            background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
            color: tab === t ? 'var(--text)' : 'var(--text-faint)',
            fontWeight: tab === t ? 600 : 400,
            fontSize: '13px',
            cursor: 'pointer',
            marginBottom: '-1px',
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}>
            {label}
            {t === 'price' && pricedDeck && (
              <span style={{
                marginLeft: '5px',
                fontFamily: "'IBM Plex Mono', monospace",
                color: '#7fd6a6', fontSize: '11px',
              }}>
                ${pricedDeck.best_per_card_total.toFixed(0)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Decklist */}
      {tab === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: '1.5rem', alignItems: 'start' }}>
          <div>
            {/* List toolbar */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex' }}>
                <button onClick={() => setAndStoreViewMode('list')} title="List view" style={{
                  fontSize: 11, padding: '5px 9px', cursor: 'pointer',
                  borderRadius: '7px 0 0 7px', border: '1px solid #214a47',
                  background: viewMode === 'list' ? '#1a3c3a' : '#0e292b',
                  color: viewMode === 'list' ? '#e8b14a' : '#6f8a85',
                }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <line x1="1" y1="4" x2="15" y2="4"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="1" y1="12" x2="15" y2="12"/>
                  </svg>
                </button>
                <button onClick={() => setAndStoreViewMode('gallery')} title="Gallery view" style={{
                  fontSize: 11, padding: '5px 9px', cursor: 'pointer',
                  borderRadius: '0 7px 7px 0', border: '1px solid #214a47', borderLeft: 'none',
                  background: viewMode === 'gallery' ? '#1a3c3a' : '#0e292b',
                  color: viewMode === 'gallery' ? '#e8b14a' : '#6f8a85',
                }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
                    <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
                  </svg>
                </button>
              </div>
              {/* Export dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setExportMenuOpen(v => !v)}
                  style={{
                    fontSize: '11px', fontWeight: 600, padding: '5px 10px', borderRadius: '7px',
                    background: '#0e292b', border: '1px solid #214a47',
                    color: '#6f8a85', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif",
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  ↓ Export {exportMenuOpen ? '▲' : '▼'}
                </button>
                {exportMenuOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 120,
                    background: '#0f2a2c', border: '1px solid #1e4040', borderRadius: '10px',
                    padding: '6px', minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}>
                    {[
                      { label: 'Plain text (.txt)', fn: exportPlainText },
                      { label: 'MTG Arena (.txt)', fn: exportArena },
                      { label: 'MTGO (.dec)', fn: exportMTGO },
                      { label: 'CSV spreadsheet', fn: exportCSV },
                    ].map(({ label, fn }) => (
                      <button
                        key={label}
                        onClick={() => { fn(); setExportMenuOpen(false); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '7px 10px', borderRadius: '7px',
                          background: 'transparent', border: 'none',
                          color: '#a8c8c0', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif",
                          fontSize: '12px', fontWeight: 500,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#1a3c3e')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Board tabs */}
            <div style={{ display: 'flex', gap: '2px', marginBottom: '14px', background: '#0c2426', borderRadius: '8px', padding: '3px' }}>
              {([
                ['main', `Main (${mainboard.length + (commander ? 1 : 0)})`],
                ['side', `Sideboard (${sideboard.length})`],
                ['maybe', `Maybeboard (${maybeboard.length})`],
              ] as const).map(([b, label]) => (
                <button key={b} onClick={() => setBoardTab(b)} style={{
                  flex: 1, padding: '5px 8px', borderRadius: '6px', border: 'none',
                  fontSize: '11px', fontWeight: boardTab === b ? 700 : 400,
                  background: boardTab === b ? 'var(--surface)' : 'transparent',
                  color: boardTab === b ? 'var(--text)' : 'var(--text-faint)',
                  cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif",
                  transition: 'background 0.1s',
                }}>
                  {label}
                </button>
              ))}
            </div>

            {boardTab === 'main' && (
              <>
                {commandZone.length > 0 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <SectionLabel>Command Zone</SectionLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {commandZone.map(cmd => (
                        <div key={cmd.oracle_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1 }}>
                            <DeckEntryRow
                              name={cmd.card_name}
                              quantity={1}
                              treatment={cmd.treatment}
                              bestPrice={priceMap.get(cmd.oracle_id) ?? null}
                              imageUrl={showImages ? (imageMap[cmd.oracle_id] ?? null) : null}
                              owned={(collection[cmd.oracle_id]?.have ?? 0) >= 1}
                              onToggleOwned={cmd.scryfall_id ? () => toggleOwned(cmd.oracle_id, cmd.scryfall_id!, cmd.card_name, 1) : undefined}
                              onCardClick={cmd.scryfall_id ? () => setCardPanel({ scryfallId: cmd.scryfall_id!, name: cmd.card_name }) : undefined}
                              onEdit={() => setEditCard({ oracle_id: cmd.oracle_id, scryfall_id: cmd.scryfall_id, card_name: cmd.card_name, quantity: cmd.quantity, treatment: cmd.treatment, finish: cmd.finish, custom_price: cmd.custom_price ?? null })}
                              onRemove={() => removeCard(cmd.oracle_id)}
                            />
                          </div>
                          <select
                            value={cmd.commander_role ?? 'commander'}
                            onChange={e => actionSetCommanderRole2(deck.id, cmd.oracle_id, e.target.value as 'commander' | 'partner' | 'background' | 'companion').then(() => refreshDeck())}
                            style={{
                              background: 'var(--surface)', border: '1px solid var(--border)',
                              borderRadius: 6, color: 'var(--text-faint)', fontSize: 10,
                              padding: '2px 4px', outline: 'none', cursor: 'pointer', flexShrink: 0,
                              fontFamily: "'IBM Plex Mono', monospace",
                            }}
                          >
                            <option value="commander">Commander</option>
                            <option value="partner">Partner</option>
                            <option value="background">Background</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!!companion && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <SectionLabel>Companion (outside the 100)</SectionLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <DeckEntryRow
                          name={companion.card_name}
                          quantity={1}
                          treatment={companion.treatment}
                          bestPrice={priceMap.get(companion.oracle_id) ?? null}
                          imageUrl={showImages ? (imageMap[companion.oracle_id] ?? null) : null}
                          owned={(collection[companion.oracle_id]?.have ?? 0) >= 1}
                          onToggleOwned={companion.scryfall_id ? () => toggleOwned(companion.oracle_id, companion.scryfall_id!, companion.card_name, 1) : undefined}
                          onCardClick={companion.scryfall_id ? () => setCardPanel({ scryfallId: companion.scryfall_id!, name: companion.card_name }) : undefined}
                          onEdit={() => setEditCard({ oracle_id: companion.oracle_id, scryfall_id: companion.scryfall_id, card_name: companion.card_name, quantity: companion.quantity, treatment: companion.treatment, finish: companion.finish, custom_price: companion.custom_price ?? null })}
                          onRemove={() => removeCard(companion.oracle_id)}
                        />
                      </div>
                      <button
                        onClick={() => actionSetCommanderRole2(deck.id, companion.oracle_id, null).then(() => refreshDeck())}
                        style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                        title="Remove companion role"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0, fontWeight: 500 }}>
                    {mainboard.length} card{mainboard.length !== 1 ? 's' : ''}
                  </p>
                  <button
                    onClick={() => setGroupByCategory(v => !v)}
                    style={{
                      fontSize: 11, background: 'none', border: '1px solid var(--border)',
                      borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
                      color: groupByCategory ? 'var(--accent)' : 'var(--text-faint)',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                    }}
                  >
                    {groupByCategory ? '⊞ By category' : '≡ By type'}
                  </button>
                </div>
                {/* Category filter chips */}
                {(() => {
                  const CATEGORY_ORDER = ['Lands', 'Ramp', 'Card Draw', 'Removal', 'Board Wipes', 'Creatures', 'Artifacts', 'Enchantments', 'Instants', 'Sorceries', 'Other'];
                  const present = new Set<string>(mainboard.map(e => e.category ?? 'Other'));
                  const cats = CATEGORY_ORDER.filter(c => present.has(c));
                  if (cats.length === 0) return null;
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                      {cats.map(cat => {
                        const active = filterCategory === cat;
                        const count = mainboard.filter(e => (e.category ?? 'Other') === cat).reduce((s, e) => s + e.quantity, 0);
                        return (
                          <button
                            key={cat}
                            onClick={() => setFilterCategory(active ? null : cat)}
                            style={{
                              fontSize: 10.5, padding: '2px 8px', borderRadius: 12, cursor: 'pointer',
                              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                              background: active ? 'rgba(232,177,74,0.12)' : 'var(--surface)',
                              color: active ? 'var(--accent)' : 'var(--text-faint)',
                              fontFamily: "'IBM Plex Mono', monospace",
                              transition: 'all 0.1s',
                            }}
                          >
                            {cat} <span style={{ opacity: 0.7 }}>{count}</span>
                          </button>
                        );
                      })}
                      {filterCategory && (
                        <button
                          onClick={() => setFilterCategory(null)}
                          style={{
                            fontSize: 10.5, padding: '2px 8px', borderRadius: 12, cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'none',
                            color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace",
                          }}
                        >
                          ✕ clear
                        </button>
                      )}
                    </div>
                  );
                })()}
                {groupByCategory ? (
                  // Grouped by category view
                  (() => {
                    const ORDER = ['Lands', 'Ramp', 'Card Draw', 'Removal', 'Board Wipes', 'Creatures', 'Artifacts', 'Enchantments', 'Instants', 'Sorceries', 'Other'];
                    const groups: Record<string, typeof displayedMainboard> = {};
                    for (const e of displayedMainboard) {
                      const g = e.category ?? 'Other';
                      if (!groups[g]) groups[g] = [];
                      groups[g].push(e);
                    }
                    return ORDER.filter(g => groups[g]?.length > 0).map(group => (
                      <div key={group} style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 5, display: 'flex', gap: 8, alignItems: 'center' }}>
                          {group}
                          <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({groups[group].reduce((s, e) => s + e.quantity, 0)})</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {groups[group].map(entry => (
                            <div key={entry.oracle_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                              <DeckEntryRow
                                name={entry.card_name}
                                quantity={entry.quantity}
                                treatment={entry.treatment}
                                bestPrice={priceMap.get(entry.oracle_id) ?? null}
                                imageUrl={showImages ? (imageMap[entry.oracle_id] ?? null) : null}
                                owned={(collection[entry.oracle_id]?.have ?? 0) + (collection[entry.oracle_id]?.foil_have ?? 0) >= entry.quantity}
                                onToggleOwned={entry.scryfall_id ? () => toggleOwned(entry.oracle_id, entry.scryfall_id!, entry.card_name, entry.quantity) : undefined}
                                onCardClick={entry.scryfall_id ? () => setCardPanel({ scryfallId: entry.scryfall_id!, name: entry.card_name }) : undefined}
                                onEdit={() => setEditCard({ oracle_id: entry.oracle_id, scryfall_id: entry.scryfall_id, card_name: entry.card_name, quantity: entry.quantity, treatment: entry.treatment, finish: entry.finish, custom_price: entry.custom_price ?? null })}
                                onSetCommander={deck.format === 'commander' ? () => setCommander(entry.oracle_id) : undefined}
                                onAddToWishlist={!((collection[entry.oracle_id]?.have ?? 0) + (collection[entry.oracle_id]?.foil_have ?? 0) >= entry.quantity) ? () => actionAddToWishlist({ oracle_id: entry.oracle_id, scryfall_id: entry.scryfall_id, card_name: entry.card_name, finish: entry.finish, quantity: entry.quantity }) : undefined}
                                onRemove={() => removeCard(entry.oracle_id, 'main')}
                              />
                              </div>
                              <select
                                value={entry.category ?? 'Other'}
                                onChange={async e => {
                                  await actionSetEntryCategory(deck.id, entry.oracle_id, entry.board ?? 'main', e.target.value as import('@/lib/deck/model').CardCategory);
                                  refreshDeck();
                                }}
                                style={{
                                  flexShrink: 0, fontSize: 11, padding: '2px 4px', borderRadius: 4,
                                  border: '1px solid var(--border)', background: 'var(--surface)',
                                  color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace",
                                  cursor: 'pointer',
                                }}
                              >
                                {ORDER.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()
                ) : viewMode === 'gallery' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {displayedMainboard.map(entry => {
                    const img = imageMap[entry.oracle_id] ?? null;
                    const owned = (collection[entry.oracle_id]?.have ?? 0) + (collection[entry.oracle_id]?.foil_have ?? 0) >= entry.quantity;
                    return (
                      <div key={entry.oracle_id} style={{ position: 'relative', cursor: 'pointer' }}
                        onClick={() => entry.scryfall_id && setCardPanel({ scryfallId: entry.scryfall_id, name: entry.card_name })}>
                        <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${owned ? 'rgba(84,192,138,0.4)' : '#1a3c3a'}`, aspectRatio: '0.717', background: '#0e292b' }}>
                          {img ? (
                            <img src={img} alt={entry.card_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#3f5d59', padding: 4, textAlign: 'center' }}>
                              {entry.card_name}
                            </div>
                          )}
                        </div>
                        {entry.quantity > 1 && (
                          <span style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.75)', color: '#e8b14a', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 5px', fontFamily: "'IBM Plex Mono', monospace" }}>
                            {entry.quantity}×
                          </span>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); removeCard(entry.oracle_id, 'main'); }}
                          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#9bb3ad', fontSize: 14, lineHeight: 1, borderRadius: 4, padding: '1px 5px', cursor: 'pointer', display: 'none' }}
                          className="gallery-remove"
                        >×</button>
                      </div>
                    );
                  })}
                </div>
                ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {displayedMainboard.map(entry => (
                    <DeckEntryRow
                      key={entry.oracle_id}
                      name={entry.card_name}
                      quantity={entry.quantity}
                      treatment={entry.treatment}
                      bestPrice={priceMap.get(entry.oracle_id) ?? null}
                      imageUrl={viewMode === 'list' ? (imageMap[entry.oracle_id] ?? null) : null}
                      owned={(collection[entry.oracle_id]?.have ?? 0) + (collection[entry.oracle_id]?.foil_have ?? 0) >= entry.quantity}
                      onToggleOwned={entry.scryfall_id ? () => toggleOwned(entry.oracle_id, entry.scryfall_id!, entry.card_name, entry.quantity) : undefined}
                      onCardClick={entry.scryfall_id ? () => setCardPanel({ scryfallId: entry.scryfall_id!, name: entry.card_name }) : undefined}
                      onEdit={() => setEditCard({ oracle_id: entry.oracle_id, scryfall_id: entry.scryfall_id, card_name: entry.card_name, quantity: entry.quantity, treatment: entry.treatment, finish: entry.finish, custom_price: entry.custom_price ?? null })}
                      onSetCommander={deck.format === 'commander' ? () => setCommander(entry.oracle_id) : undefined}
                      onAddToWishlist={!((collection[entry.oracle_id]?.have ?? 0) + (collection[entry.oracle_id]?.foil_have ?? 0) >= entry.quantity) ? () => actionAddToWishlist({ oracle_id: entry.oracle_id, scryfall_id: entry.scryfall_id, card_name: entry.card_name, finish: entry.finish, quantity: entry.quantity }) : undefined}
                      onRemove={() => removeCard(entry.oracle_id, 'main')}
                    />
                  ))}
                  {mainboard.length === 0 && (
                    <div style={{
                      padding: '2rem', textAlign: 'center',
                      color: 'var(--text-faint)', fontSize: '13px',
                      background: 'var(--surface)', borderRadius: 'var(--radius)',
                      border: '1px dashed var(--border)',
                    }}>
                      No cards yet — search and add on the right
                    </div>
                  )}
                </div>
                )}
              </>
            )}

            {boardTab === 'side' && (
              <>
                <SectionLabel>{sideboard.length} card{sideboard.length !== 1 ? 's' : ''}</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {sideboard.map(entry => (
                    <DeckEntryRow
                      key={entry.oracle_id}
                      name={entry.card_name}
                      quantity={entry.quantity}
                      treatment={entry.treatment}
                      bestPrice={priceMap.get(entry.oracle_id) ?? null}
                      imageUrl={showImages ? (imageMap[entry.oracle_id] ?? null) : null}
                      owned={(collection[entry.oracle_id]?.have ?? 0) + (collection[entry.oracle_id]?.foil_have ?? 0) >= entry.quantity}
                      onToggleOwned={entry.scryfall_id ? () => toggleOwned(entry.oracle_id, entry.scryfall_id!, entry.card_name, entry.quantity) : undefined}
                      onCardClick={entry.scryfall_id ? () => setCardPanel({ scryfallId: entry.scryfall_id!, name: entry.card_name }) : undefined}
                      onEdit={() => setEditCard({ oracle_id: entry.oracle_id, scryfall_id: entry.scryfall_id, card_name: entry.card_name, quantity: entry.quantity, treatment: entry.treatment, finish: entry.finish, custom_price: entry.custom_price ?? null })}
                      onRemove={() => removeCard(entry.oracle_id, 'side')}
                    />
                  ))}
                  {sideboard.length === 0 && (
                    <div style={{
                      padding: '2rem', textAlign: 'center',
                      color: 'var(--text-faint)', fontSize: '13px',
                      background: 'var(--surface)', borderRadius: 'var(--radius)',
                      border: '1px dashed var(--border)',
                    }}>
                      No sideboard cards — add cards while this tab is active
                    </div>
                  )}
                </div>
              </>
            )}

            {boardTab === 'maybe' && (
              <>
                <SectionLabel>{maybeboard.length} card{maybeboard.length !== 1 ? 's' : ''}</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {maybeboard.map(entry => (
                    <DeckEntryRow
                      key={entry.oracle_id}
                      name={entry.card_name}
                      quantity={entry.quantity}
                      treatment={entry.treatment}
                      bestPrice={priceMap.get(entry.oracle_id) ?? null}
                      imageUrl={showImages ? (imageMap[entry.oracle_id] ?? null) : null}
                      owned={(collection[entry.oracle_id]?.have ?? 0) + (collection[entry.oracle_id]?.foil_have ?? 0) >= entry.quantity}
                      onToggleOwned={entry.scryfall_id ? () => toggleOwned(entry.oracle_id, entry.scryfall_id!, entry.card_name, entry.quantity) : undefined}
                      onCardClick={entry.scryfall_id ? () => setCardPanel({ scryfallId: entry.scryfall_id!, name: entry.card_name }) : undefined}
                      onEdit={() => setEditCard({ oracle_id: entry.oracle_id, scryfall_id: entry.scryfall_id, card_name: entry.card_name, quantity: entry.quantity, treatment: entry.treatment, finish: entry.finish, custom_price: entry.custom_price ?? null })}
                      onRemove={() => removeCard(entry.oracle_id, 'maybe')}
                    />
                  ))}
                  {maybeboard.length === 0 && (
                    <div style={{
                      padding: '2rem', textAlign: 'center',
                      color: 'var(--text-faint)', fontSize: '13px',
                      background: 'var(--surface)', borderRadius: 'var(--radius)',
                      border: '1px dashed var(--border)',
                    }}>
                      No maybeboard cards — add cards while this tab is active
                    </div>
                  )}
                </div>
              </>
            )}
            {(() => {
              const allEntries = [...(commander ? [commander] : []), ...mainboard];
              const totalCards = allEntries.reduce((s, e) => s + e.quantity, 0);
              const haveCards = allEntries.reduce((s, e) => s + Math.min(e.quantity, (collection[e.oracle_id]?.have ?? 0) + (collection[e.oracle_id]?.foil_have ?? 0)), 0);
              const needCards = totalCards - haveCards;
              const allOwned = haveCards >= totalCards && totalCards > 0;
              return (
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '12px', padding: '9px 14px', background: '#0c2426', borderRadius: '9px', border: '1px solid #173a38' }}>
                  <span style={{ fontSize: '11px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace" }}>COLLECTION</span>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#54c08a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', fontWeight: 600, color: '#7fd6a6' }}>{haveCards}</span>
                    <span style={{ fontSize: '11px', color: '#5f7a76' }}>have</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" stroke="#eaa863" strokeWidth="1.2" fill="none"/></svg>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', fontWeight: 600, color: '#eaa863' }}>{needCards}</span>
                    <span style={{ fontSize: '11px', color: '#5f7a76' }}>need</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#3a5a56', fontFamily: "'IBM Plex Mono',monospace" }}>
                    {totalCards} total
                  </span>
                  <button
                    onClick={() => markAllOwned(!allOwned)}
                    disabled={bulkOwning || totalCards === 0}
                    style={{
                      marginLeft: 'auto',
                      fontSize: '11px', fontWeight: 700,
                      padding: '4px 10px', borderRadius: '6px', border: 'none',
                      cursor: totalCards === 0 ? 'default' : 'pointer',
                      opacity: bulkOwning ? 0.6 : 1,
                      background: allOwned ? 'rgba(226,100,92,0.12)' : 'rgba(84,192,138,0.12)',
                      color: allOwned ? '#e2645c' : '#54c08a',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {bulkOwning ? '…' : allOwned ? 'Mark all needed' : 'Mark all owned'}
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Search sidebar */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '14px',
          }}>
            <SectionLabel>Add cards</SectionLabel>
            <input
              type="search"
              value={searchQuery}
              onChange={e => searchCards(e.target.value)}
              placeholder="Search card name…"
              style={{
                width: '100%', marginBottom: '10px',
                background: 'var(--surface-2)', border: '1px solid var(--border-2)',
                borderRadius: 'var(--radius)', padding: '8px 12px',
                color: 'var(--text)', fontSize: '13px', outline: 'none',
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            />
            {searching && (
              <p style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '11px', color: 'var(--text-faint)',
                padding: '4px 2px',
              }}>Searching…</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {searchResults.map(card => (
                <SearchResultRow
                  key={card.scryfall_id}
                  card={card}
                  inDeck={deck.entries.some(e => e.oracle_id === card.oracle_id)}
                  onAdd={() => addCard(card)}
                  onAddAsCommander={deck.format === 'commander' && !commander ? () => addCard(card, true) : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Prices */}
      {tab === 'price' && (
        <PriceTab deck={deck} pricedDeck={pricedDeck} loading={loadingPrices} onRefresh={priceWholeDeck} />
      )}

      {/* Tab: Buy Missing */}
      {tab === 'buy-missing' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
              Cards in this deck you don&apos;t own yet — priced across NZ shops.
            </p>
            <AddMissingToWishlistButton deckId={deck.id} />
          </div>
          <ShoppingListPanel source="deck-missing" deckId={deck.id} shopMeta={shopMeta} />
        </div>
      )}

      {/* Tab: Analytics */}
      {tab === 'analytics' && (
        <AnalyticsTab deck={deck} />
      )}

      {/* Tab: Recommend */}
      {tab === 'recommend' && (
        <RecommendTab
          recommendations={recommendations}
          loading={loadingRecs}
          onLoad={getRecommendations}
          onAddCard={addCard}
        />
      )}

      {/* Tab: Primer */}
      {tab === 'primer' && (
        <PrimerTab deck={deck} onSaved={d => setDeck(d)} />
      )}

      {/* Tab: Import */}
      {tab === 'import' && (
        <ImportTab
          importText={importText}
          setImportText={setImportText}
          onImport={handleImport}
          importing={importing}
          result={importResult}
          deckId={deck.id}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '10px', color: 'var(--text-faint)',
      letterSpacing: '1.5px', textTransform: 'uppercase',
      marginBottom: '8px', fontWeight: 500,
    }}>
      {children}
    </p>
  );
}

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, string> = {
    commander: '#e8b14a',
    standard:  '#54c08a',
    modern:    '#a9def9',
    pioneer:   '#c4a8f0',
    legacy:    '#e2645c',
    pauper:    '#a9c0ba',
  };
  const color = colors[format] ?? '#a9c0ba';
  return (
    <span style={{
      fontSize: '10px', padding: '2px 6px',
      background: `${color}18`, color, borderRadius: '3px',
      border: `1px solid ${color}33`, textTransform: 'capitalize', fontWeight: 600,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>{format}</span>
  );
}

function SearchResultRow({ card, inDeck, onAdd, onAddAsCommander }: {
  card: CardSearchResult;
  inDeck: boolean;
  onAdd: () => void;
  onAddAsCommander?: () => void;
}) {
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '7px 10px',
      display: 'flex', alignItems: 'center', gap: '8px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {card.name}
          </span>
          {card.color_identity.map(c => <ManaIcon key={c} symbol={c} size={12} />)}
        </div>
        {card.type_line && (
          <span style={{ fontSize: '11px', color: '#8aa39d' }}>{card.type_line}</span>
        )}
      </div>
      {inDeck ? (
        <span style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '11px', color: 'var(--green)', fontWeight: 600,
        }}>✓</span>
      ) : (
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {onAddAsCommander && (
            <Btn size="sm" variant="gold" onClick={onAddAsCommander}>Cmdr</Btn>
          )}
          <Btn size="sm" onClick={onAdd}>Add</Btn>
        </div>
      )}
    </div>
  );
}

function PriceTab({ deck, pricedDeck, loading, onRefresh }: {
  deck: Deck;
  pricedDeck: PricedDeck | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [strategy, setStrategy] = useState<'best' | 'fewest'>('fewest');
  const [spendStr, setSpendStr] = useState(deck.custom_value != null ? String(deck.custom_value) : '');
  const [savingSpend, setSavingSpend] = useState(false);
  const [spendSaved, setSpendSaved] = useState(false);

  async function saveSpend() {
    const parsed = spendStr.trim() !== '' ? parseFloat(spendStr) : null;
    setSavingSpend(true);
    await actionSetDeckSpend(deck.id, parsed != null && !isNaN(parsed) ? parsed : null);
    setSavingSpend(false);
    setSpendSaved(true);
    setTimeout(() => setSpendSaved(false), 2500);
  }

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Checking NZ shops…
      </div>
    );
  }

  // Build a map of custom prices from deck entries so the price tab can show them
  const customPriceMap = new Map<string, number>();
  for (const e of mainboardEntries(deck)) {
    if (e.custom_price != null) customPriceMap.set(e.oracle_id, e.custom_price);
  }
  const customPriceTotal = mainboardEntries(deck).reduce((s, e) => s + (e.custom_price != null ? e.custom_price * e.quantity : 0), 0);
  const hasAnyCustomPrice = customPriceMap.size > 0;

  if (!pricedDeck) {
    return (
      <div style={{ padding: '1.5rem 0' }}>
        {/* Spend tracker visible before pricing too */}
        <div style={{ marginBottom: '1.5rem', padding: '12px 14px', background: '#0a1e21', border: '1px solid #173a38', borderRadius: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#5f7a76', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '8px' }}>
            What I paid for this deck
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace" }}>NZ$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 60.00"
              value={spendStr}
              onChange={e => setSpendStr(e.target.value)}
              style={{
                flex: 1, background: '#0e292b', border: '1px solid #214a47',
                borderRadius: '8px', padding: '7px 11px',
                color: '#eef3f0', fontSize: '14px',
                fontFamily: "'IBM Plex Mono',monospace",
                outline: 'none',
              }}
            />
            <button
              onClick={saveSpend}
              disabled={savingSpend}
              style={{
                background: spendSaved ? '#1d5c3e' : '#1d4441', border: `1px solid ${spendSaved ? '#3d9a6e' : '#2d6460'}`, borderRadius: '8px',
                color: spendSaved ? '#7fd6a6' : '#54c08a', fontSize: '12px', fontWeight: 700, padding: '7px 14px',
                cursor: savingSpend ? 'not-allowed' : 'pointer', fontFamily: "'IBM Plex Sans',sans-serif",
                opacity: savingSpend ? 0.7 : 1, transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              {savingSpend ? '…' : spendSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
          {hasAnyCustomPrice && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace" }}>
              <span style={{ color: '#5f7a76' }}>Custom prices: <span style={{ color: '#e8b14a' }}>NZ${customPriceTotal.toFixed(2)}</span></span>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          {hasAnyCustomPrice && (
            <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'rgba(232,177,74,0.08)', border: '1px solid rgba(232,177,74,0.25)', borderRadius: '10px' }}>
              <div style={{ fontSize: '11px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '4px' }}>CUSTOM PRICE TOTAL ({customPriceMap.size} cards)</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#e8b14a', fontFamily: "'IBM Plex Mono',monospace" }}>NZ${customPriceTotal.toFixed(2)}</div>
            </div>
          )}
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '13px' }}>
            {hasAnyCustomPrice
              ? 'Load market prices to fill in the remaining cards and see full deck value.'
              : 'Price your deck to see where to buy each card cheapest, or set what you paid via the ✎ edit button.'}
          </p>
          <Btn onClick={onRefresh} disabled={deck.entries.length === 0}>
            ✦ {hasAnyCustomPrice ? 'Load market prices' : 'Find NZ prices'}
          </Btn>
        </div>
      </div>
    );
  }

  // Merge market prices with custom overrides for totals
  const effectiveTotal = deck.entries.reduce((s, e) => {
    if (e.custom_price != null) return s + e.custom_price * e.quantity;
    const r = pricedDeck.card_results.find(cr => cr.entry_id === e.oracle_id);
    return s + (r?.best_price?.price_nzd ?? 0) * e.quantity;
  }, 0);

  const { card_results, best_per_card_total, fewest_shops_basket, fewest_shops_total, fewest_shops_count, not_found_count, as_of } = pricedDeck;

  return (
    <div>
      {/* Strategy toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
        <div style={{
          display: 'inline-flex',
          background: '#0c2426', border: '1px solid var(--border-2)',
          borderRadius: '11px', padding: '5px', gap: '4px',
        }}>
          {([['best', 'Best per card'], ['fewest', `Fewest shops ✓`]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setStrategy(val)} style={{
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '12.5px',
              fontWeight: strategy === val ? 700 : 400,
              border: strategy === val ? '1px solid var(--accent)' : '1px solid transparent',
              background: strategy === val ? 'var(--surface-3)' : 'transparent',
              color: strategy === val ? 'var(--accent)' : 'var(--text-faint)',
              cursor: 'pointer',
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div>
            <span style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '18px', fontWeight: 700,
              color: '#7fd6a6',
            }}>
              NZ${(hasAnyCustomPrice ? effectiveTotal : (strategy === 'best' ? best_per_card_total : fewest_shops_total)).toFixed(2)}
            </span>
            {hasAnyCustomPrice && (
              <span style={{ marginLeft: '6px', fontSize: '10px', color: '#e8b14a', fontFamily: "'IBM Plex Mono',monospace" }}>incl. custom</span>
            )}
          </div>
          {strategy === 'fewest' && (
            <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
              {fewest_shops_count} shop{fewest_shops_count !== 1 ? 's' : ''}
            </span>
          )}
          {not_found_count > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--red)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {not_found_count} not found
            </span>
          )}
        </div>
      </div>

      {/* Deck spend tracker */}
      <div style={{ marginBottom: '1.5rem', padding: '12px 14px', background: '#0a1e21', border: '1px solid #173a38', borderRadius: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#5f7a76', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '8px' }}>
          What I paid for this deck
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace" }}>NZ$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 60.00"
            value={spendStr}
            onChange={e => setSpendStr(e.target.value)}
            style={{
              flex: 1, background: '#0e292b', border: '1px solid #214a47',
              borderRadius: '8px', padding: '7px 11px',
              color: '#eef3f0', fontSize: '14px',
              fontFamily: "'IBM Plex Mono',monospace",
              outline: 'none',
            }}
          />
          <button
            onClick={saveSpend}
            disabled={savingSpend}
            style={{
              background: '#1d4441', border: '1px solid #2d6460', borderRadius: '8px',
              color: '#54c08a', fontSize: '12px', fontWeight: 700, padding: '7px 14px',
              cursor: savingSpend ? 'not-allowed' : 'pointer', fontFamily: "'IBM Plex Sans',sans-serif",
              opacity: savingSpend ? 0.7 : 1,
            }}
          >
            {savingSpend ? '…' : 'Save'}
          </button>
          {spendStr.trim() === '' && deck.custom_value != null && (
            <button
              onClick={() => { setSpendStr(''); actionSetDeckSpend(deck.id, null); }}
              title="Clear deck spend"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5f7a76', fontSize: '16px', lineHeight: 1, padding: '4px' }}
            >×</button>
          )}
        </div>
        {(() => {
          const marketVal = hasAnyCustomPrice ? effectiveTotal : (strategy === 'best' ? best_per_card_total : fewest_shops_total);
          const paid = spendStr.trim() !== '' ? parseFloat(spendStr) : deck.custom_value;
          if (paid == null || isNaN(paid as number)) return null;
          const diff = marketVal - (paid as number);
          return (
            <div style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace" }}>
              <span style={{ color: '#5f7a76' }}>Market: <span style={{ color: '#7fd6a6' }}>NZ${marketVal.toFixed(2)}</span></span>
              <span style={{ color: '#5f7a76' }}>Paid: <span style={{ color: '#e8b14a' }}>NZ${(paid as number).toFixed(2)}</span></span>
              <span style={{ color: diff >= 0 ? '#54c08a' : '#e26450' }}>
                {diff >= 0 ? '+' : ''}NZ${diff.toFixed(2)}
              </span>
            </div>
          );
        })()}
      </div>

      {strategy === 'best' ? (
        /* Per-card best prices */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {card_results.map(r => {
            const cp = customPriceMap.get(r.entry_id);
            return (
            <div key={r.entry_id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 12px',
              background: cp != null ? 'rgba(232,177,74,0.05)' : r.not_found ? 'rgba(226,100,92,0.05)' : '#0e2426',
              border: `1px solid ${cp != null ? 'rgba(232,177,74,0.2)' : r.not_found ? 'rgba(226,100,92,0.2)' : '#143230'}`,
              borderRadius: '7px',
              gap: '8px',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {r.card_name}
              </span>
              {cp != null ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '10px', color: '#e8b14a', fontFamily: "'IBM Plex Mono',monospace", background: 'rgba(232,177,74,0.12)', padding: '1px 5px', borderRadius: '3px' }}>custom</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: '#e8b14a', fontSize: '13px' }}>
                    NZ${cp.toFixed(2)}
                  </span>
                </div>
              ) : r.best_price ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '11px', color: 'var(--text-faint)',
                  }}>{r.best_price.shop_name}</span>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontWeight: 600, color: '#7fd6a6', fontSize: '13px',
                  }}>
                    NZ${r.best_price.price_nzd.toFixed(2)}
                  </span>
                  {r.best_price.product_url && (
                    <a href={r.best_price.product_url} target="_blank" rel="noopener"
                      style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none' }}>
                      →
                    </a>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: '11px', color: 'var(--red)', fontFamily: "'IBM Plex Mono', monospace" }}>not stocked</span>
              )}
            </div>
            );
          })}
        </div>
      ) : (
        /* Fewest shops basket — Lodestone Screen 4 style */
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#8aa39d', marginBottom: '16px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e8b14a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
            </svg>
            Greedy basket across <strong style={{ color: '#cfe0db' }}>{fewest_shops_count} shop{fewest_shops_count !== 1 ? 's' : ''}</strong> — cheapest combination to minimise shipping.
          </div>
          {Object.entries(
            fewest_shops_basket.reduce<Record<string, typeof fewest_shops_basket>>((acc, item) => {
              (acc[item.shop_name] ??= []).push(item);
              return acc;
            }, {})
          ).map(([shopName, items], shopIdx) => {
            const subtotal = items.reduce((s, i) => s + i.price_nzd, 0);
            const initials = shopName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const avatarGradients = ['linear-gradient(135deg,#2a6d63,#1f3f4d)', 'linear-gradient(135deg,#5a4a82,#3a2e5a)', 'linear-gradient(135deg,#7a3a3a,#4d2a2a)', 'linear-gradient(135deg,#4a6a3a,#2a4a2a)'];
            return (
              <div key={shopName} style={{ border: '1px solid #214a47', borderRadius: '13px', overflow: 'hidden', marginBottom: '16px' }}>
                {/* Shop header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', background: '#0e272a', borderBottom: '1px solid #173a38' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: avatarGradients[shopIdx % avatarGradients.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#dfeae6', flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#f4f0e6' }}>{shopName}</div>
                    <div style={{ fontSize: '11.5px', color: '#7e9893' }}>{items.length} card{items.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                {/* Card list */}
                <div style={{ padding: '6px 18px' }}>
                  {items.slice(0, 5).map((item, idx) => (
                    <div key={item.entry_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: idx < Math.min(items.length, 5) - 1 ? '1px solid #122e2c' : 'none', fontSize: '13px' }}>
                      <span style={{ color: '#cfe0db' }}>{item.card_name}</span>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#cfe0db' }}>${item.price_nzd.toFixed(2)}</span>
                        {item.product_url && (
                          <a href={item.product_url} target="_blank" rel="noopener" style={{ fontSize: '12px', color: '#e8b14a', textDecoration: 'none' }}>→</a>
                        )}
                      </div>
                    </div>
                  ))}
                  {items.length > 5 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: '13px' }}>
                      <span style={{ color: '#7e9893' }}>+ {items.length - 5} more cards</span>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#7e9893' }}>
                        ${items.slice(5).reduce((s, i) => s + i.price_nzd, 0).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
                {/* Shop footer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 18px', background: '#0c2426', borderTop: '1px solid #173a38' }}>
                  <div style={{ fontSize: '12px', color: '#8aa39d' }}>
                    Subtotal <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#eef3f0', fontWeight: 600, marginLeft: '5px' }}>${subtotal.toFixed(2)}</span>
                  </div>
                  <a href={items[0]?.product_url?.replace(/\/products\/.*/, '') ?? '#'} target="_blank" rel="noopener"
                    style={{ marginLeft: 'auto', fontSize: '12.5px', fontWeight: 700, color: '#0a1f22', background: '#e8b14a', padding: '8px 15px', borderRadius: '8px', textDecoration: 'none' }}>
                    Buy {items.length} at {shopName.split(' ')[0]} →
                  </a>
                </div>
              </div>
            );
          })}
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--text-faint)', marginTop: '8px' }}>
            Prices as of {new Date(as_of).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
      )}
    </div>
  );
}

function RecommendTab({ recommendations, loading, onLoad, onAddCard }: {
  recommendations: Recommendation[] | null;
  loading: boolean;
  onLoad: () => void;
  onAddCard: (card: CardSearchResult) => void;
}) {
  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Analysing your deck…</div>;
  }
  if (!recommendations) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '13px' }}>
          Get suggestions for improving your deck: mana curve, removal, staples, and more.
        </p>
        <Btn onClick={onLoad}>Analyse deck</Btn>
      </div>
    );
  }

  const errors = recommendations.filter(r => r.severity === 'error');
  const warnings = recommendations.filter(r => r.severity === 'warning');
  const suggestions = recommendations.filter(r => r.severity === 'suggestion');

  return (
    <div>
      {recommendations.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--green)' }}>
          Your deck looks good! No issues detected.
        </div>
      )}
      {errors.length > 0 && <RecSection title="Issues to fix" items={errors} />}
      {warnings.length > 0 && <RecSection title="Worth looking at" items={warnings} />}
      {suggestions.length > 0 && <RecSection title="Consider adding" items={suggestions} />}
      <div style={{ marginTop: '1.5rem' }}>
        <Btn variant="ghost" size="sm" onClick={onLoad}>Re-analyse</Btn>
      </div>
    </div>
  );
}

function RecSection({ title, items }: { title: string; items: Recommendation[] }) {
  const severityColors = { error: 'var(--red)', warning: 'var(--warning)', suggestion: 'var(--accent)', info: 'var(--text-muted)' };
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <p style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: '10px', color: 'var(--text-faint)',
        letterSpacing: '1.5px', textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map((rec, i) => {
          const color = severityColors[rec.severity as keyof typeof severityColors] ?? 'var(--text-muted)';
          return (
            <div key={i} style={{
              background: 'var(--surface)', border: `1px solid ${color}28`,
              borderLeft: `3px solid ${color}`,
              borderRadius: `0 var(--radius) var(--radius) 0`,
              padding: '10px 14px',
            }}>
              <p style={{ fontWeight: 600, fontSize: '13px', marginBottom: '3px', color }}>{rec.title}</p>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{rec.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Card detail panel ────────────────────────────────────────────────────────

const PANEL_LEGAL_FORMATS = ['commander', 'standard', 'pioneer', 'modern', 'legacy', 'pauper'];
const PANEL_RARITY_COLORS: Record<string, string> = { common: '#a9c0ba', uncommon: '#c0d0d8', rare: '#e8b14a', mythic: '#e2794a' };

function CardDetailPanel({ scryfallId, name, onClose }: { scryfallId: string; name: string; onClose: () => void }) {
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    setLoading(true);
    setShowBack(false);
    fetch(`https://api.scryfall.com/cards/${scryfallId}`)
      .then(r => r.json())
      .then(d => { setCard(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [scryfallId]);

  const faces = card?.card_faces ?? null;
  const hasFaces = Array.isArray(faces) && faces.length >= 2;
  const activeFace = hasFaces ? (showBack ? faces[1] : faces[0]) : null;

  const imageUri = activeFace?.image_uris?.normal
    ?? card?.image_uris?.normal
    ?? faces?.[0]?.image_uris?.normal
    ?? null;

  const displayedOracleText = activeFace?.oracle_text ?? card?.oracle_text;
  const displayedPower = activeFace?.power ?? card?.power;
  const displayedToughness = activeFace?.toughness ?? card?.toughness;
  const displayedLoyalty = activeFace?.loyalty ?? card?.loyalty;
  const usd = card?.prices?.usd ?? card?.prices?.usd_foil;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100 }} />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '380px',
        background: 'var(--bg)', borderLeft: '1px solid var(--border)',
        zIndex: 101, overflowY: 'auto', padding: '20px',
        display: 'flex', flexDirection: 'column', gap: '14px',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono',monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Card detail</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {card && (
              <a
                href={`/card/${card.set}/${card.collector_number}`}
                style={{ fontSize: '10px', color: 'var(--accent)', fontFamily: "'IBM Plex Mono',monospace", textDecoration: 'none' }}
              >
                Full page ↗
              </a>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: '20px', lineHeight: 1, padding: '2px' }}>×</button>
          </div>
        </div>

        {loading && <div style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Loading…</div>}

        {/* Card image + DFC flip */}
        {!loading && imageUri && (
          <div>
            <img src={imageUri} alt={activeFace?.name ?? name} style={{ width: '100%', borderRadius: '12px', border: '1px solid var(--border)' }} />
            {hasFaces && (
              <button
                onClick={() => setShowBack(b => !b)}
                style={{
                  display: 'block', width: '100%', marginTop: '8px',
                  padding: '6px', borderRadius: '7px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', fontSize: '11.5px', cursor: 'pointer',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              >
                ↔ {showBack ? 'Show front face' : 'Show back face'}
              </button>
            )}
          </div>
        )}

        {card && (
          <>
            {/* Name + mana cost */}
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>{activeFace?.name ?? card.name}</div>
              {(activeFace?.mana_cost ?? card.mana_cost) && (
                <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '3px' }}>
                  {activeFace?.mana_cost ?? card.mana_cost}
                </div>
              )}
              {/* type + rarity + set */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                {(activeFace?.type_line ?? card.type_line) && (
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{activeFace?.type_line ?? card.type_line}</span>
                )}
                {card.rarity && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace",
                    color: PANEL_RARITY_COLORS[card.rarity] ?? 'var(--text-faint)',
                    textTransform: 'capitalize',
                  }}>{card.rarity}</span>
                )}
              </div>
              {card.set_name && (
                <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono',monospace", marginTop: '2px' }}>
                  {card.set_name} #{card.collector_number}
                </div>
              )}
            </div>

            {/* Oracle text */}
            {displayedOracleText && (
              <div style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'var(--surface)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                {displayedOracleText}
                {(displayedPower || displayedLoyalty) && (
                  <div style={{ marginTop: '8px', fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', fontWeight: 700, color: 'var(--accent)', textAlign: 'right' }}>
                    {displayedPower ? `${displayedPower}/${displayedToughness}` : `◈ ${displayedLoyalty}`}
                  </div>
                )}
              </div>
            )}

            {/* Flavor text */}
            {card.flavor_text && (
              <div style={{ fontSize: '11.5px', fontStyle: 'italic', color: 'var(--text-faint)', lineHeight: 1.55, borderLeft: '2px solid var(--border)', paddingLeft: '10px' }}>
                {card.flavor_text}
              </div>
            )}

            {/* Keywords */}
            {card.keywords?.length > 0 && (
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {card.keywords.map((kw: string) => (
                  <span key={kw} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {kw}
                  </span>
                ))}
              </div>
            )}

            {/* Artist */}
            {card.artist && (
              <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Illus. {card.artist}</div>
            )}

            {/* Color identity pips */}
            {card.color_identity && card.color_identity.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {card.color_identity.map((c: string) => <ManaIcon key={c} symbol={c} size={16} />)}
              </div>
            )}

            {/* Prices */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {usd && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono',monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>USD</div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>${usd}</div>
                </div>
              )}
            </div>

            {/* NZ live prices */}
            {card.set && card.collector_number && (
              <NzPricePanel
                setCode={card.set}
                collectorNumber={card.collector_number}
                finishes={Array.isArray(card.finishes) ? card.finishes : ['nonfoil']}
              />
            )}

            {/* Compact legality */}
            <div>
              <div style={{ fontSize: '9px', fontFamily: "'IBM Plex Mono',monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '7px' }}>Legality</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                {PANEL_LEGAL_FORMATS.map(fmt => {
                  const status = card.legalities?.[fmt] ?? 'not_legal';
                  const ok = status === 'legal' || status === 'restricted';
                  return (
                    <div key={fmt} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '5px 4px', borderRadius: '5px', background: 'var(--surface-2)', border: `1px solid ${ok ? 'rgba(84,192,138,0.25)' : 'var(--border)'}` }}>
                      <span style={{ fontSize: '9px', color: 'var(--text-faint)', textTransform: 'capitalize' }}>{fmt.slice(0, 4)}</span>
                      <span style={{ fontSize: '9px', fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: ok ? '#54c08a' : '#e2645c', marginTop: '1px' }}>
                        {ok ? '✓' : '✗'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* External links */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingTop: '2px' }}>
              <a href={card.scryfall_uri} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', fontFamily: "'IBM Plex Mono',monospace" }}>
                Scryfall ↗
              </a>
              <a
                href={`https://edhrec.com/cards/${card.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '11px', color: 'var(--text-faint)', textDecoration: 'none', fontFamily: "'IBM Plex Mono',monospace" }}>
                EDHREC ↗
              </a>
              {card.purchase_uris?.cardmarket && (
                <a href={card.purchase_uris.cardmarket} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '11px', color: 'var(--text-faint)', textDecoration: 'none', fontFamily: "'IBM Plex Mono',monospace" }}>
                  Cardmarket ↗
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Edit card printing panel ─────────────────────────────────────────────────

interface PrintingOption {
  scryfall_id: string;
  oracle_id: string;
  set_code: string;
  set_name?: string;
  treatment: string;
  finishes: string[];
  image_url: string | null;
  label: string;
}

function EditCardPanel({
  deckId, oracleId, cardName,
  currentScryfallId, currentQuantity, currentTreatment, currentFinish, currentCustomPrice,
  onClose, onSaved,
}: {
  deckId: string;
  oracleId: string;
  cardName: string;
  currentScryfallId: string | null;
  currentQuantity: number;
  currentTreatment: string;
  currentFinish: string;
  currentCustomPrice: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [printings, setPrintings] = useState<PrintingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(currentScryfallId);
  const [selectedFinish, setSelectedFinish] = useState(currentFinish);
  const [quantity, setQuantity] = useState(currentQuantity);
  const [customPriceStr, setCustomPriceStr] = useState(currentCustomPrice != null ? String(currentCustomPrice) : '');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/card/${oracleId}/printings`)
      .then(r => r.json())
      .then((d: { options: PrintingOption[] }) => { setPrintings(d.options ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [oracleId]);

  const selected = printings.find(p => p.scryfall_id === selectedId) ?? printings[0];
  const availableFinishes = selected?.finishes ?? ['nonfoil'];

  async function save() {
    const target = printings.find(p => p.scryfall_id === selectedId);
    const parsedCustomPrice = customPriceStr.trim() !== '' ? parseFloat(customPriceStr) : null;
    setSaving(true);
    await actionUpdateEntry(deckId, oracleId, {
      scryfall_id: selectedId,
      quantity,
      treatment: (target?.treatment ?? currentTreatment) as any,
      finish: selectedFinish as any,
      custom_price: parsedCustomPrice != null && !isNaN(parsedCustomPrice) ? parsedCustomPrice : null,
    });
    onSaved();
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px',
        background: '#0d2426', borderLeft: '1px solid #1d4441',
        zIndex: 101, overflowY: 'auto', padding: '20px',
        display: 'flex', flexDirection: 'column', gap: '16px',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace", color: '#5f7a76', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Change printing</span>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#eef3f0', marginTop: '2px' }}>{cardName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6f8a85', fontSize: '20px', lineHeight: 1, padding: '2px' }}>×</button>
        </div>

        {loading && <div style={{ color: '#5f7a76', fontSize: '13px' }}>Loading printings…</div>}

        {!loading && printings.length === 0 && (
          <div style={{ color: '#5f7a76', fontSize: '13px' }}>No printings found in local database. Run a Scryfall sync first.</div>
        )}

        {!loading && printings.length > 0 && (
          <>
            {/* Printing grid */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#5f7a76', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '10px' }}>
                {printings.length} printing{printings.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
                {printings.map(p => {
                  const isSelected = (selectedId ?? printings[0]?.scryfall_id) === p.scryfall_id;
                  return (
                    <button
                      key={p.scryfall_id}
                      onClick={() => { setSelectedId(p.scryfall_id); if (!p.finishes.includes(selectedFinish)) setSelectedFinish(p.finishes[0] ?? 'nonfoil'); }}
                      title={p.label}
                      style={{
                        padding: 0, background: 'none', border: 'none', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                      }}
                    >
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.label}
                          style={{
                            width: '100%', borderRadius: '7px',
                            border: isSelected ? '2px solid #e8b14a' : '2px solid transparent',
                            outline: isSelected ? '1px solid rgba(232,177,74,0.4)' : 'none',
                            boxShadow: isSelected ? '0 0 10px rgba(232,177,74,0.3)' : 'none',
                            transition: 'border-color 0.1s',
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '100%', paddingBottom: '140%', borderRadius: '7px', position: 'relative',
                          background: isSelected ? 'rgba(232,177,74,0.15)' : '#0e292b',
                          border: isSelected ? '2px solid #e8b14a' : '2px solid #214a47',
                        }}>
                          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace" }}>
                            {p.set_code.toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span style={{
                        fontSize: '9px', color: isSelected ? '#e8b14a' : '#6f8a85',
                        fontFamily: "'IBM Plex Mono',monospace",
                        textAlign: 'center', lineHeight: 1.3,
                        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {p.set_code.toUpperCase()}
                        {p.treatment !== 'normal' ? ` · ${p.treatment.slice(0, 3)}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected printing details */}
            {selected && (
              <div style={{ background: '#0a1e21', borderRadius: '9px', padding: '10px 12px', border: '1px solid #173a38', fontSize: '12px', color: '#8aa39d' }}>
                <div style={{ fontWeight: 700, color: '#eef3f0', marginBottom: '2px' }}>{selected.label}</div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px' }}>
                  {selected.set_name ?? selected.set_code.toUpperCase()}
                  {selected.treatment !== 'normal' && <span style={{ marginLeft: '6px', color: '#e8b14a' }}>{selected.treatment}</span>}
                </div>
              </div>
            )}

            {/* Finish selector */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#5f7a76', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '8px' }}>Finish</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['nonfoil', 'foil', 'etched'] as const).map(f => {
                  const available = availableFinishes.includes(f);
                  const active = selectedFinish === f;
                  return (
                    <button key={f} onClick={() => available && setSelectedFinish(f)} disabled={!available} style={{
                      padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: active ? 700 : 400,
                      background: active ? 'rgba(232,177,74,0.15)' : '#0e292b',
                      border: active ? '1px solid #e8b14a' : '1px solid #214a47',
                      color: active ? '#e8b14a' : available ? '#8aa39d' : '#3a5a56',
                      cursor: available ? 'pointer' : 'not-allowed',
                      opacity: available ? 1 : 0.4,
                      fontFamily: "'IBM Plex Sans', sans-serif",
                      textTransform: 'capitalize',
                    }}>{f}</button>
                  );
                })}
              </div>
            </div>

            {/* Quantity stepper */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#5f7a76', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '8px' }}>Quantity</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#0e292b', border: '1px solid #214a47', color: '#8aa39d', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                >−</button>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#eef3f0', fontFamily: "'IBM Plex Mono',monospace", minWidth: '28px', textAlign: 'center' }}>{quantity}</span>
                <button
                  onClick={() => setQuantity(q => q + 1)}
                  style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#0e292b', border: '1px solid #214a47', color: '#8aa39d', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                >+</button>
              </div>
            </div>

          </>
        )}

        {/* Custom price override — shown always (even when no printings exist yet) */}
        {!loading && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#5f7a76', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '4px' }}>
              Custom price (NZ$)
            </div>
            <div style={{ fontSize: '11px', color: '#3a5a56', marginBottom: '8px' }}>
              Overrides market price in deck value — leave blank to use live NZ shop price.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace" }}>$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 12.50"
                value={customPriceStr}
                onChange={e => setCustomPriceStr(e.target.value)}
                style={{
                  flex: 1, background: '#0e292b', border: '1px solid #214a47',
                  borderRadius: '8px', padding: '8px 12px',
                  color: '#eef3f0', fontSize: '14px',
                  fontFamily: "'IBM Plex Mono',monospace",
                  outline: 'none',
                }}
              />
              {customPriceStr.trim() !== '' && (
                <button
                  onClick={() => setCustomPriceStr('')}
                  title="Clear custom price"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5f7a76', fontSize: '16px', lineHeight: 1, padding: '4px' }}
                >×</button>
              )}
            </div>
            {customPriceStr.trim() !== '' && (
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#e8b14a', fontFamily: "'IBM Plex Mono',monospace" }}>
                ⚑ Custom NZ${parseFloat(customPriceStr || '0').toFixed(2)} will be used in deck value
              </div>
            )}
          </div>
        )}

        {/* Save */}
        {!loading && (
          <button
            onClick={save}
            disabled={saving}
            style={{
              background: saving ? '#4a7a50' : '#54c08a', color: '#0a1f22',
              fontWeight: 700, fontSize: '14px', padding: '11px 0',
              borderRadius: '10px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: "'IBM Plex Sans', sans-serif", width: '100%',
              opacity: saving ? 0.8 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>
    </>
  );
}

function PreconCardList({ cards, onUse }: {
  cards: { name: string; is_commander: boolean; image_uri: string | null }[];
  onUse: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [hoveredCard, setHoveredCard] = useState<{ name: string; image_uri: string | null } | null>(null);

  const filtered = filter
    ? cards.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))
    : cards;

  const commanders = cards.filter(c => c.is_commander);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid #1d4441' }}>
        <input
          type="search"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={`Search ${cards.length} cards…`}
          style={{
            flex: 1, background: '#0e292b', border: '1px solid #214a47', borderRadius: '7px',
            padding: '6px 11px', color: '#eef3f0', fontSize: '12px', outline: 'none',
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        />
        <button onClick={onUse} style={{
          background: '#e8b14a', color: '#0a1f22', fontWeight: 700, fontSize: '12px',
          padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          fontFamily: "'IBM Plex Sans', sans-serif", whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          Use this precon →
        </button>
      </div>

      <div style={{ display: 'flex', maxHeight: '340px' }}>
        {/* Card list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {commanders.length > 0 && !filter && (
            <div style={{ padding: '6px 14px 2px', fontSize: '10px', fontWeight: 700, color: '#e8b14a', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace" }}>
              Commander
            </div>
          )}
          {filtered.map((c, i) => (
            <div
              key={i}
              onMouseEnter={() => setHoveredCard(c)}
              onMouseLeave={() => setHoveredCard(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '5px 14px',
                background: hoveredCard?.name === c.name ? 'rgba(255,255,255,0.04)' : 'transparent',
                borderLeft: c.is_commander ? '3px solid #e8b14a' : '3px solid transparent',
                cursor: 'default',
              }}
            >
              {c.is_commander && (
                <span style={{ fontSize: '10px', color: '#e8b14a', fontFamily: "'IBM Plex Mono',monospace", flexShrink: 0 }}>★</span>
              )}
              <span style={{ fontSize: '13px', color: c.is_commander ? '#f4e8c0' : '#cfe0db', flex: 1 }}>{c.name}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '16px 14px', fontSize: '12px', color: '#5f7a76' }}>No cards match "{filter}"</div>
          )}
        </div>

        {/* Hover preview */}
        <div style={{ width: '120px', flexShrink: 0, padding: '10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', borderLeft: '1px solid #173a38' }}>
          {hoveredCard?.image_uri ? (
            <img
              src={hoveredCard.image_uri}
              alt={hoveredCard.name}
              style={{ width: '100%', borderRadius: '7px', border: '1px solid #214a47' }}
            />
          ) : (
            <div style={{ fontSize: '10px', color: '#3a5a56', textAlign: 'center', paddingTop: '20px', fontFamily: "'IBM Plex Mono',monospace" }}>
              hover card
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportTab({ importText, setImportText, onImport, importing, result, deckId: _deckId }: {
  importText: string;
  setImportText: (s: string) => void;
  onImport: () => void;
  importing: boolean;
  result: { added: number; errors: string[] } | null;
  deckId: string;
}) {
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [urlSuccess, setUrlSuccess] = useState('');
  const [preconSets, setPreconSets] = useState<{ code: string; name: string; released_at: string; card_count: number }[]>([]);
  const [preconLoading, setPreconLoading] = useState(false);
  const [selectedPrecon, setSelectedPrecon] = useState<string | null>(null);
  const [preconCards, setPreconCards] = useState<{ name: string; is_commander: boolean; image_uri: string | null }[]>([]);
  const [showPrecons, setShowPrecons] = useState(false);
  const [preconSearch, setPreconSearch] = useState('');

  async function handleUrlImport() {
    if (!urlInput.trim()) return;
    setUrlLoading(true); setUrlError(''); setUrlSuccess('');
    try {
      const res = await fetch('/api/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json() as { deckName?: string; cards?: { name: string; quantity: number }[]; error?: string };
      if (!res.ok || data.error) { setUrlError(data.error ?? 'Failed to fetch deck'); return; }
      const lines = (data.cards ?? []).map(c => `${c.quantity} ${c.name}`);
      setImportText(lines.join('\n'));
      setUrlSuccess(`✓ "${data.deckName}" fetched — click Import decklist below`);
      setUrlInput('');
    } catch (e: any) {
      setUrlError(e.message ?? 'Network error');
    } finally { setUrlLoading(false); }
  }

  async function loadPrecons() {
    setShowPrecons(v => !v);
    if (preconSets.length > 0) return;
    setPreconLoading(true);
    try {
      const res = await fetch('/api/import/precons');
      const data = await res.json() as { sets?: typeof preconSets };
      setPreconSets(data.sets ?? []);
    } finally { setPreconLoading(false); }
  }

  async function selectPrecon(code: string) {
    if (selectedPrecon === code) { setSelectedPrecon(null); return; }
    setSelectedPrecon(code);
    setPreconCards([]);
    const res = await fetch(`/api/import/precons/${code}`);
    const data = await res.json() as { cards?: typeof preconCards };
    setPreconCards(data.cards ?? []);
  }

  function usePrecon() {
    if (!preconCards.length) return;
    setImportText(preconCards.map(c => `1 ${c.name}`).join('\n'));
    setShowPrecons(false);
    setSelectedPrecon(null);
  }

  const inputStyle: React.CSSProperties = {
    flex: 1, background: '#0e292b', border: '1px solid #214a47', borderRadius: '9px',
    padding: '9px 13px', color: '#eef3f0', fontSize: '13px', outline: 'none',
    fontFamily: "'IBM Plex Sans', sans-serif",
  };
  const divider = <div style={{ height: '1px', background: '#173a38', margin: '20px 0' }} />;
  const sectionLabel = (t: string) => (
    <div style={{ fontSize: '11px', fontWeight: 700, color: '#5f7a76', letterSpacing: '1.5px', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '8px' }}>{t}</div>
  );

  return (
    <div style={{ maxWidth: '680px' }}>

      {/* ── URL import ─────────────────────────────────────────────────── */}
      <div>
        {sectionLabel('Import from URL')}
        <div style={{ fontSize: '12px', color: '#6f8a85', marginBottom: '10px' }}>
          Paste a Moxfield or Archidekt deck link — we'll fetch it server-side.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="url"
            value={urlInput}
            onChange={e => { setUrlInput(e.target.value); setUrlError(''); setUrlSuccess(''); }}
            onKeyDown={e => e.key === 'Enter' && handleUrlImport()}
            placeholder="https://www.moxfield.com/decks/..."
            style={inputStyle}
          />
          <button
            onClick={handleUrlImport}
            disabled={urlLoading || !urlInput.trim()}
            style={{
              background: '#e8b14a', color: '#0a1f22', fontWeight: 700, fontSize: '13px',
              padding: '9px 16px', borderRadius: '9px', border: 'none', whiteSpace: 'nowrap',
              cursor: urlLoading || !urlInput.trim() ? 'not-allowed' : 'pointer',
              opacity: urlLoading || !urlInput.trim() ? 0.6 : 1,
              fontFamily: "'IBM Plex Sans', sans-serif",
            }}
          >
            {urlLoading ? 'Fetching…' : 'Fetch deck'}
          </button>
        </div>
        {urlError && <div style={{ marginTop: '6px', fontSize: '12px', color: '#e2645c' }}>{urlError}</div>}
        {urlSuccess && <div style={{ marginTop: '6px', fontSize: '12px', color: '#7fd6a6' }}>{urlSuccess}</div>}
      </div>

      {divider}

      {/* ── Precon browser ─────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div>
            {sectionLabel('Commander precons')}
            <div style={{ fontSize: '12px', color: '#6f8a85', marginTop: '-4px' }}>
              Browse official preconstructed Commander decks from Scryfall.
            </div>
          </div>
          <button
            onClick={loadPrecons}
            style={{
              background: '#0e292b', border: '1px solid #214a47', borderRadius: '8px',
              padding: '7px 14px', fontSize: '12px', fontWeight: 600,
              color: '#8aa39d', cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif",
              flexShrink: 0, marginLeft: '16px',
            }}
          >
            {showPrecons ? 'Hide' : 'Browse →'}
          </button>
        </div>

        {showPrecons && (
          <div style={{ border: '1px solid #1d4441', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #1d4441', background: '#0b2022' }}>
              <input
                type="search"
                value={preconSearch}
                onChange={e => setPreconSearch(e.target.value)}
                placeholder="Search precon sets…"
                autoFocus
                style={{
                  width: '100%', background: '#0e292b', border: '1px solid #214a47',
                  borderRadius: '7px', padding: '7px 12px', color: '#eef3f0',
                  fontSize: '13px', outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              />
            </div>
            <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1px', background: '#1d4441' }}>
              {preconLoading && (
                <div style={{ gridColumn: '1/-1', padding: '24px', textAlign: 'center', color: '#6f8a85', fontSize: '13px', background: '#0c2426' }}>
                  Loading precon sets…
                </div>
              )}
              {preconSets.filter(s => !preconSearch || s.name.toLowerCase().includes(preconSearch.toLowerCase())).map(s => (
                <button key={s.code} onClick={() => selectPrecon(s.code)} style={{
                  padding: '11px 14px', background: selectedPrecon === s.code ? '#163436' : '#0c2426',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  borderLeft: selectedPrecon === s.code ? '3px solid #e8b14a' : '3px solid transparent',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#eef3f0', marginBottom: '2px' }}>{s.name}</div>
                  <div style={{ fontSize: '10px', color: '#5f7a76', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {s.code.toUpperCase()} · {s.released_at.slice(0, 7)} · {s.card_count}c
                  </div>
                </button>
              ))}
            </div>

            {selectedPrecon && (
              <div style={{ borderTop: '1px solid #1d4441', background: '#0b2022' }}>
                {preconCards.length === 0 ? (
                  <div style={{ padding: '16px', fontSize: '12px', color: '#6f8a85' }}>Loading decklist…</div>
                ) : (
                  <PreconCardList
                    cards={preconCards}
                    onUse={usePrecon}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {divider}

      {/* ── File upload ────────────────────────────────────────────────── */}
      <div>
        {sectionLabel('Upload deck file')}
        <label style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 16px',
          borderRadius: '9px', border: '1px dashed #214a47', background: '#0e272a',
          cursor: 'pointer', fontSize: '13px', color: '#8aa39d',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8b14a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Drop a .txt deck file, or click to browse</span>
          <input type="file" accept=".txt,.dec,.cod" style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]; if (!file) return;
              const reader = new FileReader();
              reader.onload = ev => { const t = ev.target?.result as string; if (t) setImportText(t); };
              reader.readAsText(file);
            }} />
        </label>
        <div style={{ fontSize: '11px', color: '#5f7a76', marginTop: '5px', fontFamily: "'IBM Plex Mono',monospace" }}>
          Arena, MTGO (.txt), Cockatrice (.cod)
        </div>
      </div>

      {/* ── Paste ──────────────────────────────────────────────────────── */}
      <div style={{ marginTop: '16px' }}>
        {sectionLabel('Or paste a decklist')}
        <textarea
          value={importText}
          onChange={e => setImportText(e.target.value)}
          rows={14}
          placeholder={"1 Sol Ring\n1 Command Tower\n4 Lightning Bolt\n// etc."}
          spellCheck={false}
          style={{
            width: '100%', fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px',
            background: 'var(--surface)', border: '1px solid var(--border-2)',
            borderRadius: 'var(--radius-md)', padding: '12px 14px',
            color: 'var(--text)', outline: 'none', resize: 'vertical', lineHeight: 1.7,
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
        <Btn onClick={onImport} disabled={importing || !importText.trim()}>
          {importing ? 'Importing…' : 'Import decklist'}
        </Btn>
        {result && (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: result.errors.length > 0 ? 'var(--warning)' : 'var(--green)' }}>
            {result.added} added{result.errors.length > 0 ? `, ${result.errors.length} not found` : ' ✓'}
          </span>
        )}
      </div>

      {result?.errors && result.errors.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: 'var(--text-faint)', marginBottom: '4px' }}>
            Not resolved (check spelling or run a Scryfall sync):
          </p>
          {result.errors.map((e, i) => (
            <p key={i} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: 'var(--red)' }}>{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AnalyticsTab ──────────────────────────────────────────────────────────────

interface AnalyticsData {
  total_cards: number;
  land_count: number;
  avg_cmc: number;
  cmc_histogram: Record<string, number>;
  color_counts: Record<string, number>;
  type_counts: Record<string, number>;
  rarity_counts: Record<string, number>;
  mana_source_counts: Record<string, number>;
  /** Per-card enrichment keyed by oracle_id. Populated by the analytics API. */
  card_data?: Record<string, { type_line: string | null; cmc: number | null }>;
}

const MANA_COLORS_FULL: Record<string, string> = {
  W: '#f7efd2', U: '#a9def9', B: '#bcb4ad', R: '#f3a48b', G: '#93c8a6', C: '#9bb3ad',
};
const TYPE_COLORS: Record<string, string> = {
  Creature: '#54c08a', Instant: '#a9def9', Sorcery: '#c4a8f0',
  Artifact: '#bcb4ad', Enchantment: '#f7efd2', Planeswalker: '#f4c463',
  Land: '#93c8a6', Other: '#6f8a85',
};
const RARITY_COLORS: Record<string, string> = {
  common: '#9bb3ad', uncommon: '#a9c0ba', rare: '#e8b14a', mythic: '#e2643c', other: '#6f8a85',
};
const CMC_BUCKETS = ['0','1','2','3','4','5','6','7+'];

function BarChart({ data, colors, label }: {
  data: Record<string, number>;
  colors: Record<string, string>;
  label?: string;
}) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div>
      {label && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>}
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
        {entries.map(([key, count]) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
            <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono',monospace" }}>{count}</span>
            <div style={{
              width: '100%', borderRadius: '3px 3px 0 0',
              height: `${Math.max(4, (count / max) * 60)}px`,
              background: colors[key] ?? '#6f8a85',
              transition: 'height 0.2s',
            }} />
            <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono',monospace", whiteSpace: 'nowrap' }}>{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManaCurve({ histogram }: { histogram: Record<string, number> }) {
  const max = Math.max(...CMC_BUCKETS.map(k => histogram[k] ?? 0), 1);
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase', letterSpacing: '1px' }}>Mana Curve</div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 80 }}>
        {CMC_BUCKETS.map(k => {
          const count = histogram[k] ?? 0;
          return (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
              <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono',monospace" }}>{count || ''}</span>
              <div style={{
                width: '100%', borderRadius: '3px 3px 0 0',
                height: `${Math.max(count > 0 ? 4 : 0, (count / max) * 60)}px`,
                background: `hsl(${200 - Math.min(parseInt(k), 7) * 18}, 55%, 55%)`,
              }} />
              <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono',monospace" }}>{k}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '10px 14px', background: 'var(--surface-2)',
      border: '1px solid var(--border)', borderRadius: 8,
      minWidth: 64,
    }}>
      <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: color ?? 'var(--text)' }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
    </div>
  );
}

function AnalyticsTab({ deck }: { deck: Deck }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [grouping, setGrouping] = useState<'type' | 'cmc' | 'alpha'>('type');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/deck/${deck.id}/analytics`)
      .then(r => r.json())
      .then(d => { setData(d as AnalyticsData); setLoading(false); })
      .catch(() => setLoading(false));
  }, [deck.id]);

  // Grouping for decklist view
  const nonCommanderEntries = mainboardEntries(deck).filter(e => !e.is_commander);

  const TYPE_ORDER = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Other'];
  const groupedEntries = (() => {
    if (grouping === 'alpha') {
      return { 'All cards': [...nonCommanderEntries].sort((a, b) => a.card_name.localeCompare(b.card_name)) };
    }
    if (grouping === 'type') {
      const groups: Record<string, typeof deck.entries> = {};
      for (const e of nonCommanderEntries) {
        const tl = (data?.card_data?.[e.oracle_id]?.type_line ?? '') as string;
        const key = TYPE_ORDER.find(t => tl.includes(t)) ?? 'Other';
        if (!groups[key]) groups[key] = [];
        groups[key].push(e);
      }
      // Sort within each group alphabetically
      for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.card_name.localeCompare(b.card_name));
      // Return in type order
      const ordered: Record<string, typeof deck.entries> = {};
      for (const t of TYPE_ORDER) if (groups[t]?.length) ordered[t] = groups[t];
      return ordered;
    }
    if (grouping === 'cmc') {
      const groups: Record<string, typeof deck.entries> = {};
      for (const e of nonCommanderEntries) {
        const tl = (data?.card_data?.[e.oracle_id]?.type_line ?? '') as string;
        if (tl.includes('Land')) { if (!groups['Land']) groups['Land'] = []; groups['Land'].push(e); continue; }
        const cmc = data?.card_data?.[e.oracle_id]?.cmc ?? null;
        const bucket = cmc == null ? '?' : cmc >= 7 ? '7+' : String(Math.floor(cmc));
        if (!groups[bucket]) groups[bucket] = [];
        groups[bucket].push(e);
      }
      // Sort buckets numerically
      const ordered: Record<string, typeof deck.entries> = {};
      for (const b of ['0','1','2','3','4','5','6','7+','?','Land']) {
        if (groups[b]?.length) ordered[b] = groups[b].sort((a, b) => a.card_name.localeCompare(b.card_name));
      }
      return ordered;
    }
    return { 'All cards': [...nonCommanderEntries].sort((a, b) => a.card_name.localeCompare(b.card_name)) };
  })();

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Loading analytics…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stat pills */}
      {data && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StatPill label="Cards" value={data.total_cards} />
          <StatPill label="Lands" value={data.land_count} color="#93c8a6" />
          <StatPill label="Avg CMC" value={data.avg_cmc.toFixed(2)} color="#a9def9" />
          {Object.entries(data.type_counts)
            .sort(([,a],[,b]) => b - a)
            .slice(0, 4)
            .map(([type, count]) => (
              <StatPill key={type} label={type} value={count} color={TYPE_COLORS[type]} />
            ))
          }
        </div>
      )}

      {/* Charts */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <ManaCurve histogram={data.cmc_histogram} />
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <BarChart data={data.color_counts} colors={MANA_COLORS_FULL} label="Colors" />
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <BarChart data={data.mana_source_counts} colors={MANA_COLORS_FULL} label="Mana Sources (by land CI)" />
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <BarChart data={data.type_counts} colors={TYPE_COLORS} label="Card Types" />
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <BarChart data={data.rarity_counts} colors={RARITY_COLORS} label="Rarity" />
          </div>
        </div>
      )}

      {/* Decklist grouping controls */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Group by:</span>
          {(['alpha', 'type', 'cmc'] as const).map(g => (
            <button key={g} onClick={() => setGrouping(g)} style={{
              padding: '3px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
              border: `1px solid ${grouping === g ? 'var(--accent)' : 'var(--border)'}`,
              background: grouping === g ? 'rgba(var(--accent-rgb, 232,177,74), 0.12)' : 'var(--surface)',
              color: grouping === g ? 'var(--accent)' : 'var(--text-faint)',
              fontFamily: "'IBM Plex Mono', monospace",
              textTransform: 'capitalize',
            }}>
              {g === 'alpha' ? 'A–Z' : g === 'type' ? 'Type' : 'CMC'}
            </button>
          ))}
        </div>

        {Object.entries(groupedEntries).map(([group, entries]) => (
          <div key={group} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontFamily: "'IBM Plex Mono',monospace" }}>
              {group} ({entries.reduce((s, e) => s + e.quantity, 0)})
            </div>
            {entries.map(e => (
              <div key={e.oracle_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                <span>
                  {e.quantity > 1 && <span style={{ color: 'var(--text-faint)', marginRight: 5, fontFamily: "'IBM Plex Mono',monospace" }}>{e.quantity}×</span>}
                  {e.card_name}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Primer tab ────────────────────────────────────────────────────────────────

function PrimerTab({ deck, onSaved }: { deck: Deck; onSaved: (d: Deck) => void }) {
  const [text, setText] = useState(deck.description ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  async function handleSave() {
    setSaving(true);
    try {
      await actionUpdateDeckMeta(deck.id, { description: text });
      onSaved({ ...deck, description: text });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const btnBase: React.CSSProperties = {
    padding: '4px 12px', border: '1px solid var(--border)', borderRadius: '6px',
    fontSize: '12px', cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif",
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>
            Deck primer
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: 0 }}>
            Supports markdown: **bold**, *italic*, # headings, lists, links, code.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setMode('write')}
            style={{ ...btnBase, background: mode === 'write' ? 'var(--surface-3)' : 'var(--surface)', color: mode === 'write' ? 'var(--text)' : 'var(--text-faint)' }}
          >
            Write
          </button>
          <button
            onClick={() => setMode('preview')}
            style={{ ...btnBase, background: mode === 'preview' ? 'var(--surface-3)' : 'var(--surface)', color: mode === 'preview' ? 'var(--text)' : 'var(--text-faint)' }}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === 'write' ? (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={16}
          placeholder="Describe your deck: strategy, synergies, win conditions, budget notes…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '8px', color: 'var(--text)',
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: '13.5px', lineHeight: 1.6,
            padding: '12px 14px', resize: 'vertical', outline: 'none',
          }}
        />
      ) : (
        <div
          className="primer"
          style={{
            minHeight: 260,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '12px 14px',
          }}
          dangerouslySetInnerHTML={{ __html: text ? renderMarkdown(text) : '<span style="color:var(--text-faint);font-size:13px">Nothing to preview yet.</span>' }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 10, alignItems: 'center' }}>
        {saved && <span style={{ fontSize: '12px', color: 'var(--green)' }}>✓ Saved</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '8px 20px', borderRadius: '8px',
            background: 'var(--accent)', color: '#0a1f22',
            border: 'none', cursor: saving ? 'default' : 'pointer',
            fontSize: '13px', fontWeight: 700,
            fontFamily: "'IBM Plex Sans', sans-serif",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save primer'}
        </button>
      </div>
    </div>
  );
}

function AddMissingToWishlistButton({ deckId }: { deckId: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'done'>('idle');
  const [added, setAdded] = useState(0);

  async function handle() {
    setState('pending');
    try {
      const result = await actionAddMissingToWishlist(deckId);
      setAdded(result.added);
      setState('done');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('idle');
    }
  }

  return (
    <button
      onClick={handle}
      disabled={state === 'pending'}
      style={{
        flexShrink: 0, fontSize: 12, padding: '5px 12px', borderRadius: 7,
        border: '1px solid var(--border)',
        background: state === 'done' ? 'rgba(84,192,138,0.12)' : 'var(--surface)',
        color: state === 'done' ? 'var(--green)' : 'var(--text-faint)',
        cursor: state === 'pending' ? 'default' : 'pointer',
        fontFamily: "'IBM Plex Sans', sans-serif",
        transition: 'background 0.15s, color 0.15s',
        opacity: state === 'pending' ? 0.7 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {state === 'done'
        ? `✓ Added ${added} card${added === 1 ? '' : 's'} to wishlist`
        : state === 'pending'
          ? 'Adding…'
          : '+ Add missing to wishlist'}
    </button>
  );
}
