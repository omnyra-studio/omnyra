-- Omnyra Classifier Observability — run these in the Supabase SQL editor
-- No schema changes. Read-only analysis against classification_feedback.

-- ── A. Low-confidence clusters (categories causing uncertainty) ───────────────
SELECT
  predicted_category   AS category,
  COUNT(*)             AS count
FROM classification_feedback
WHERE confidence < 0.75
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY predicted_category
ORDER BY count DESC;

-- ── B. Most ambiguous inputs (bottom of the confidence range) ─────────────────
SELECT
  input_text,
  predicted_category   AS category,
  confidence,
  path
FROM classification_feedback
WHERE confidence < 0.70
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY confidence ASC
LIMIT 50;

-- ── C. Category volume distribution (spot over/under classification) ──────────
SELECT
  predicted_category   AS category,
  COUNT(*)             AS volume,
  ROUND(AVG(confidence)::NUMERIC, 3) AS avg_confidence
FROM classification_feedback
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY predicted_category
ORDER BY volume DESC;

-- ── D. LLM usage rate (cost control) ─────────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE path = 'llm' OR path = 'llm-fallback') AS llm_calls,
  COUNT(*)                                                        AS total_calls,
  ROUND(
    COUNT(*) FILTER (WHERE path = 'llm' OR path = 'llm-fallback') * 100.0
    / NULLIF(COUNT(*), 0),
    2
  )                                                               AS llm_usage_pct
FROM classification_feedback
WHERE created_at >= NOW() - INTERVAL '7 days';

-- ── E. Ambiguous boundary inputs (0.60–0.80 confidence band) ─────────────────
SELECT
  input_text,
  predicted_category,
  confidence,
  path
FROM classification_feedback
WHERE confidence BETWEEN 0.60 AND 0.80
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY confidence ASC
LIMIT 100;

-- ── F. Known conflict pairs — Motivation vs Fitness ───────────────────────────
SELECT
  input_text,
  predicted_category,
  confidence
FROM classification_feedback
WHERE predicted_category IN ('motivation_success', 'health_fitness')
  AND confidence < 0.80
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY confidence ASC
LIMIT 30;

-- ── G. Known conflict pairs — Finance vs Side Hustles ────────────────────────
SELECT
  input_text,
  predicted_category,
  confidence
FROM classification_feedback
WHERE predicted_category IN ('finance_investing', 'side_hustles')
  AND confidence < 0.80
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY confidence ASC
LIMIT 30;

-- ── H. Misclassification correction rate ─────────────────────────────────────
SELECT
  predicted_category,
  COUNT(*) FILTER (WHERE was_correct = FALSE) AS corrections,
  COUNT(*) FILTER (WHERE was_correct = TRUE)  AS confirmed,
  COUNT(*) FILTER (WHERE was_correct IS NULL)  AS unreviewed
FROM classification_feedback
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY predicted_category
ORDER BY corrections DESC;
