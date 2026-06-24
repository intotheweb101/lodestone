'use client';
import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { actionBulkPasteToCollection } from '@/app/actions';
import type { ImportReport } from '@/lib/collection/import';

type Mode = 'merge' | 'replace';

const PLACEHOLDER = `4 Lightning Bolt
2 Sol Ring
1 Black Lotus
3 Counterspell`;

export function QuickAddPanel() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('merge');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  function toggle() {
    setOpen(v => !v);
    setReport(null);
    setError(null);
  }

  function submit() {
    if (!text.trim() || isPending) return;
    setError(null);
    setReport(null);
    startTransition(async () => {
      try {
        const result = await actionBulkPasteToCollection(text, mode) as ImportReport;
        setReport(result);
        if (result.added > 0 || result.mergedQty > 0) {
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    });
  }

  function reset() {
    setText('');
    setReport(null);
    setError(null);
    textareaRef.current?.focus();
  }

  const lineCount = text.split('\n').filter(l => l.trim()).length;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Toggle button */}
      <button
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: "'IBM Plex Sans', sans-serif",
          background: open ? 'rgba(232,177,74,0.1)' : 'var(--surface)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          color: open ? 'var(--accent)' : 'var(--text-muted)',
          transition: 'all 0.12s',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        Quick add
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          marginTop: 8, padding: '16px 18px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, maxWidth: 520,
        }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
              Paste a card list
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              One card per line: <code style={{ fontFamily: "'IBM Plex Mono', monospace", background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3 }}>4 Lightning Bolt</code>
              {' '}or Arena export format.
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => { setText(e.target.value); setReport(null); }}
            placeholder={PLACEHOLDER}
            rows={7}
            disabled={isPending}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 12px',
              color: 'var(--text)', fontSize: 12.5,
              fontFamily: "'IBM Plex Mono', monospace",
              resize: 'vertical', outline: 'none',
              lineHeight: 1.7, minHeight: 120,
              opacity: isPending ? 0.5 : 1,
            }}
          />

          {/* Mode + submit row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['merge', 'replace'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  title={m === 'merge' ? 'Add to existing quantities' : 'Set exact quantities (overwrites)'}
                  style={{
                    padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
                    background: mode === m ? 'rgba(232,177,74,0.12)' : 'var(--surface-2)',
                    border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
                    color: mode === m ? 'var(--accent)' : 'var(--text-faint)',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              {lineCount > 0 && !isPending && !report && (
                <span style={{ fontSize: 11, color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {lineCount} line{lineCount !== 1 ? 's' : ''}
                </span>
              )}
              <button
                onClick={submit}
                disabled={!text.trim() || isPending}
                style={{
                  padding: '7px 18px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                  cursor: text.trim() && !isPending ? 'pointer' : 'not-allowed',
                  background: text.trim() && !isPending ? 'var(--accent)' : 'var(--surface-2)',
                  border: `1px solid ${text.trim() && !isPending ? 'var(--accent)' : 'var(--border)'}`,
                  color: text.trim() && !isPending ? '#0a1f22' : 'var(--text-faintest)',
                  transition: 'all 0.12s',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}
              >
                {isPending ? 'Adding…' : 'Add to collection'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(232,122,107,0.1)', border: '1px solid rgba(232,122,107,0.25)', fontSize: 12, color: '#e87a6b' }}>
              {error}
            </div>
          )}

          {/* Report */}
          {report && (
            <div style={{ marginTop: 12 }}>
              {/* Summary chips */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {report.added > 0 && (
                  <span style={{ padding: '3px 10px', borderRadius: 5, fontSize: 11.5, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", background: 'rgba(72,200,160,0.12)', border: '1px solid rgba(72,200,160,0.3)', color: '#48c8a0' }}>
                    +{report.added} new
                  </span>
                )}
                {report.mergedQty > 0 && (
                  <span style={{ padding: '3px 10px', borderRadius: 5, fontSize: 11.5, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", background: 'rgba(169,192,186,0.1)', border: '1px solid rgba(169,192,186,0.25)', color: '#a9c0ba' }}>
                    +{report.mergedQty} qty merged
                  </span>
                )}
                {report.unmatched.length > 0 && (
                  <span style={{ padding: '3px 10px', borderRadius: 5, fontSize: 11.5, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", background: 'rgba(232,177,74,0.08)', border: '1px solid rgba(232,177,74,0.2)', color: '#e8b14a' }}>
                    {report.unmatched.length} not found
                  </span>
                )}
                {report.added === 0 && report.mergedQty === 0 && report.unmatched.length === 0 && (
                  <span style={{ padding: '3px 10px', borderRadius: 5, fontSize: 11.5, color: 'var(--text-faint)' }}>
                    Nothing to add
                  </span>
                )}
              </div>

              {/* Unmatched list */}
              {report.unmatched.length > 0 && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', maxHeight: 140, overflowY: 'auto' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faintest)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                    Not found in database
                  </div>
                  {report.unmatched.map((u, i) => (
                    <div key={i} style={{ fontSize: 11.5, color: 'var(--text-faint)', padding: '2px 0', borderBottom: i < report.unmatched.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      {u.name}
                    </div>
                  ))}
                </div>
              )}

              {/* Add more / done */}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={reset} style={{
                  padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}>
                  Add more
                </button>
                <button onClick={() => setOpen(false)} style={{
                  padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: 'transparent', border: '1px solid transparent', color: 'var(--text-faint)',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                }}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
