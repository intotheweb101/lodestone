import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, #102d2f 0%, #07151a 100%)',
      }}
    >
      {/* Outer ring */}
      <div style={{
        width: 120,
        height: 120,
        borderRadius: '50%',
        border: '3px solid rgba(232,177,74,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Gold diamond */}
        <div style={{
          width: 64,
          height: 64,
          background: 'linear-gradient(135deg, #f0c060 0%, #e8b14a 50%, #c8841a 100%)',
          transform: 'rotate(45deg)',
          borderRadius: '10px',
          boxShadow: '0 0 24px rgba(232,177,74,0.4)',
        }} />
      </div>
    </div>,
    { ...size },
  );
}
