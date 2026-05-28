/**
 * Social post publishing service.
 * Pure function — no HTTP context, no Next.js types, no cookies.
 * Accepts a fully-loaded post row and publishes to all requested platforms.
 *
 * Consumed by:
 *   /api/social/cron  — scheduled and batch publishing
 *   /api/social/posts — immediate publishing on creation
 */

import { createClient } from '@supabase/supabase-js';
import {
  publishTikTok,
  publishInstagram,
  publishYouTube,
  publishTwitter,
} from '../social-publish';
import { emitAndForget } from '../events/emitter';

const PUBLISHERS = {
  tiktok:    publishTikTok,
  instagram: publishInstagram,
  youtube:   publishYouTube,
  twitter:   publishTwitter,
};

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Publish a scheduled_posts row to all of its platforms.
 * Updates the row status to 'published' or 'failed' on completion.
 *
 * @param {object} post - Full scheduled_posts row from DB
 */
export async function publishPost(post) {
  const db = getDb();
  const results = {};

  for (const platform of post.platforms) {
    const { data: conn } = await db
      .from('social_connections')
      .select('access_token, platform_user_id')
      .eq('user_id', post.user_id)
      .eq('platform', platform)
      .single();

    if (!conn) {
      results[platform] = { error: 'Not connected' };
      continue;
    }

    try {
      const fn = PUBLISHERS[platform];
      if (!fn) throw new Error(`Unsupported platform: ${platform}`);
      results[platform] = await fn({
        token:          conn.access_token,
        platformUserId: conn.platform_user_id,
        post,
      });
    } catch (e) {
      results[platform] = { error: e.message };
    }
  }

  const allFailed = Object.values(results).every(r => r.error);

  await db
    .from('scheduled_posts')
    .update({
      status:            allFailed ? 'failed' : 'published',
      platform_post_ids: results,
      error_message:     allFailed ? JSON.stringify(results) : null,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', post.id);

  emitAndForget(
    allFailed
      ? { type: 'PUBLISH_FAILED',    correlationId: post.id, payload: { postId: post.id, error: JSON.stringify(results) } }
      : { type: 'PUBLISH_COMPLETED', correlationId: post.id, payload: { postId: post.id, platforms: post.platforms, results } },
  );
}
