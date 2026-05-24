'use client'

export default function AnimatedBackground() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 0,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        inset: '-10%',
        width: '120%',
        height: '120%',
        backgroundImage: 'url(/bg-abstract.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        animation: 'bgBreath 10s ease-in-out infinite',
        filter: 'brightness(0.7) saturate(1.3)',
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(13,0,16,0.72) 0%, rgba(13,0,16,0.55) 50%, rgba(13,0,16,0.25) 100%)',
      }} />
    </div>
  )
}
