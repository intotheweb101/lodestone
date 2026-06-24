'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useRouter } from 'next/navigation';

interface UserRow { id: string; email: string; name: string; username: string | null; role: string; created_at: string; deck_count: number; last_active: string | null }
interface ShopRow { id: number; name: string; base_url: string; dialect: string; region: string; last_synced_at: string | null; enabled: number }

interface ShopHealth {
  id: number; name: string; base_url: string; dialect: string; region: string;
  enabled: number;
  collection_handles: string[];
  last_synced_at: string | null;
  last_log: { started_at: string; finished_at: string | null; products: number; variants: number; matched: number } | null;
  variant_count: number;
  available_count: number;
  match_rate: number | null;
  errors: string[];
  in_progress: boolean;
  health: 'ok' | 'empty' | 'error' | 'dead' | 'pending';
}

interface SyncHealth {
  scryfall: { card_count: number; last_updated: string | null };
  shops: ShopHealth[];
  total_variants: number;
  total_available: number;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [newShop, setNewShop] = useState({ name: '', url: '', dialect: 'A', region: 'NZ' });
  const [tab, setTab] = useState<'users' | 'shops' | 'sync'>('sync');
  const [syncHealth, setSyncHealth] = useState<SyncHealth | null>(null);
  const [syncHealthLoading, setSyncHealthLoading] = useState(false);
  const [syncingShop, setSyncingShop] = useState<number | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) router.push('/');
  }, [user, loading, router]);

  const loadSyncHealth = useCallback(() => {
    setSyncHealthLoading(true);
    fetch('/api/admin/sync-health')
      .then(r => r.json())
      .then((d: SyncHealth) => setSyncHealth(d))
      .finally(() => setSyncHealthLoading(false));
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetch('/api/admin/users').then(r => r.json()).then((d: { users?: UserRow[] }) => setUsers(d.users ?? []));
      fetch('/api/admin/shops').then(r => r.json()).then((d: { shops?: ShopRow[] }) => setShops(d.shops ?? []));
      loadSyncHealth();
    }
  }, [user, loadSyncHealth]);

  async function syncShop(shopId: number) {
    setSyncingShop(shopId);
    try {
      await fetch(`/api/admin/sync?target=shops&shop_id=${shopId}`, { method: 'POST' });
      loadSyncHealth();
    } finally { setSyncingShop(null); }
  }

  async function syncAll(target: 'shops' | 'scryfall' | 'all') {
    setSyncingAll(true);
    try {
      await fetch(`/api/admin/sync?target=${target}`, { method: 'POST' });
      loadSyncHealth();
    } finally { setSyncingAll(false); }
  }

  async function toggleRole(id: string, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, role: newRole }) });
    setUsers(u => u.map(x => x.id === id ? { ...x, role: newRole } : x));
  }

  async function deleteUserById(id: string, name: string) {
    if (!confirm(`Delete user "${name}"? All their decks and data will be permanently removed.`)) return;
    const res = await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (res.ok) setUsers(u => u.filter(x => x.id !== id));
    else { const d = await res.json() as { error?: string }; alert(d.error ?? 'Failed to delete user'); }
  }

  async function resetPassword(id: string, email: string) {
    if (!confirm(`Reset password for ${email}? A temporary password will be generated.`)) return;
    const res = await fetch('/api/admin/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const d = await res.json() as { tempPassword?: string; error?: string };
    if (d.tempPassword) alert(`Temporary password for ${email}:\n\n${d.tempPassword}\n\nAsk them to change it after logging in.`);
    else alert(d.error ?? 'Failed to reset password');
  }

  async function addShop() {
    if (!newShop.name || !newShop.url) return;
    await fetch('/api/admin/shops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newShop) });
    fetch('/api/admin/shops').then(r => r.json()).then((d: { shops?: ShopRow[] }) => setShops(d.shops ?? []));
    setNewShop({ name: '', url: '', dialect: 'A', region: 'NZ' });
  }

  async function removeShop(id: number) {
    if (!confirm('Remove this shop? This will delete all its synced data.')) return;
    await fetch('/api/admin/shops', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setShops(s => s.filter(x => x.id !== id));
  }

  async function toggleShopEnabled(id: number, currentEnabled: number) {
    const enabled = currentEnabled ? 0 : 1;
    await fetch('/api/admin/shops', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, enabled }) });
    setShops(s => s.map(x => x.id === id ? { ...x, enabled } : x));
  }

  if (loading || !user || user.role !== 'admin') return null;

  const inputStyle: React.CSSProperties = { width: '100%', background: '#0e292b', border: '1px solid #214a47', borderRadius: '8px', padding: '8px 12px', color: '#eef3f0', fontSize: '13px', outline: 'none', fontFamily: "'IBM Plex Sans',sans-serif", boxSizing: 'border-box' };
  const cellStyle: React.CSSProperties = { padding: '10px 14px', fontSize: '13px', borderBottom: '1px solid #173a38' };

  return (
    <div style={{ padding: '32px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace", color: '#5f7a76', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>Admin Panel</div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#eef3f0' }}>Settings</h1>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: '#0c2426', borderRadius: '11px', padding: '4px', width: 'fit-content' }}>
        {(['sync', 'shops', 'users'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: "'IBM Plex Sans',sans-serif", background: tab === t ? '#14383a' : 'transparent', color: tab === t ? '#eef3f0' : '#6f8a85', outline: tab === t ? '1px solid #214a47' : 'none' }}>
            {t === 'users' ? `Users (${users.length})` : t === 'shops' ? `Shops (${shops.length})` : 'Sync Health'}
          </button>
        ))}
      </div>

      {tab === 'sync' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Summary bar */}
          {syncHealth && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {[
                { label: 'Scryfall cards', value: syncHealth.scryfall.card_count.toLocaleString(), color: '#7fd6a6' },
                { label: 'Total variants', value: syncHealth.total_variants.toLocaleString(), color: '#a9def9' },
                { label: 'Available now', value: syncHealth.total_available.toLocaleString(), color: '#54c08a' },
                { label: 'Working shops', value: `${syncHealth.shops.filter(s => s.health === 'ok').length} / ${syncHealth.shops.length}`, color: '#e8b14a' },
              ].map(stat => (
                <div key={stat.label} style={{ background: '#0f2a2c', border: '1px solid #1d4441', borderRadius: '12px', padding: '14px 18px' }}>
                  <div style={{ fontSize: '11px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '4px', letterSpacing: '1px', textTransform: 'uppercase' }}>{stat.label}</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: stat.color, fontFamily: "'IBM Plex Mono',monospace" }}>{stat.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => syncAll('shops')} disabled={syncingAll} style={{ background: '#e8b14a', color: '#0a1f22', fontWeight: 700, fontSize: '13px', padding: '9px 18px', borderRadius: '9px', border: 'none', cursor: syncingAll ? 'not-allowed' : 'pointer', opacity: syncingAll ? 0.6 : 1, fontFamily: "'IBM Plex Sans',sans-serif" }}>
              {syncingAll ? 'Syncing…' : '↻ Sync all shops'}
            </button>
            <button onClick={() => syncAll('scryfall')} disabled={syncingAll} style={{ background: '#0e292b', border: '1px solid #214a47', color: '#8aa39d', fontWeight: 600, fontSize: '13px', padding: '9px 18px', borderRadius: '9px', cursor: syncingAll ? 'not-allowed' : 'pointer', opacity: syncingAll ? 0.6 : 1, fontFamily: "'IBM Plex Sans',sans-serif" }}>
              ↻ Re-sync Scryfall
            </button>
            <button onClick={loadSyncHealth} disabled={syncHealthLoading} style={{ background: 'none', border: '1px solid #1d4441', color: '#6f8a85', fontSize: '13px', padding: '9px 14px', borderRadius: '9px', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
              {syncHealthLoading ? 'Refreshing…' : '⟳ Refresh'}
            </button>
            {syncHealth?.scryfall.last_updated && (
              <span style={{ fontSize: '11px', color: '#3a5a56', fontFamily: "'IBM Plex Mono',monospace", marginLeft: '4px' }}>
                Scryfall updated {new Date(syncHealth.scryfall.last_updated).toLocaleDateString('en-NZ')}
              </span>
            )}
          </div>

          {/* Per-shop cards */}
          {syncHealthLoading && !syncHealth && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#5f7a76', fontSize: '13px' }}>Loading sync status…</div>
          )}
          {syncHealth?.shops.map(sh => {
            const healthColors = { ok: '#54c08a', empty: '#e8b14a', error: '#e2645c', dead: '#e2645c', pending: '#a9def9' };
            const healthLabels = { ok: 'OK', empty: 'Empty', error: 'Error', dead: 'Unreachable', pending: 'In progress…' };
            const hc = sh.enabled ? healthColors[sh.health] : '#5f7a76';
            return (
              <div key={sh.id} style={{ background: '#0f2a2c', border: `1px solid ${!!sh.enabled && sh.health === 'ok' ? '#1d4441' : `${hc}33`}`, borderRadius: '12px', padding: '16px 20px', opacity: !!sh.enabled ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#eef3f0' }}>{sh.name}</span>
                      {!!sh.enabled ? (
                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, background: `${hc}18`, color: hc, border: `1px solid ${hc}44` }}>
                          {healthLabels[sh.health]}
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, background: 'rgba(95,122,118,0.1)', color: '#5f7a76', border: '1px solid rgba(95,122,118,0.2)' }}>
                          Disabled
                        </span>
                      )}
                      <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', fontFamily: "'IBM Plex Mono',monospace", background: sh.region === 'NZ' ? 'rgba(84,192,138,0.1)' : 'rgba(169,222,249,0.1)', color: sh.region === 'NZ' ? '#7fd6a6' : '#a9def9', border: `1px solid ${sh.region === 'NZ' ? 'rgba(84,192,138,0.3)' : 'rgba(169,222,249,0.3)'}` }}>
                        {sh.region}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace", marginBottom: '8px' }}>
                      {sh.base_url} · {sh.collection_handles.join(', ')} · Dialect {sh.dialect}
                    </div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: '#8aa39d' }}>
                        <span style={{ color: '#eef3f0', fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace" }}>{sh.variant_count.toLocaleString()}</span> variants
                      </span>
                      <span style={{ fontSize: '12px', color: '#8aa39d' }}>
                        <span style={{ color: '#7fd6a6', fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace" }}>{sh.available_count.toLocaleString()}</span> available
                      </span>
                      {sh.match_rate !== null && (
                        <span style={{ fontSize: '12px', color: '#8aa39d' }}>
                          <span style={{ color: sh.match_rate > 80 ? '#7fd6a6' : sh.match_rate > 50 ? '#e8b14a' : '#e2645c', fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace" }}>{sh.match_rate}%</span> matched
                        </span>
                      )}
                      {sh.last_synced_at && (
                        <span style={{ fontSize: '12px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace" }}>
                          synced {new Date(sh.last_synced_at).toLocaleString('en-NZ', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}
                    </div>
                    {!!sh.enabled && sh.errors.length > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        {sh.errors.slice(0, 2).map((e, i) => (
                          <div key={i} style={{ fontSize: '11px', color: '#e2645c', fontFamily: "'IBM Plex Mono',monospace", background: 'rgba(226,100,92,0.08)', border: '1px solid rgba(226,100,92,0.2)', borderRadius: '6px', padding: '4px 8px', marginTop: '4px', wordBreak: 'break-all' }}>
                            {e}
                          </div>
                        ))}
                        {sh.errors.length > 2 && <div style={{ fontSize: '11px', color: '#8a5050', marginTop: '2px' }}>+ {sh.errors.length - 2} more errors</div>}
                      </div>
                    )}
                  </div>
                  {!!sh.enabled && (
                    <button
                      onClick={() => syncShop(sh.id)}
                      disabled={syncingShop === sh.id || sh.in_progress}
                      style={{
                        flexShrink: 0, background: '#0e292b', border: '1px solid #214a47',
                        color: '#8aa39d', fontSize: '12px', fontWeight: 600,
                        padding: '7px 14px', borderRadius: '8px',
                        cursor: syncingShop === sh.id || sh.in_progress ? 'not-allowed' : 'pointer',
                        opacity: syncingShop === sh.id || sh.in_progress ? 0.6 : 1,
                        fontFamily: "'IBM Plex Sans',sans-serif",
                      }}
                    >
                      {syncingShop === sh.id ? 'Syncing…' : sh.in_progress ? 'Running…' : '↻ Sync'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'users' && (
        <div style={{ background: '#0f2a2c', border: '1px solid #1d4441', borderRadius: '14px', overflow: 'hidden' }} className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
            <thead>
              <tr style={{ background: '#0c2426' }}>
                {['User', 'Email', 'Role', 'Decks', 'Joined', ''].map(h => (
                  <th key={h} style={{ ...cellStyle, textAlign: 'left', fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace", color: '#5f7a76', letterSpacing: '1px', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ background: u.id === user.id ? 'rgba(232,177,74,0.03)' : 'transparent' }}>
                  <td style={cellStyle}>
                    <div style={{ fontWeight: 600, color: '#eef3f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {u.name}
                      {u.id === user.id && <span style={{ fontSize: '10px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace" }}>you</span>}
                    </div>
                    {u.username && <div style={{ fontSize: '11px', color: '#5f7a76', fontFamily: "'IBM Plex Mono',monospace" }}>@{u.username}</div>}
                  </td>
                  <td style={{ ...cellStyle, color: '#8aa39d', fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</td>
                  <td style={cellStyle}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', fontFamily: "'IBM Plex Mono',monospace", background: u.role === 'admin' ? 'rgba(232,177,74,0.15)' : 'rgba(84,192,138,0.1)', color: u.role === 'admin' ? '#e8b14a' : '#7fd6a6', border: `1px solid ${u.role === 'admin' ? 'rgba(232,177,74,0.4)' : 'rgba(84,192,138,0.3)'}` }}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px', color: u.deck_count > 0 ? '#a9def9' : '#3a5a56' }}>
                    {u.deck_count}
                    {u.last_active && <div style={{ fontSize: '10px', color: '#3a5a56' }}>{new Date(u.last_active).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}</div>}
                  </td>
                  <td style={{ ...cellStyle, color: '#6f8a85', fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace" }}>{new Date(u.created_at).toLocaleDateString('en-NZ')}</td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button onClick={() => resetPassword(u.id, u.email)} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(232,177,74,0.3)', background: 'rgba(232,177,74,0.08)', color: '#e8b14a', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                        Reset password
                      </button>
                      {u.id !== user.id && (
                        <>
                          <button onClick={() => toggleRole(u.id, u.role)} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #214a47', background: 'transparent', color: '#8aa39d', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                            {u.role === 'admin' ? 'Demote' : 'Make admin'}
                          </button>
                          <button onClick={() => deleteUserById(u.id, u.name)} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(226,100,92,0.3)', background: 'rgba(226,100,92,0.08)', color: '#e2645c', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'shops' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#0f2a2c', border: '1px solid #1d4441', borderRadius: '14px', padding: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#8aa39d', marginBottom: '14px', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '1px', textTransform: 'uppercase' }}>Add shop</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <input placeholder="Shop name" value={newShop.name} onChange={e => setNewShop(s => ({ ...s, name: e.target.value }))} style={inputStyle} />
              <input placeholder="https://shop.co.nz" value={newShop.url} onChange={e => setNewShop(s => ({ ...s, url: e.target.value }))} style={inputStyle} />
              <select value={newShop.dialect} onChange={e => setNewShop(s => ({ ...s, dialect: e.target.value }))} style={inputStyle}>
                <option value="A">Dialect A</option>
                <option value="B">Dialect B</option>
              </select>
              <select value={newShop.region} onChange={e => setNewShop(s => ({ ...s, region: e.target.value }))} style={inputStyle}>
                <option value="NZ">NZ</option>
                <option value="AUS">AUS</option>
              </select>
            </div>
            <button onClick={addShop} style={{ background: '#e8b14a', color: '#0a1f22', fontWeight: 700, fontSize: '13px', padding: '9px 20px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
              Add shop
            </button>
          </div>

          <div style={{ background: '#0f2a2c', border: '1px solid #1d4441', borderRadius: '14px', overflow: 'hidden' }} className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: '#0c2426' }}>
                  {['Shop', 'URL', 'Region', 'Last synced', 'Status', ''].map(h => (
                    <th key={h} style={{ ...cellStyle, textAlign: 'left', fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace", color: '#5f7a76', letterSpacing: '1px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shops.map(s => (
                  <tr key={s.id} style={{ opacity: !!s.enabled ? 1 : 0.5 }}>
                    <td style={{ ...cellStyle, fontWeight: 600, color: '#eef3f0' }}>{s.name}</td>
                    <td style={{ ...cellStyle, color: '#6f8a85', fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace", maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.base_url}</td>
                    <td style={cellStyle}>
                      <span style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace", padding: '2px 6px', borderRadius: '4px', background: s.region === 'NZ' ? 'rgba(84,192,138,0.1)' : 'rgba(169,222,249,0.1)', color: s.region === 'NZ' ? '#7fd6a6' : '#a9def9', border: `1px solid ${s.region === 'NZ' ? 'rgba(84,192,138,0.3)' : 'rgba(169,222,249,0.3)'}` }}>
                        {s.region}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, color: '#6f8a85', fontSize: '12px', fontFamily: "'IBM Plex Mono',monospace" }}>
                      {s.last_synced_at ? new Date(s.last_synced_at).toLocaleDateString('en-NZ') : '—'}
                    </td>
                    <td style={cellStyle}>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', fontFamily: "'IBM Plex Mono',monospace", background: !!s.enabled ? 'rgba(84,192,138,0.1)' : 'rgba(95,122,118,0.1)', color: !!s.enabled ? '#7fd6a6' : '#5f7a76', border: `1px solid ${!!s.enabled ? 'rgba(84,192,138,0.3)' : 'rgba(95,122,118,0.2)'}` }}>
                        {!!s.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => toggleShopEnabled(s.id, s.enabled)} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #214a47', background: 'transparent', color: '#8aa39d', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                          {!!s.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => removeShop(s.id)} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(226,100,92,0.3)', background: 'rgba(226,100,92,0.08)', color: '#e2645c', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
