<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into Omnyra AI, a Next.js 16 App Router application. The project already had `PHProvider`, `PostHogPageView`, and `posthog-node` in place with several events instrumented. This session extended the integration with 5 new events across the creation pipeline and revenue funnel, added the reverse proxy to route PostHog traffic through `/ingest`, and built a fresh analytics dashboard.

## Changes made

### Modified files

| File | Change |
|------|--------|
| `next.config.mjs` | Added PostHog reverse proxy rewrites (`/ingest/static/*`, `/ingest/array/*`, `/ingest/*`) and `skipTrailingSlashRedirect: true` |
| `app/api/generate-script/route.ts` | Added `script_generated` server-side capture via `posthog-node` |
| `app/api/generate-shot-plan/route.ts` | Added `shot_plan_generated` server-side capture via `posthog-node` |
| `app/api/stripe/create-checkout/route.js` | Added `checkout_initiated` server-side capture via `posthog-node` |
| `app/dashboard/page.jsx` | Added `video_downloaded` client-side capture via `usePostHog` on download click |
| `app/welcome/page.jsx` | Added `promo_code_redeemed` client-side capture via `usePostHog` on successful promo apply |

### Environment variables updated (`.env.local`)
- `NEXT_PUBLIC_POSTHOG_KEY` — set to project token
- `NEXT_PUBLIC_POSTHOG_HOST` — set to `https://us.i.posthog.com`

## Events instrumented (this session)

| Event | Description | File |
|-------|-------------|------|
| `script_generated` | AI script generated from a selected hook (server-side) | `app/api/generate-script/route.ts` |
| `shot_plan_generated` | Director shot plan created from approved script (server-side) | `app/api/generate-shot-plan/route.ts` |
| `checkout_initiated` | Stripe checkout session created — revenue funnel entry (server-side) | `app/api/stripe/create-checkout/route.js` |
| `video_downloaded` | User downloads a completed video render (client-side) | `app/dashboard/page.jsx` |
| `promo_code_redeemed` | User successfully redeems a promo/beta code during onboarding (client-side) | `app/welcome/page.jsx` |

## Previously instrumented events (carried over)

| Event | File |
|-------|------|
| `user_signed_up` | `app/signup/page.js` + `app/api/auth/signup/route.js` |
| `user_signed_in` | `app/signin/page.js` |
| `onboarding_completed` | `app/welcome/page.jsx` |
| `template_selected` | `app/dashboard/page.jsx` |
| `upgrade_cta_clicked` | `app/dashboard/credits/page.js` |
| `upgrade_clicked` | `components/GlobalNav.jsx` |
| `brief_generated` | `app/api/generate-brief/route.ts` |
| `video_generation_started` | `app/api/video/generate/route.js` |

## Next steps

We've built a dashboard and 5 insights to monitor user behavior based on the events instrumented:

- [Analytics basics dashboard](/dashboard/1626025)
- [Content Creation Funnel](/insights/WTk9F9J4) — 5-step funnel: signup → onboarding → brief → script → video
- [New Signups Over Time](/insights/tndgWliR) — daily unique signups
- [Content Activity (Briefs, Scripts, Videos)](/insights/Zr89KGMa) — daily creation volume across all 3 generation types
- [Upgrade Intent](/insights/g6Dtf7XH) — daily upgrade CTA clicks (nav + credits page)
- [Checkout Initiated](/insights/jqbdYD2z) — daily Stripe checkout sessions started

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
