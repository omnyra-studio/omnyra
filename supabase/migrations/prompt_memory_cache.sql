-- Prompt memory cache: stores successful visual prompts keyed by shot type and
-- emotion. The scene planner queries this before asking the Director Core LLM,
-- preferring high-scoring cached prompts to reduce Anthropic API calls.
--
-- success_score: 0.0–1.0 representing output quality (currently written as 1.0
--   on any job that completes successfully; future: based on user feedback).
-- usage_count:   how many times this prompt has been reused from cache.

CREATE TABLE IF NOT EXISTS prompt_memory_cache (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shot_type     TEXT        NOT NULL,   -- wide | medium | closeup | action | cutaway
  emotion       TEXT        NOT NULL,   -- neutral | calm | intense | urgent | dramatic
  visual_prompt TEXT        NOT NULL,
  success_score NUMERIC     NOT NULL DEFAULT 1.0 CHECK (success_score >= 0 AND success_score <= 1),
  usage_count   INT         NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prompt_memory_cache_lookup_idx
  ON prompt_memory_cache (user_id, shot_type, emotion, success_score DESC);

ALTER TABLE prompt_memory_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_memory_cache_owner"
  ON prompt_memory_cache FOR ALL
  USING (auth.uid() = user_id);
