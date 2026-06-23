'use client';

import { useState, useRef, useTransition } from 'react';
import { actionImportCollectionCsv } from '@/app/actions';
import type { ImportReport } from '@/lib/collection/import';
import type { ImportMode } from '@/lib/collection/import';

export function CollectionImportClient() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ImportMode>('merge');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, startTransition] = useTransition();
  const [showErrors, setShowErrors] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setText((ev.target?.result as string) ?? '');
    reader.readAsText(file, 'utf-8');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setText((ev.target?.result as string) ?? '');
    reader.readAsText(file, 'utf-8');
  }

  function handleImport() {
    if (!text.trim()) return;
    setReport(null);
    startTransition(async () => {
      const r = await actionImportCollectionCsv(text, mode);
      setReport(r);
      setShowErrors(false);
    });
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '7px', color: 'var(--text)', fontSize: '12.5px',
    padding: '6px 12px', outline: 'none', fontFamily: "'IBM Plex Sans', sans-serif",
    cursor: 'pointer',
  };

  const FORMAT_NOTES: Record<string, string> = {
    manabox:   'ManaBox (Name, Set code, Collector number, Quantity, Foil)',
    moxfield:  'Moxfield (Count, Name, Edition, Collector Number, Foil)',
    archidekt: 'Archidekt (Quantity, Name, Set Code, Collector Number, Finish)',
    generic:   'Generic (qty name [set]) or plain card list',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Format hints */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px' }}>
        <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
          Supported formats (auto-detected)
        </div>
        {Object.entries(FORMAT_NOTES).map(([k, v]) => (
          <div key={k} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 3 }}>
            <strong style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>{k}:</strong> {v}
          </div>
        ))}
      </div>

      {/* Drop zone / file picker */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        style={{
          border: '2px dashed var(--border)', borderRadius: '10px',
          padding: '24px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13,
          background: 'var(--surface)',
        }}
      >
        Drop a CSV file here, or{' '}
        <button
          onClick={() => fileRef.current?.click()}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
        >
          browse
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
      </div>

      {/* Paste area */}
      <div>
        <label style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
          Or paste CSV content
        </label>
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); setReport(null); }}
          rows={10}
          placeholder={'Name,Set code,Collector number,Quantity,Foil\nBlack Lotus,LEA,232,1,false\n...'}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '8px', color: 'var(--text)',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '12px', lineHeight: 1.5,
            padding: '10px 12px', resize: 'vertical', outline: 'none',
          }}
        />
      </div>

      {/* Options row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1px', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
            Import mode
          </label>
          <select value={mode} onChange={e => setMode(e.target.value as ImportMode)} style={inputStyle}>
            <option value="merge">Merge (add to existing quantities)</option>
            <option value="replace">Replace (overwrite existing quantities)</option>
          </select>
        </div>
        <button
          onClick={handleImport}
          disabled={!text.trim() || pending}
          style={{
            marginTop: 16, padding: '9px 24px', borderRadius: '8px',
            background: 'var(--accent)', color: '#0a1f22',
            border: 'none', cursor: (!text.trim() || pending) ? 'default' : 'pointer',
            fontSize: '13px', fontWeight: 700, fontFamily: "'IBM Plex Sans', sans-serif",
            opacity: (!text.trim() || pending) ? 0.6 : 1,
          }}
        >
          {pending ? 'Importing…' : 'Import'}
        </button>
      </div>

      {/* Report */}
      {report && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px 18px' }}>
          <div style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-faint)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
            Import result — {report.formatDetected} format
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { label: 'Total rows', value: report.totalRows },
              { label: 'Matched', value: report.matched, ok: true },
              { label: 'Added new', value: report.added, ok: true },
              { label: 'Merged qty', value: report.mergedQty, ok: true },
              { label: 'Unmatched', value: report.unmatched.length, warn: report.unmatched.length > 0 },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 2 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: s.warn ? 'var(--warning)' : s.ok ? 'var(--green)' : 'var(--text)' }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {report.unmatched.length > 0 && (
            <div>
              <button
                onClick={() => setShowErrors(v => !v)}
                style={{ background: 'none', border: 'none', color: 'var(--warning)', fontSize: 12, cursor: 'pointer', padding: 0 }}
              >
                {showErrors ? '▾' : '▸'} {report.unmatched.length} unmatched rows
              </button>
              {showErrors && (
                <div style={{
                  marginTop: 8, maxHeight: 240, overflowY: 'auto',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: '6px', padding: '8px 12px',
                }}>
                  {report.unmatched.map((u, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-faint)', padding: '2px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{u.name}</span>
                      <span style={{ color: 'var(--red)', fontSize: 11 }}>{u.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {report.unmatched.length === 0 && report.matched > 0 && (
            <p style={{ fontSize: 12, color: 'var(--green)' }}>All rows imported successfully.</p>
          )}
        </div>
      )}
    </div>
  );
}
