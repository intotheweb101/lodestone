import { ImageResponse } from 'next/og';

export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon192() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#07151a',
        borderRadius: '36px',
      }}
    >
      {/* Gold lodestone diamond */}
      <div style={{
        width: 104,
        height: 104,
        background: '#e8b14a',
        transform: 'rotate(45deg)',
        borderRadius: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }} />
    </div>,
    { ...size },
  );
}
