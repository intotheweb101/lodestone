'use client';

import { useState, useEffect, useRef } from 'react';
import type { Shop } from '@/lib/db/queries';
import { Btn } from '@/components/ui';

interface SyncResult {
  ok: boolean;
  results: Record<string, unknown>;
}

interface LogLine { ts: string; msg: string }

function SyncLogPanel() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let dead = false;

    function connect() {
      if (dead) return;
      es = new EventSource(`/api/admin/sync-log?after=${seqRef.current}`);
      es.onmessage = (e) => {
        const { seq, lines: newLines } = JSON.parse(e.data) as { seq: number; lines: LogLine[] };
        if (newLines.length > 0) {
          seqRef.current = seq;
          setLines(prev => [...prev.slice(-400), ...newLines]);
        }
      };
      es.onerror = () => { es?.close(); if (!dead) setTimeout(connect, 3000); };
    }
    connect();
    return () => { dead = true; es?.close(); };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h2 style={{ fontWeight: 600, fontSize: 'var(--text-base)', margin: 0 }}>Sync log</h2>
        <button onClick={() => setLines([])} style={{ fontSize: '11px', color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
      </div>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', lineHeight: 1.6,
        background: '#0a1a1c', border: '1px solid #1a3a3c', borderRadius: '6px',
        padding: '10px 12px', height: '260px', overflowY: 'auto',
        color: '#8aa39d',
      }}>
        {lines.length === 0
          ? <span style={{ color: 'var(--text-faint)' }}>No activity yet — start a sync above.</span>
          : lines.map((l, i) => (
            <div key={i} style={{ color: l.msg.includes('ERROR') ? '#e2645c' : l.msg.includes('done') ? '#54c08a' : '#8aa39d' }}>
              <span style={{ color: '#4a6660', userSelect: 'none' }}>{l.ts.slice(11, 19)} </span>{l.msg}
            </div>
          ))
        }
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function AutoSyncSettings() {
  const [enabled, setEnabled] = useState(false);
  const [intervalHours, setIntervalHours] = useState(24);
  const [audNzdRate, setAudNzdRate] = useState('1.10');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/sync-settings')
      .then(r => r.json())
      .then((d: { auto_sync_enabled: number; sync_interval_hours: number; last_auto_sync_at: string | null; aud_nzd_rate: number | null }) => {
        setEnabled(!!d.auto_sync_enabled);
        setIntervalHours(d.sync_interval_hours ?? 24);
        setLastSync(d.last_auto_sync_at);
        setAudNzdRate(String(d.aud_nzd_rate ?? 1.10));
      })
      .catch(() => {});
  }, []);

  async function save(newEnabled: boolean, newInterval: number) {
    setSaving(true);
    try {
      await fetch('/api/sync-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_sync_enabled: newEnabled, sync_interval_hours: newInterval }),
      });
    } finally { setSaving(false); }
  }

  async function saveRate() {
    const rate = parseFloat(audNzdRate);
    if (!rate || rate <= 0) return;
    await fetch('/api/sync-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aud_nzd_rate: rate }),
    });
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontWeight: 600, fontSize: 'var(--text-base)', marginBottom: '0.25rem' }}>Auto sync</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Keep shop prices fresh automatically in the background.
          </p>
        </div>
        {/* Toggle */}
        <button
          onClick={() => { const n = !enabled; setEnabled(n); save(n, intervalHours); }}
          disabled={saving}
          style={{
            width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
            background: enabled ? '#e8b14a' : '#214a47',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}
          aria-label={enabled ? 'Disable auto sync' : 'Enable auto sync'}
        >
          <span style={{
            position: 'absolute', top: '3px',
            left: enabled ? '23px' : '3px',
            width: '18px', height: '18px', borderRadius: '50%',
            background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
      </div>

      {enabled && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Sync every</span>
          {[6, 12, 24, 48].map(h => (
            <button key={h} onClick={() => { setIntervalHours(h); save(enabled, h); }}
              style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                background: intervalHours === h ? 'rgba(232,177,74,0.15)' : 'var(--surface-2)',
                border: `1px solid ${intervalHours === h ? 'var(--accent)' : 'var(--border)'}`,
                color: intervalHours === h ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
              }}>
              {h}h
            </button>
          ))}
        </div>
      )}

      {lastSync && (
        <div style={{ marginTop: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
          Last auto sync: {new Date(lastSync).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.5rem' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>AUD → NZD rate</span>
        <input
          type="number" step="0.01" min="0.5" max="3"
          value={audNzdRate}
          onChange={e => setAudNzdRate(e.target.value)}
          onBlur={saveRate}
          style={{
            width: '72px', padding: '3px 6px', borderRadius: '6px',
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text)', fontFamily: "'IBM Plex Mono', monospace", fontSize: '13px',
          }}
        />
        <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Applied on next AUS shop sync</span>
      </div>
    </div>
  );
}

export function SyncPanel({ shops }: { shops: Shop[] }) {
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SyncResult | null>(null);

  const nzShops = shops.filter(s => !s.base_url?.includes('.com.au'));
  const ausShops = shops.filter(s => s.base_url?.includes('.com.au'));

  async function runSync(target: string, shopId?: number) {
    setRunning(true);
    setStatus(`Sync started — running in background. Check back in a few minutes.`);
    setResults(null);
    try {
      const url = `/api/admin/sync?target=${target}${shopId ? `&shop_id=${shopId}` : ''}`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json() as SyncResult;
      setResults(data);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      <AutoSyncSettings />

      <SyncLogPanel />

      <SyncCard
        title="Scryfall card data"
        description="Download all card printings, treatments, oracle text, legalities, and set metadata. ~250MB download, takes 2–3 min."
        badge="~80k cards"
        onSync={() => runSync('scryfall')}
        running={running}
      />

      <SyncCard
        title="All NZ shops"
        description="Fetch current stock and prices from all configured NZ retailers. Sequential to be polite — takes 5–15 min for full catalog."
        badge={`${shops.length} shops`}
        onSync={() => runSync('shops')}
        running={running}
      />

      {/* Individual shops */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '1.25rem',
      }}>
        <p style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '10px', color: 'var(--text-faint)',
          letterSpacing: '1.5px', textTransform: 'uppercase',
          marginBottom: '4px',
        }}>Individual shops</p>
        <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '1rem', lineHeight: 1.5 }}>
          Sync a single shop to refresh its stock faster.
        </p>

        {/* New Zealand */}
        {nzShops.length > 0 && (
          <div style={{ marginBottom: ausShops.length > 0 ? '1rem' : 0 }}>
            <p style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '9px', color: 'var(--text-faint)',
              letterSpacing: '1px', textTransform: 'uppercase',
              marginBottom: '6px',
            }}>New Zealand</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {nzShops.map(shop => (
                <ShopRow key={shop.id} shop={shop} running={running} onSync={runSync} />
              ))}
            </div>
          </div>
        )}

        {/* Australia */}
        {ausShops.length > 0 && (
          <div>
            <p style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '9px', color: 'var(--text-faint)',
              letterSpacing: '1px', textTransform: 'uppercase',
              marginBottom: '6px',
            }}>Australia</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {ausShops.map(shop => (
                <ShopRow key={shop.id} shop={shop} running={running} onSync={runSync} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      {(status || running) && (
        <div style={{
          background: running ? 'rgba(232,177,74,0.06)' : 'var(--surface)',
          border: `1px solid ${running ? 'rgba(232,177,74,0.3)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          {running && (
            <span style={{
              display: 'inline-block', width: '8px', height: '8px',
              borderRadius: '50%', background: 'var(--accent)',
              animation: 'ls-pulse 1s infinite',
            }} />
          )}
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px',
            color: running ? 'var(--accent)' : 'var(--text-muted)',
          }}>
            {status}
          </span>
        </div>
      )}

      {results?.results && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '12px 14px',
        }}>
          <pre style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '11px', color: 'var(--text-muted)',
            overflowX: 'auto', lineHeight: 1.7,
          }}>
            {JSON.stringify(results.results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ShopRow({ shop, running, onSync }: {
  shop: Shop;
  running: boolean;
  onSync: (target: string, shopId?: number) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px',
      background: 'var(--surface-2)', borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      gap: '10px',
    }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: '13px' }}>{shop.name}</span>
        <span style={{
          marginLeft: '8px',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '10px', color: 'var(--text-faint)',
        }}>
          Dialect {shop.dialect}
        </span>
        {shop.last_synced_at && (
          <span style={{
            marginLeft: '8px',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '10px', color: 'var(--text-faint)',
          }}>
            · {new Date(shop.last_synced_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
      <Btn size="sm" variant="ghost" onClick={() => onSync('shops', shop.id)} disabled={running}>
        Sync
      </Btn>
    </div>
  );
}

function SyncCard({ title, description, badge, onSync, running }: {
  title: string;
  description: string;
  badge: string;
  onSync: () => void;
  running: boolean;
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '1.25rem',
      display: 'flex', alignItems: 'flex-start', gap: '1rem',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
          <span style={{ fontWeight: 700, fontSize: '13.5px' }}>{title}</span>
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '10px', padding: '2px 6px',
            background: 'rgba(232,177,74,0.1)', color: 'var(--accent)',
            borderRadius: '3px', border: '1px solid rgba(232,177,74,0.25)',
          }}>{badge}</span>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-faint)', lineHeight: 1.55 }}>{description}</p>
      </div>
      <Btn onClick={onSync} disabled={running} style={{ flexShrink: 0 }}>
        {running ? 'Running…' : 'Sync now'}
      </Btn>
    </div>
  );
}
