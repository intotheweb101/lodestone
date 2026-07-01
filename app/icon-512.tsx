import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon512() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Maskable icon: keep the design within the safe zone (central 80%)
        background: '#07151a',
      }}
    >
      {/* Gold lodestone diamond — sized for maskable safe zone */}
      <div style={{
        width: 280,
        height: 280,
        background: '#e8b14a',
        transform: 'rotate(45deg)',
        borderRadius: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }} />
    </div>,
    { ...size },
  );
}
