import { supabaseAdmin } from '../../../../../lib/supabase-admin'
import { cookies } from 'next/headers'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const OAUTH_CONFIGS = {
  tiktok: {
    authUrl: 'https://www.tiktok.com/v2/auth/authorize',
    params: (redirect) => ({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      scope: 'video.upload,video.publish,user.info.basic',
      redirect_uri: redirect,
      response_type: 'code',
    }),
  },
  instagram: {
    authUrl: 'https://api.instagram.com/oauth/authorize',
    params: (redirect) => ({
      client_id: process.env.INSTAGRAM_APP_ID,
      redirect_uri: redirect,
      scope: 'instagram_basic,instagram_content_publish',
      response_type: 'code',
    }),
  },
  youtube: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    params: (redirect) => ({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirect,
      scope: 'https://www.googleapis.com/auth/youtube.upload',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
    }),
  },
  twitter: {
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    params: (redirect, extra) => ({
      client_id: process.env.TWITTER_CLIENT_ID,
      redirect_uri: redirect,
      scope: 'tweet.write users.read media.write offline.access',
      response_type: 'code',
      code_challenge: extra.challenge,
      code_challenge_method: 'S256',
    }),
  },
}

export async function GET(request, context) {
  const { platform } = await context.params

  // Validate user via token query param
  const token = new URL(request.url).searchParams.get('token')
  if (!token) return new Response('Missing token', { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return new Response('Unauthorized', { status: 401 })

  const config = OAUTH_CONFIGS[platform]
  if (!config) return new Response('Unknown platform', { status: 400 })

  const redirectUri = `${APP_URL}/api/social/callback/${platform}`
  const state = crypto.randomUUID()

  // For Twitter PKCE: generate verifier + challenge
  let codeVerifier = null
  let challenge = null
  if (platform === 'twitter') {
    codeVerifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('')
    const enc = new TextEncoder()
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(codeVerifier))
    challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  }

  // Store state + userId in cookie (10 min TTL, follows through OAuth redirect)
  const cookieStore = await cookies()
  cookieStore.set('omnyra_oauth', JSON.stringify({ state, userId: user.id, platform, codeVerifier }), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const params = config.params(redirectUri, { challenge })
  const url = new URL(config.authUrl)
  Object.entries({ ...params, state }).forEach(([k, v]) => v && url.searchParams.set(k, v))

  return Response.redirect(url.toString())
}
