import { createClient } from '@supabase/supabase-js';
import { publishPost } from '../../../../lib/social/post-publisher';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();

  const { data: duePosts } = await db
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .limit(20);

  if (!duePosts?.length) return Response.json({ processed: 0 });

  await db
    .from('scheduled_posts')
    .update({ status: 'publishing' })
    .in('id', duePosts.map(p => p.id));

  await Promise.allSettled(duePosts.map(publishPost));

  return Response.json({ processed: duePosts.length });
}

export async function POST(request) {
  const secret = request.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { post_id } = await request.json();
  const db = getDb();

  const { data: post } = await db
    .from('scheduled_posts')
    .select('*')
    .eq('id', post_id)
    .eq('status', 'publishing')
    .single();

  if (!post) return Response.json({ error: 'Post not found or already processed' }, { status: 404 });

  await publishPost(post);
  return Response.json({ success: true });
}
