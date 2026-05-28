'use client'
import { useState } from 'react'

const STYLES = [
  { id: 'lifestyle',  label: '🌿 Lifestyle', desc: 'Natural, authentic' },
  { id: 'product',   label: '📦 Product',   desc: 'Studio, commercial' },
  { id: 'thumbnail', label: '🎯 Thumbnail', desc: 'Bold, viral' },
  { id: 'portrait',  label: '👤 Avatar Scene', desc: 'Cinematic, polished' },
  { id: 'ugc',       label: '📱 UGC',       desc: 'Raw, relatable' },
]

const RATIOS = [
  { id: '9:16',  label: '9:16',  desc: 'TikTok/Reels' },
  { id: '1:1',   label: '1:1',   desc: 'Square' },
  { id: '16:9',  label: '16:9',  desc: 'YouTube' },
]

const GOLD = '#C9A84C'
const BORDER = 'rgba(201,168,76,0.3)'

export default function ImageGenerator({ concept, template, niche, platforms, onImageSelect }) {
  const [style, setStyle]               = useState('lifestyle')
  const [ratio, setRatio]               = useState('9:16')
  const [quality, setQuality]           = useState('fast')
  const [images, setImages]             = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [error, setError]               = useState(null)
  const [imagePrompt, setImagePrompt]   = useState('')
  const [showPrompt, setShowPrompt]     = useState(false)
  const [uploadedScene, setUploadedScene] = useState(null)

  function handleSelectImage(i, url) {
    setSelectedIndex(i)
    onImageSelect?.(url)
  }

  function handleUploadScene(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      setUploadedScene(dataUrl)
      setSelectedIndex(null)
      onImageSelect?.(dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleGenerate() {
    setIsGenerating(true)
    setImages([])
    setSelectedIndex(null)
    setError(null)

    try {
      let prompt = imagePrompt

      // Only fetch from Claude if prompt not yet set (or was cleared)
      if (!prompt) {
        const enhanceRes = await fetch('/api/enhance-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ concept, template, niche, style, platforms }),
        })
        const data = await enhanceRes.json()
        if (!data.prompt) throw new Error('Prompt enhancement failed')
        prompt = data.prompt
        setImagePrompt(prompt)
      }

      // Flux generates the images — always include a fresh seed so regeneration produces different results
      const imgRes = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, quality, aspect_ratio: ratio, num_images: 4, seed: Date.now() }),
      })
      const imgData = await imgRes.json()
      if (!imgRes.ok) throw new Error(imgData.error || 'Generation failed')
      setImages(imgData.images ?? [])
      setShowPrompt(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div style={{
      background: 'rgba(45,10,62,0.8)',
      border: `1px solid ${BORDER}`,
      borderRadius: 16,
      padding: 28,
      marginTop: 24,
    }}>
      <h3 style={{
        color: GOLD,
        textAlign: 'center',
        letterSpacing: '0.1em',
        fontSize: 13,
        fontWeight: 700,
        textTransform: 'uppercase',
        margin: '0 0 6px',
      }}>
        ✦ GENERATE VISUALS
      </h3>
      <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 12, margin: '0 0 24px' }}>
        Generate cinematic images from your script concept
      </p>

      {/* ── FIX 4: Upload own scene ── */}
      <div
        style={{ border: '2px dashed rgba(201,168,76,0.4)', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16, cursor: 'pointer' }}
        onClick={() => document.getElementById('scene-upload')?.click()}
      >
        <input
          id="scene-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleUploadScene}
        />
        {uploadedScene ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={uploadedScene} alt="Uploaded scene" style={{ maxHeight: 120, borderRadius: 8, marginBottom: 8 }} />
            <p style={{ color: GOLD, fontSize: '0.85rem', margin: 0 }}>✓ Your image uploaded — click to change</p>
          </div>
        ) : (
          <div>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>📁 Upload your own scene or avatar photo</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', margin: '4px 0 0' }}>JPG, PNG, WebP · Max 10MB</p>
          </div>
        )}
      </div>

      {/* Style selector */}
      <p style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 10, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Visual Style
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {STYLES.map(s => (
          <button key={s.id} onClick={() => setStyle(s.id)} style={{
            padding: '7px 14px',
            borderRadius: 20,
            border: `1px solid ${style === s.id ? GOLD : 'rgba(255,255,255,0.12)'}`,
            background: style === s.id ? 'rgba(201,168,76,0.14)' : 'rgba(255,255,255,0.04)',
            color: style === s.id ? GOLD : 'rgba(255,255,255,0.7)',
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: 'inherit',
            fontWeight: style === s.id ? 600 : 400,
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Aspect ratio */}
      <p style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 10, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Aspect Ratio
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {RATIOS.map(r => (
          <button key={r.id} onClick={() => setRatio(r.id)} style={{
            padding: '7px 18px',
            borderRadius: 10,
            border: `1px solid ${ratio === r.id ? GOLD : 'rgba(255,255,255,0.12)'}`,
            background: ratio === r.id ? 'rgba(201,168,76,0.14)' : 'rgba(255,255,255,0.04)',
            color: ratio === r.id ? GOLD : 'rgba(255,255,255,0.7)',
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: 'inherit',
            fontWeight: ratio === r.id ? 600 : 400,
          }}>
            {r.label}{' '}
            <span style={{ opacity: 0.55, fontSize: 11 }}>{r.desc}</span>
          </button>
        ))}
      </div>

      {/* Quality toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          Quality
        </p>
        <button onClick={() => setQuality(q => q === 'pro' ? 'draft' : 'pro')} style={{
          padding: '6px 16px',
          borderRadius: 20,
          border: `1px solid ${quality === 'pro' ? GOLD : 'rgba(255,255,255,0.12)'}`,
          background: quality === 'pro' ? 'rgba(201,168,76,0.14)' : 'rgba(255,255,255,0.04)',
          color: quality === 'pro' ? GOLD : 'rgba(255,255,255,0.7)',
          cursor: 'pointer',
          fontSize: 13,
          fontFamily: 'inherit',
          fontWeight: 600,
        }}>
          {quality === 'pro' ? '⭐ Flux Pro (20s)' : '⚡ Fast Draft (3s)'}
        </button>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
          {quality === 'pro' ? '6 credits · Best quality' : '3 credits · Fast draft'}
        </span>
      </div>

      {/* ── FIX 5: Editable scene prompt ── */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowPrompt(p => !p)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
        >
          {showPrompt ? '▲ Hide prompt' : '▼ Edit scene prompt'}
          {imagePrompt ? ' (customised)' : ''}
        </button>
        {showPrompt && (
          <div style={{ marginTop: 10 }}>
            <textarea
              value={imagePrompt}
              onChange={e => setImagePrompt(e.target.value)}
              placeholder="Describe the scene — or generate first to auto-fill from Claude..."
              style={{
                width: '100%',
                minHeight: 120,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(201,168,76,0.3)',
                borderRadius: 10,
                color: 'rgba(255,255,255,0.9)',
                padding: 12,
                fontSize: '0.85rem',
                lineHeight: 1.6,
                resize: 'vertical',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: 6 }}>
              Edit this prompt to customise your scene before generating
            </p>
            {imagePrompt && (
              <button
                onClick={() => setImagePrompt('')}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginTop: 2 }}
              >
                ↺ Reset to auto-generate from Claude
              </button>
            )}
          </div>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="gold-btn"
        style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', borderRadius: 9999, border: 'none', opacity: isGenerating ? 0.7 : 1, cursor: isGenerating ? 'wait' : 'pointer' }}
      >
        {isGenerating ? '✨ Generating scene images…' : '✨ Generate Scene Images →'}
      </button>

      {/* Loading state */}
      {isGenerating && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '0 0 12px' }}>
            {imagePrompt ? 'Generating with your prompt…' : 'Claude is crafting your visual direction…'}
          </p>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: GOLD,
                animation: `dotPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Image grid */}
      {images.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 12, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Select your favourite — it will be used for video generation
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {images.map((url, i) => (
              <div key={i} onClick={() => handleSelectImage(i, url)} style={{
                position: 'relative',
                borderRadius: 12,
                overflow: 'hidden',
                border: `2px solid ${selectedIndex === i ? GOLD : 'transparent'}`,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                boxShadow: selectedIndex === i ? `0 0 20px rgba(201,168,76,0.25)` : 'none',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Generated ${i + 1}`} style={{ width: '100%', display: 'block' }} />
                {selectedIndex === i && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    background: GOLD, borderRadius: '50%',
                    width: 24, height: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#1a0a2e', fontWeight: 900, fontSize: 12,
                  }}>✓</div>
                )}
              </div>
            ))}
          </div>

          {selectedIndex !== null && (
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <a
                href={images[selectedIndex]}
                download={`omnyra-image-${selectedIndex + 1}.jpg`}
                target="_blank"
                rel="noreferrer"
                className="gold-btn"
                style={{ flex: 1, textAlign: 'center', padding: '12px', display: 'block', fontSize: 14, fontWeight: 700, borderRadius: 10, textDecoration: 'none' }}
              >
                Download ↓
              </a>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10, color: isGenerating ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.75)',
                  cursor: isGenerating ? 'wait' : 'pointer', padding: '12px', fontSize: 14, fontFamily: 'inherit',
                }}
              >
                {isGenerating ? 'Regenerating…' : 'Regenerate ↺'}
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes dotPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
