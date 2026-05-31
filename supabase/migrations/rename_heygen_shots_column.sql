-- Rename heygen_shots → avatar_shots in shot_plans table.
-- Provider-agnostic name since avatar shots now use Kling + SyncLabs.
ALTER TABLE shot_plans
  RENAME COLUMN heygen_shots TO avatar_shots;
