// Platform-specific publish implementations.
// Each function throws on failure; callers catch and record error_message.

export async function publishTikTok({ token, post }) {
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      post_info: {
        title: (post.caption || 'Omnyra AI Post').substring(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_stitch: false,
        disable_comment: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: post.media_url,
        video_cover_timestamp_ms: 0,
      },
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error?.code !== 'ok') {
    throw new Error(data.error?.message || `TikTok error ${res.status}`)
  }
  return { publishId: data.data?.publish_id }
}

export async function publishInstagram({ token, platformUserId, post }) {
  const isVideo = post.media_type === 'video'
  const params = new URLSearchParams({
    caption: post.caption || '',
    access_token: token,
  })
  if (isVideo) {
    params.set('media_type', 'REELS')
    params.set('video_url', post.media_url)
    params.set('share_to_feed', 'true')
  } else {
    params.set('image_url', post.media_url)
  }

  const initRes = await fetch(
    `https://graph.instagram.com/v21.0/${platformUserId}/media`,
    { method: 'POST', body: params }
  )
  const initData = await initRes.json()
  if (!initRes.ok || initData.error) {
    throw new Error(initData.error?.message || `Instagram container error ${initRes.status}`)
  }

  // For videos, poll until container is ready (up to 60 s)
  if (isVideo) {
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const statusRes = await fetch(
        `https://graph.instagram.com/v21.0/${initData.id}?fields=status_code&access_token=${token}`
      )
      const s = await statusRes.json()
      if (s.status_code === 'FINISHED') break
      if (s.status_code === 'ERROR') throw new Error('Instagram video processing failed')
    }
  }

  const pubRes = await fetch(
    `https://graph.instagram.com/v21.0/${platformUserId}/media_publish`,
    {
      method: 'POST',
      body: new URLSearchParams({ creation_id: initData.id, access_token: token }),
    }
  )
  const pubData = await pubRes.json()
  if (!pubRes.ok || pubData.error) {
    throw new Error(pubData.error?.message || `Instagram publish error ${pubRes.status}`)
  }
  return { mediaId: pubData.id }
}

export async function publishYouTube({ token, post }) {
  // YouTube requires multipart video upload — not feasible from a URL directly.
  // Return an actionable error so the caller can mark the post with guidance.
  throw new Error(
    'YouTube upload requires a direct file. Download your video from the media URL and upload via YouTube Studio, or use the YouTube Data API with a server-side download.'
  )
}

export async function publishTwitter({ token, post }) {
  let mediaId = null

  // Upload media if present (Twitter v2 async media upload)
  if (post.media_url) {
    try {
      const upRes = await fetch('https://upload.twitter.com/2/media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_category: post.media_type === 'video' ? 'TweetVideo' : 'TweetImage',
          url: post.media_url,
        }),
      })
      if (upRes.ok) {
        const md = await upRes.json()
        mediaId = md.media_id_string
      }
    } catch {}
  }

  const body = { text: (post.caption || '').substring(0, 280) }
  if (mediaId) body.media = { media_ids: [mediaId] }

  const tweetRes = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const tweetData = await tweetRes.json()
  if (!tweetRes.ok || tweetData.errors) {
    throw new Error(tweetData.errors?.[0]?.message || `Twitter error ${tweetRes.status}`)
  }
  return { tweetId: tweetData.data?.id }
}
