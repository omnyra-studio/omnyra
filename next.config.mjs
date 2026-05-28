/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.fal.ai' },
      { protocol: 'https', hostname: '**.fal.run' },
      { protocol: 'https', hostname: 'fal.media' },
      { protocol: 'https', hostname: '**.heygen.com' },
      { protocol: 'https', hostname: '**.klingai.com' },
      { protocol: 'https', hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
      { protocol: 'https', hostname: '**.elevenlabs.io' }
    ]
  },
  serverExternalPackages: ['fluent-ffmpeg', '@ffmpeg-installer/ffmpeg'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb'
    }
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
