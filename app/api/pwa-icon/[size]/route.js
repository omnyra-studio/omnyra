import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET(request, context) {
  const { size } = await context.params
  const px = Math.min(Math.max(parseInt(size) || 192, 32), 1024)
  const radius = Math.round(px * 0.18)
  const fontSize = Math.round(px * 0.56)

  return new ImageResponse(
    (
      <div
        style={{
          background: '#070710',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: `${radius}px`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: `${Math.round(px * 0.78)}px`,
            height: `${Math.round(px * 0.78)}px`,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #22d3ee 100%)',
          }}
        >
          <span
            style={{
              color: '#ffffff',
              fontSize: `${fontSize}px`,
              fontWeight: '900',
              fontFamily: 'sans-serif',
              lineHeight: 1,
              letterSpacing: '-0.02em',
            }}
          >
            O
          </span>
        </div>
      </div>
    ),
    { width: px, height: px }
  )
}
