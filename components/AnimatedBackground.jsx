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
        background: 'radial-gradient(ellipse at center, rgba(45,10,62,0.3) 0%, rgba(30,5,45,0.5) 100%)',
      }} />
    </div>
  )
}
