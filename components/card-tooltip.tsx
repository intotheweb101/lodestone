'use client';

import { useState, useCallback, type ReactNode } from 'react';

const IMG_W = 200;
// Scryfall card aspect ratio ~0.717 (width/height)
const IMG_H = Math.round(IMG_W / 0.717); // ~279

/**
 * Wraps any card name text. On hover, floats a card image near the cursor.
 * Renders children as-is when imageUrl is null/undefined.
 */
export function CardTooltip({
  children,
  imageUrl,
}: {
  children: ReactNode;
  imageUrl?: string | null;
}) {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Default: right of the trigger; flip left if it would overflow
    let x = rect.right + 10;
    if (x + IMG_W > vw - 8) x = rect.left - IMG_W - 10;

    // Align to top of trigger; clamp so image stays on screen
    let y = rect.top;
    if (y + IMG_H > vh - 8) y = vh - IMG_H - 8;
    if (y < 8) y = 8;

    setCoords({ x, y });
  }, []);

  const hide = useCallback(() => setCoords(null), []);

  if (!imageUrl) return <>{children}</>;

  return (
    <>
      <span onMouseEnter={show} onMouseLeave={hide} style={{ cursor: 'default' }}>
        {children}
      </span>
      {coords && (
        <span
          aria-hidden
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            zIndex: 9999,
            pointerEvents: 'none',
            width: IMG_W,
            borderRadius: 9,
            overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <img src={imageUrl} alt="" width={IMG_W} style={{ display: 'block', width: '100%' }} />
        </span>
      )}
    </>
  );
}
