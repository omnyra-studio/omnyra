import { supabase } from './supabase'

export async function getBrandProfile() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const res = await fetch('/api/brand', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return (data?.brand_name || data?.niche || data?.tone_of_voice) ? data : null
}

export async function saveBrandProfile(profile) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const res = await fetch('/api/brand', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(profile),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Save failed')
  }
  return res.json()
}

export function buildBrandContext(profile) {
  if (!profile) return ""
  const parts = []
  if (profile.brand_name)          parts.push(`Brand Name: ${profile.brand_name}`)
  if (profile.tagline)             parts.push(`Tagline: ${profile.tagline}`)
  if (profile.niche)               parts.push(`Niche / Industry: ${profile.niche}`)
  if (profile.target_audience)     parts.push(`Target Audience: ${profile.target_audience}`)
  if (profile.tone_of_voice)       parts.push(`Tone of Voice: ${profile.tone_of_voice}`)
  if (profile.colors?.length)      parts.push(`Brand Colors: ${profile.colors.join(', ')}`)
  if (profile.content_style_notes) parts.push(`Content Style Notes: ${profile.content_style_notes}`)
  if (!parts.length) return ""
  return `\n\nBRAND IDENTITY (always align ALL content — scripts, captions, hashtags, CTAs — to this brand):\n${parts.join('\n')}`
}

// Mirror of lib/brand.ts exports — keeps webpack happy when .js shadows .ts
export function getBrandSystemPrompt(brand) {
  if (!brand) return ""
  const parts = []
  if (brand.brand_name)           parts.push(`Workspace/Brand: ${brand.brand_name}`)
  if (brand.tone_of_voice)        parts.push(`Tone of Voice: ${brand.tone_of_voice}`)
  if (Array.isArray(brand.colors) && brand.colors.length)
                                  parts.push(`Brand Colors: ${brand.colors.filter(Boolean).join(', ')}`)
  if (Array.isArray(brand.products) && brand.products.length)
                                  parts.push(`Products/Services: ${brand.products.map(p => `${p.name}: ${p.description}`).join('; ')}`)
  if (Array.isArray(brand.tone_tags) && brand.tone_tags.length)
                                  parts.push(`Brand Voice Tags: ${brand.tone_tags.join(', ')}`)
  if (brand.style_preset)         parts.push(`Visual Style Preset: ${brand.style_preset}`)
  if (brand.target_audience)      parts.push(`Target Audience: ${brand.target_audience}`)
  if (brand.niche)                parts.push(`Industry/Niche: ${brand.niche}`)
  if (brand.content_style_notes)  parts.push(`Content Style Notes: ${brand.content_style_notes}`)
  if (!parts.length) return ""
  return ['\n\n— BRAND IDENTITY (align ALL content to this brand) —', ...parts, '— END BRAND IDENTITY —'].join('\n')
}

export async function upsertBrandProfile(userId, data) {
  // Client-side: delegate to save API route (server-side lib/brand.ts uses admin client directly)
  const res = await fetch('/api/brand/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, user_id: userId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to save brand profile')
  }
  return res.json()
}
