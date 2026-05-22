-- DB-enforced render state machine.
--
-- Per spec "Safe Data Mutation Rules":
--   "REJECT ANY INVALID TRANSITION"
--
-- Allowed transitions:
--   NULL/none → queued        (insert-only state)
--   queued    → drafting | failed
--   drafting  → rendering | drafting | failed   (regenerate = self-loop)
--   rendering → complete | failed
--   failed    → drafting | rendering | failed   (retry path)
--   complete  → complete                        (terminal; no escape)
--
-- A BEFORE UPDATE trigger inspects OLD.status vs NEW.status and raises
-- on illegal moves. service_role and authenticated callers both must
-- obey the machine; only an explicit `SET LOCAL omnyra.bypass = 'on'`
-- in a session can bypass it (used by admin reconciliation, never by
-- application code).

CREATE OR REPLACE FUNCTION trg_renders_status_machine()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old TEXT := OLD.status;
  v_new TEXT := NEW.status;
  v_bypass TEXT;
BEGIN
  -- Allow explicit operator bypass for admin reconciliation.
  BEGIN
    v_bypass := current_setting('omnyra.bypass', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = 'on' THEN
    RETURN NEW;
  END IF;

  -- Same status (e.g. updating other columns) is always allowed.
  IF v_old IS NOT DISTINCT FROM v_new THEN
    RETURN NEW;
  END IF;

  -- Terminal: complete cannot transition out.
  IF v_old = 'complete' THEN
    RAISE EXCEPTION 'render_state_machine: cannot transition from complete (got %)', v_new
      USING ERRCODE = '23514';
  END IF;

  IF v_old = 'queued' AND v_new NOT IN ('drafting','failed') THEN
    RAISE EXCEPTION 'render_state_machine: invalid transition queued → %', v_new
      USING ERRCODE = '23514';
  END IF;

  IF v_old = 'drafting' AND v_new NOT IN ('rendering','failed') THEN
    RAISE EXCEPTION 'render_state_machine: invalid transition drafting → %', v_new
      USING ERRCODE = '23514';
  END IF;

  IF v_old = 'rendering' AND v_new NOT IN ('complete','failed') THEN
    RAISE EXCEPTION 'render_state_machine: invalid transition rendering → %', v_new
      USING ERRCODE = '23514';
  END IF;

  IF v_old = 'failed' AND v_new NOT IN ('drafting','rendering','failed') THEN
    RAISE EXCEPTION 'render_state_machine: invalid transition failed → %', v_new
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS renders_status_machine ON renders;
CREATE TRIGGER renders_status_machine
  BEFORE UPDATE OF status ON renders
  FOR EACH ROW
  EXECUTE FUNCTION trg_renders_status_machine();
