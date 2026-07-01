'use client';
import { useEffect, useRef } from 'react';

/**
 * Requests a screen wake lock so the display stays on during play.
 * Re-acquires automatically when the page becomes visible again.
 * No-ops silently on browsers that don't support the Wake Lock API.
 */
export function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    async function acquire() {
      try {
        lockRef.current = await (navigator as Navigator & { wakeLock: { request(type: string): Promise<WakeLockSentinel> } }).wakeLock.request('screen');
      } catch {
        // Denied or not supported — ignore silently
      }
    }

    acquire();

    // Re-acquire when tab becomes visible (lock is released on tab hide)
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') acquire();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, []);
}
