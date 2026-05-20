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
