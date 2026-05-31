import { createHmac } from 'crypto'

// Kling requires a short-lived JWT signed with HMAC-SHA256 — never use a static key
function generateKlingJWT() {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now     = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({
    iss: process.env.KLING_ACCESS_KEY,
    exp: now + 1800,
    nbf: now - 5,
  })).toString('base64url')
  const sig = createHmac('sha256', process.env.KLING_SECRET_KEY ?? '')
    .update(`${header}.${payload}`)
    .digest('base64url')
  return `${header}.${payload}.${sig}`
}

// ─── Tier routing tables ────────────────────────────────────────────────────

export const VIDEO_PROVIDER = {
  free:    'pika',
  creator: 'pika',
  pro:     'kling',
  studio:  'kling',
}

export const IMG2VIDEO_PROVIDER = {
  free:    'pika',
  creator: 'pika',
  pro:     'runway',
  studio:  'kling',
}

// ─── Pika via Fal AI (synchronous) ──────────────────────────────────────────

export async function callPika({ prompt, imageUrl, duration = 5 }) {
  const res = await fetch('https://fal.run/fal-ai/pika/v2.2', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: '9:16',
      duration,
      ...(imageUrl && { image_url: imageUrl }),
    }),
  })
  if (!res.ok) throw new Error(`Fal/Pika ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const url  = data.video?.url ?? data.videos?.[0]?.url
  if (!url) throw new Error('Fal/Pika returned no video URL')
  return { url }
}

// ─── Kling ──────────────────────────────────────────────────────────────────

export async function callKling({ prompt, imageUrl, duration = 5, quality = 'std' }) {
  const endpoint = imageUrl
    ? 'https://api.klingai.com/v1/videos/image2video'
    : 'https://api.klingai.com/v1/videos/text2video'

  const body = imageUrl
    ? { model_name: 'kling-v1', image_url: imageUrl, prompt, duration, mode: quality }
    : { model_name: 'kling-v1', prompt, duration, mode: quality, aspect_ratio: '9:16' }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${generateKlingJWT()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Kling ${res.status}: ${await res.text()}`)
  return await res.json()
}

export async function pollKling(taskId, type = 'text2video') {
  const res = await fetch(
    `https://api.klingai.com/v1/videos/${type}/${taskId}`,
    { headers: { 'Authorization': `Bearer ${generateKlingJWT()}` } }
  )
  if (!res.ok) throw new Error(`Kling poll ${res.status}`)
  return await res.json()
}

// ─── Runway ─────────────────────────────────────────────────────────────────

export async function callRunwayText({ prompt, duration = 8 }) {
  const res = await fetch('https://api.runwayml.com/v1/text_to_video', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      model: 'gen3a_turbo',
      promptText: prompt,
      duration,
      ratio: '768:1280',
      watermark: false,
    }),
  })
  if (!res.ok) throw new Error(`Runway text2video ${res.status}: ${await res.text()}`)
  return await res.json()
}

export async function callRunway({ imageUrl, prompt, duration = 5 }) {
  const res = await fetch('https://api.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      model: 'gen3a_turbo',
      promptImage: imageUrl,
      promptText: prompt,
      duration,
      ratio: '768:1280',
    }),
  })
  if (!res.ok) throw new Error(`Runway ${res.status}: ${await res.text()}`)
  return await res.json()
}

export async function pollRunway(taskId) {
  const res = await fetch(`https://api.runwayml.com/v1/tasks/${taskId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
      'X-Runway-Version': '2024-11-06',
    },
  })
  if (!res.ok) throw new Error(`Runway poll ${res.status}`)
  return await res.json()
}

// ─── D-ID ───────────────────────────────────────────────────────────────────

export async function callDID({ imageUrl, scriptText, audioUrl, voiceId }) {
  const script = audioUrl
    ? { type: 'audio', audio_url: audioUrl }
    : {
        type: 'text',
        input: scriptText,
        provider: {
          type: 'elevenlabs',
          voice_id: voiceId ?? 'JBFqnCBsd6RMkjVDRZzb',
          model_id: 'eleven_turbo_v2',
        },
      }

  const res = await fetch('https://api.d-id.com/talks', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${process.env.DID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_url: imageUrl,
      script,
      config: { fluent: true, pad_audio: 0.0, stitch: true },
    }),
  })
  if (!res.ok) throw new Error(`D-ID ${res.status}: ${await res.text()}`)
  return await res.json()
}

export async function pollDID(talkId) {
  const res = await fetch(`https://api.d-id.com/talks/${talkId}`, {
    headers: { 'Authorization': `Basic ${process.env.DID_API_KEY}` },
  })
  if (!res.ok) throw new Error(`D-ID poll ${res.status}`)
  return await res.json()
}

// ─── Sync Labs (lip-sync) ────────────────────────────────────────────────────

export async function callSyncLabs({ videoUrl, audioUrl }) {
  const res = await fetch('https://api.synclabs.so/video', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.SYNCLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ videoUrl, audioUrl, synergize: true, maxCredits: 120, webhookUrl: null }),
  })
  if (!res.ok) throw new Error(`SyncLabs ${res.status}: ${await res.text()}`)
  return await res.json()
}

export async function pollSyncLabs(jobId) {
  const res = await fetch(`https://api.synclabs.so/video/${jobId}`, {
    headers: { 'x-api-key': process.env.SYNCLABS_API_KEY },
  })
  if (!res.ok) throw new Error(`SyncLabs poll ${res.status}`)
  return await res.json()
}

