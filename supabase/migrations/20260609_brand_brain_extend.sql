-- Extend brand_brain with richer identity fields for Flux prompt injection,
-- hook templates, visual exclusions, and performance memory.

ALTER TABLE brand_brain
  ADD COLUMN IF NOT EXISTS tagline              TEXT,
  ADD COLUMN IF NOT EXISTS preferred_hooks      TEXT[],
  ADD COLUMN IF NOT EXISTS negative_style_terms TEXT[],
  ADD COLUMN IF NOT EXISTS performance_summary  TEXT;
