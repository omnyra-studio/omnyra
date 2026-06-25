# Omnyra AI

Next.js 16 AI video creation studio — cinematic sequence generation, avatar video, ElevenLabs voiceover, Supabase auth & billing.

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Set these in Vercel → Project → Settings → Environment Variables (or `.env.local` for local dev).

### Required — App & Auth

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key (scene compiler, brief generation) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |

### Required — Video Generation

| Variable | Description |
|---|---|
| `RUNWAYML_API_SECRET` | RunwayML API secret — **primary video provider**. If absent, generation fails fast unless `VIDEO_PROVIDER_FALLBACK=true` is also set. |
| `FAL_KEY` | Fal.ai API key (image generation via Flux) |

### Video Provider Routing

| Variable | Values | Description |
|---|---|---|
| `VIDEO_PROVIDER_FALLBACK` | `true` / unset | When `true`, permits falling back to Kling if `RUNWAYML_API_SECRET` is absent. When unset (default), missing Runway secret causes immediate failure — no silent Kling fallback. |

**Provider selection logic** (`lib/services/model-router.ts`):
1. If `RUNWAYML_API_SECRET` is set → RunwayML gen4_turbo for all scenes (primary)
2. If `RUNWAYML_API_SECRET` is absent + `VIDEO_PROVIDER_FALLBACK=true` → Kling Pro fallback
3. If `RUNWAYML_API_SECRET` is absent + no fallback flag → request fails immediately with a clear error

### Optional — Additional Providers & Features

| Variable | Description |
|---|---|
| `KLING_ACCESS_KEY` | Kling AI access key (fallback video provider) |
| `KLING_SECRET_KEY` | Kling AI secret key |
| `ELEVENLABS_API_KEY` | ElevenLabs voiceover generation |
| `RESEND_API_KEY` | Resend email (transactional + automation) |
| `APIFY_TOKEN` | Apify scrapers for trend signals |
| `CRON_SECRET` | Shared secret for Vercel Cron job auth |
| `POSTHOG_API_KEY` | PostHog analytics |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog client-side key |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host URL |

### Optional — Infrastructure

| Variable | Description |
|---|---|
| `REDIS_URL` | Redis connection string (BullMQ job queues for scene rendering) |
| `ADMIN_SECRET` | Internal admin API authentication header value |
