import posthog from "posthog-js"

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",
  defaults: "2026-01-30",
  capture_pageview: false,
  capture_pageleave: true,
  capture_exceptions: true,
  session_recording: {
    maskAllInputs: true,
    maskInputOptions: {
      password: true,
      email: true,
    },
  },
  debug: process.env.NODE_ENV === "development",
})

// IMPORTANT: Never combine this with other client-side PostHog initialization
// approaches. instrumentation-client.ts is the correct solution for Next.js 15.3+.
