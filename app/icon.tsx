import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#07151a',
        borderRadius: '6px',
      }}
    >
      {/* Gold diamond / lodestone shape */}
      <div style={{
        width: 18,
        height: 18,
        background: '#e8b14a',
        transform: 'rotate(45deg)',
        borderRadius: '3px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }} />
    </div>,
    { ...size },
  );
}
