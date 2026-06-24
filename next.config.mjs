/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.fal.ai' },
      { protocol: 'https', hostname: '**.fal.run' },
      { protocol: 'https', hostname: 'fal.media' },
      { protocol: 'https', hostname: '**.klingai.com' },
      { protocol: 'https', hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
      { protocol: 'https', hostname: '**.elevenlabs.io' },
      { protocol: 'https', hostname: 'randomuser.me' }
    ]
  },
  serverExternalPackages: ['fluent-ffmpeg', 'ffmpeg-static', '@ffmpeg-installer/ffmpeg'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb'
    },
  },

  // Explicitly include ffmpeg-static binary so Vercel's output-file tracer doesn't drop it.
  // Without this the tracer misses the binary (it can't detect it statically) → ENOENT at runtime.
  outputFileTracingIncludes: {
    '/api/generate-cinematic-sequence': ['./node_modules/ffmpeg-static/**'],
    '/api/avatar-worker':               ['./node_modules/ffmpeg-static/**'],
    '/api/merge-video-audio':           ['./node_modules/ffmpeg-static/**'],
    '/api/compose-video':               ['./node_modules/ffmpeg-static/**'],
  },

  // ── Security headers ────────────────────────────────────────────────────────
  // Applied to every response. HSTS is set at the Vercel/CDN layer.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent Omnyra pages being embedded in foreign iframes (clickjacking)
          { key: 'X-Frame-Options',        value: 'DENY' },
          // Stop browsers from MIME-sniffing responses
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Don't leak the full URL to third-party requests
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          // Restrict feature access — camera/mic/geo not needed by the app
          { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // Legacy XSS filter (defence-in-depth for older browsers)
          { key: 'X-XSS-Protection',       value: '1; mode=block' },
          // Prevent DNS prefetch leaking visited URLs
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ];
  },

  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/array/:path*',  destination: 'https://us-assets.i.posthog.com/array/:path*' },
      { source: '/ingest/:path*',        destination: 'https://us.i.posthog.com/:path*' },
    ]
  },
  skipTrailingSlashRedirect: true,
}

export default nextConfig
