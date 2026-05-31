-- Fix shots.render_assignment CHECK constraint.
-- Original: CHECK (render_assignment IN ('heygen','fal'))
-- Updated:  CHECK (render_assignment IN ('avatar','fal'))
--
-- PostgreSQL inline CHECK constraint name is auto-generated as
-- {table}_{column}_check. Drop by name; re-add with correct values.
-- The DO block finds the actual name dynamically to be safe.

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT constraint_name INTO v_constraint
  FROM   information_schema.table_constraints
  WHERE  table_name       = 'shots'
    AND  constraint_type  = 'CHECK'
    AND  constraint_name  LIKE '%render_assignment%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE shots DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE shots
  ADD CONSTRAINT shots_render_assignment_check
  CHECK (render_assignment IN ('avatar', 'fal'));
