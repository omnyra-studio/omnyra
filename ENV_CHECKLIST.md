# Omnyra Environment Variables — Security Checklist

> **CRITICAL — SUPABASE KEYS**
>
> `NEXT_PUBLIC_SUPABASE_ANON_KEY` must contain the **anon** key only.
> Never the `service_role` key.
>
> If the project was ever deployed with the service_role key in
> `NEXT_PUBLIC_SUPABASE_ANON_KEY`, treat the service_role key as
> **compromised** and rotate it in the Supabase dashboard
> (Settings → API → Reveal → Reset service_role key) before redeploy.

---

## Supabase

| Variable                          | Scope    | Notes                                                                  |
|-----------------------------------|----------|------------------------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`        | Browser  | ⚠️ EXPOSED TO BROWSER — NEVER PUT SECRETS HERE                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Browser  | ⚠️ EXPOSED TO BROWSER — NEVER PUT SECRETS HERE — anon key ONLY          |
| `SUPABASE_SERVICE_ROLE_KEY`       | Server   | NEVER prefix with `NEXT_PUBLIC_`. Bypasses RLS. Server-only.            |

## AI providers

| Variable               | Scope    | Notes                                                |
|------------------------|----------|------------------------------------------------------|
| `ANTHROPIC_API_KEY`    | Server   | Claude API. Server-only.                             |
| `ELEVENLABS_API_KEY`   | Server   | Voice generation. Server-only.                       |
| `FALAI_API_KEY`        | Server   | Fal image generation. Server-only.                   |
| `FAL_API_KEY`          | Server   | Alt Fal credential. Server-only.                     |
| `FLUX_API_KEY`         | Server   | Flux image generation. Server-only.                  |
| `GETIMG_API_KEY`       | Server   | GetImg fallback. Server-only.                        |
| `KLING_ACCESS_KEY`     | Server   | Kling motion. Server-only.                           |
| `KLING_SECRET_KEY`     | Server   | Kling secret half. Server-only.                      |
| `RUNWAY_API_KEY`       | Server   | Runway motion. Server-only.                          |
| `PIKA_API_KEY`         | Server   | Pika motion. Server-only.                            |
| `DID_API_KEY`          | Server   | D-ID presenter. Server-only.                         |
| `HEYGEN_API_KEY`       | Server   | HeyGen presenter. Server-only.                       |
| `SYNCLABS_API_KEY`     | Server   | Lip-sync. Server-only.                               |
| `SYNCSO_API_KEY`       | Server   | Sync.so lip-sync. Server-only.                       |

## Stripe

| Variable                              | Scope    | Notes                                          |
|---------------------------------------|----------|------------------------------------------------|
| `STRIPE_SECRET_KEY`                   | Server   | Server-only. Never browser.                    |
| `STRIPE_WEBHOOK_SECRET`               | Server   | Server-only.                                   |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`  | Browser  | ⚠️ EXPOSED TO BROWSER — NEVER PUT SECRETS HERE  |

## App

| Variable             | Scope    | Notes                                          |
|----------------------|----------|------------------------------------------------|
| `NEXT_PUBLIC_APP_URL`| Browser  | ⚠️ EXPOSED TO BROWSER — NEVER PUT SECRETS HERE  |

---

## Rotation runbook

If a `service_role` key is suspected of having leaked:

1. Supabase Dashboard → Settings → API → **Reset service_role key**.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Production, Preview, Development).
3. Confirm `NEXT_PUBLIC_SUPABASE_ANON_KEY` holds the **anon** value, not service_role.
4. Redeploy. Old token versions invalidate immediately.

## Code-level guarantees

- `lib/supabase/admin.ts` throws if imported in the browser.
- `lib/supabase/client.ts` and `lib/supabase/server.ts` only use the anon key.
- `middleware.ts` uses the anon key — never service_role.

## Verification

Run before each deploy:

```bash
# Confirm no NEXT_PUBLIC_*_SERVICE_ROLE leaks
grep -RE "NEXT_PUBLIC_.*SERVICE" .env* 2>/dev/null && echo "BLOCKED" || echo "clean"

# Confirm admin client isn't imported from a "use client" file
grep -rE "from ['\"].*lib/supabase/admin['\"]" app components lib \
  | xargs -I {} grep -l "use client" {} 2>/dev/null \
  && echo "BLOCKED" || echo "clean"
```
