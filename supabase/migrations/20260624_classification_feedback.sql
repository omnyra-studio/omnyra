-- V4 Classification Feedback — self-learning niche router
-- Stores every classification event and user corrections.
-- The learning engine reads this table daily to adjust category weights.

CREATE TABLE IF NOT EXISTS classification_feedback (
  id                       BIGSERIAL PRIMARY KEY,
  input_text               TEXT        NOT NULL,
  predicted_category       TEXT        NOT NULL,
  confidence               FLOAT       NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  path                     TEXT        NOT NULL, -- 'rule-guard' | 'semantic' | 'llm' | 'llm-fallback' | 'keyword'
  user_id                  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  was_correct              BOOLEAN,              -- NULL = unresolved, TRUE/FALSE after user correction
  user_corrected_category  TEXT,                 -- populated when was_correct = FALSE
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for per-category accuracy queries (30-day rolling window)
CREATE INDEX IF NOT EXISTS idx_cf_category_time
  ON classification_feedback (predicted_category, created_at);

-- Index for correction lookups
CREATE INDEX IF NOT EXISTS idx_cf_input_category
  ON classification_feedback (predicted_category, was_correct)
  WHERE was_correct IS NULL;

-- RLS: service_role can insert/update; no user-level reads
ALTER TABLE classification_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON classification_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Category accuracy view — used by getCategoryAccuracy()
CREATE OR REPLACE VIEW category_accuracy AS
SELECT
  predicted_category                                AS category,
  COUNT(*)                                          AS total,
  COUNT(*) FILTER (WHERE was_correct = TRUE)        AS correct,
  ROUND(
    COUNT(*) FILTER (WHERE was_correct = TRUE)::NUMERIC
    / NULLIF(COUNT(*) FILTER (WHERE was_correct IS NOT NULL), 0),
    4
  )                                                 AS accuracy,
  COUNT(*) FILTER (WHERE was_correct = FALSE)       AS corrections,
  MAX(created_at)                                   AS last_seen
FROM classification_feedback
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY predicted_category
ORDER BY total DESC;

-- Misclassification clusters view — reveals confused category pairs
CREATE OR REPLACE VIEW misclassification_clusters AS
SELECT
  predicted_category,
  user_corrected_category,
  COUNT(*) AS correction_count
FROM classification_feedback
WHERE was_correct = FALSE
  AND user_corrected_category IS NOT NULL
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY predicted_category, user_corrected_category
ORDER BY correction_count DESC;
