'use client';

import { useState } from 'react';
import { actionCreatePriceAlert, actionDeletePriceAlert, actionListPriceAlerts } from '@/app/actions';
import { useEffect } from 'react';

interface PriceAlertButtonProps {
  oracleId: string;
  cardName: string;
  matchKey?: string;
  finish?: string;
  isLoggedIn: boolean;
}

export function PriceAlertButton({ oracleId, cardName, matchKey, finish = 'nonfoil', isLoggedIn }: PriceAlertButtonProps) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    actionListPriceAlerts().then(alerts => {
      const existing = alerts.find(a => a.oracle_id === oracleId && a.finish === finish && !a.triggered_at);
      if (existing) { setExistingId(existing.id); setTarget(String(existing.target_nzd)); setSaved(true); }
    }).catch(() => {});
  }, [oracleId, finish, isLoggedIn]);

  if (!isLoggedIn) return (
    <a href="/login" style={{ fontSize: 12, color: 'var(--text-faint)', textDecoration: 'underline' }}>
      Log in to set price alerts
    </a>
  );

  async function handleSave() {
    const val = parseFloat(target);
    if (!val || val <= 0) return;
    setSaving(true);
    try {
      const alert = await actionCreatePriceAlert({ oracleId, cardName, matchKey, finish, targetNzd: val });
      setExistingId(alert.id);
      setSaved(true);
      setOpen(false);
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!existingId) return;
    await actionDeletePriceAlert(existingId);
    setExistingId(null); setSaved(false); setTarget('');
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {saved && !open ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--accent)', background: 'rgba(232,177,74,0.1)', border: '1px solid rgba(232,177,74,0.3)', borderRadius: 6, padding: '4px 10px' }}>
            🔔 Alert set: NZD ${target}
          </span>
          <button onClick={() => setOpen(true)} style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Edit
          </button>
          <button onClick={handleDelete} style={{ fontSize: 11, color: '#e2645c', background: 'none', border: 'none', cursor: 'pointer' }}>
            Remove
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 6,
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', cursor: 'pointer',
          }}
        >
          🔔 Set price alert
        </button>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)', padding: '14px 16px', width: 240,
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Price alert — {finish}</div>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10, lineHeight: 1.5 }}>
            Notify me when this card drops below this price in NZD.
          </p>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>NZD $</span>
            <input
              type="number" min="0.01" step="0.01"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="e.g. 5.00"
              style={{ flex: 1, padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13 }}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={handleSave}
              disabled={saving || !target}
              style={{ flex: 1, padding: '6px', borderRadius: 6, background: 'var(--accent)', border: 'none', color: '#0a1f22', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
            >
              {saving ? 'Saving…' : 'Set alert'}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />}
    </div>
  );
}
