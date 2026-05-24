'use client'

export default function AnimatedBackground({ className = '' }) {
  return (
    <>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(135deg, #0D0010 0%, #1f0828 40%, #3D0734 70%, #0D0010 100%)',
        zIndex: 0,
      }} />
      <video
        autoPlay
        loop
        muted
        playsInline
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.55,
          mixBlendMode: 'screen',
          filter: 'hue-rotate(240deg) saturate(1.4) brightness(1.1)',
          zIndex: 1,
        }}
      >
        <source src="/bg-video.mp4" type="video/mp4" />
      </video>
    </>
  )
}
