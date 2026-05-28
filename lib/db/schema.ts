/**
 * DB Schema Contract — single source of truth for all table and column names.
 *
 * Rules:
 *   1. NEVER use raw string column names in query files.
 *   2. All column references MUST come from this file.
 *   3. When a column is renamed in the DB, update ONLY this file.
 *
 * Usage:
 *   import { SCHEMA } from "@/lib/db/schema";
 *   db.from(SCHEMA.renders.table).eq(SCHEMA.renders.columns.userId, id)
 *   // or use the typed query builder: import { renders } from "@/lib/db/query"
 */

export const SCHEMA = {
  renders: {
    table: "renders",
    columns: {
      id:              "id",
      userId:          "user_id",        // ← confirmed: renders_ensure_user_id.sql
      status:          "status",
      script:          "script",
      audioUrl:        "audio_url",
      videoUrl:        "video_url",
      directorSettings:"director_settings",
      template:        "template",
      brief:           "brief",
      scenes:          "scenes",
      voiceId:         "voice_id",
      creditsUsed:     "credits_used",
      errorMessage:    "error_message",
      sceneUrls:       "scene_urls",
      approvedAt:      "approved_at",
      completedAt:     "completed_at",
      updatedAt:       "updated_at",
      createdAt:       "created_at",
    },
  },

  profiles: {
    table: "profiles",
    columns: {
      id:                   "id",
      plan:                 "plan",
      stripeCustomerId:     "stripe_customer_id",
      stripeSubscriptionId: "stripe_subscription_id",
      createdAt:            "created_at",
    },
  },

  credits: {
    table: "credits",
    columns: {
      id:        "id",
      userId:    "user_id",
      balance:   "balance",
      plan:      "plan",
      updatedAt: "updated_at",
    },
  },

  renderEvents: {
    table: "render_events",
    columns: {
      id:         "id",
      renderId:   "render_id",
      eventType:  "event_type",
      payload:    "payload",
      createdAt:  "created_at",
    },
  },

  usageLogs: {
    table: "usage_logs",
    columns: {
      id:               "id",
      userId:           "user_id",
      actionType:       "action_type",
      estimatedCostUsd: "estimated_cost_usd",
      createdAt:        "created_at",
    },
  },

  brandProfiles: {
    table: "brand_profiles",
    columns: {
      id:               "id",
      userId:           "user_id",
      brandName:        "brand_name",
      tagline:          "tagline",
      niche:            "niche",
      targetAudience:   "target_audience",
      toneOfVoice:      "tone_of_voice",
      colors:           "colors",
      contentStyleNotes:"content_style_notes",
      createdAt:        "created_at",
      updatedAt:        "updated_at",
    },
  },
} as const;

export type TableName   = keyof typeof SCHEMA;
export type RenderCol   = keyof typeof SCHEMA.renders.columns;
export type ProfileCol  = keyof typeof SCHEMA.profiles.columns;
export type CreditsCol  = keyof typeof SCHEMA.credits.columns;
