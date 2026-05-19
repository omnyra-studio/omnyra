import { supabaseAdmin } from '../../../../lib/supabase-admin'
import {
  publishTikTok,
  publishInstagram,
  publishYouTube,
  publishTwitter,
} from '../../../../lib/social-publish'

const PUBLISHERS = { tiktok: publishTikTok, instagram: publishInstagram, youtube: publishYouTube, twitter: publishTwitter }

async function publishPost(post) {
  const results = {}

  for (const platform of post.platforms) {
    const { data: conn } = await supabaseAdmin
      .from('social_connections')
      .select('access_token, platform_user_id')
      .eq('user_id', post.user_id)
      .eq('platform', platform)
      .single()

    if (!conn) {
      results[platform] = { error: 'Not connected' }
      continue
    }

    try {
      const fn = PUBLISHERS[platform]
      if (!fn) throw new Error('Unsupported platform')
      const result = await fn({
        token: conn.access_token,
        platformUserId: conn.platform_user_id,
        post,
      })
      results[platform] = result
    } catch (e) {
      results[platform] = { error: e.message }
    }
  }

  const hasError = Object.values(results).some(r => r.error)
  const allFailed = Object.values(results).every(r => r.error)

  await supabaseAdmin
    .from('scheduled_posts')
    .update({
      status: allFailed ? 'failed' : 'published',
      platform_post_ids: results,
      error_message: allFailed ? JSON.stringify(results) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', post.id)
}

// Vercel Cron — runs every 5 minutes
export async function GET(request) {
  // Verify cron request
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: duePosts } = await supabaseAdmin
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .limit(20)

  if (!duePosts?.length) return Response.json({ processed: 0 })

  // Mark all as 'publishing' to prevent double-runs
  await supabaseAdmin
    .from('scheduled_posts')
    .update({ status: 'publishing' })
    .in('id', duePosts.map(p => p.id))

  await Promise.allSettled(duePosts.map(publishPost))

  return Response.json({ processed: duePosts.length })
}

// POST for immediate publish (triggered by posts route)
export async function POST(request) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { post_id } = await request.json()
  const { data: post } = await supabaseAdmin
    .from('scheduled_posts')
    .select('*')
    .eq('id', post_id)
    .eq('status', 'publishing')
    .single()

  if (!post) return Response.json({ error: 'Post not found or already processed' }, { status: 404 })

  await publishPost(post)
  return Response.json({ success: true })
}
