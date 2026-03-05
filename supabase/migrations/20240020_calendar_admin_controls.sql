-- =============================================================================
-- Calendar admin controls:
-- - configurable peak window in system_config
-- - explicit studio block windows (calendar_blocks)
-- =============================================================================

INSERT INTO public.system_config (key, value) VALUES
  ('peak_days', '[1,2,3,4]'::jsonb),
  ('peak_start_hour', '11'::jsonb),
  ('peak_end_hour', '16'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.calendar_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_time  timestamptz NOT NULL,
  end_time    timestamptz NOT NULL,
  reason      text,
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_blocks_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS calendar_blocks_start_time_idx
  ON public.calendar_blocks(start_time);

CREATE INDEX IF NOT EXISTS calendar_blocks_active_idx
  ON public.calendar_blocks(active);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'calendar_blocks_no_overlap_excl'
  ) THEN
    ALTER TABLE public.calendar_blocks
      ADD CONSTRAINT calendar_blocks_no_overlap_excl
      EXCLUDE USING GIST (
        tstzrange(start_time, end_time, '[)') WITH &&
      )
      WHERE (active);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_calendar_blocks_updated_at'
  ) THEN
    CREATE TRIGGER trg_calendar_blocks_updated_at
      BEFORE UPDATE ON public.calendar_blocks
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.calendar_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_blocks: admin all" ON public.calendar_blocks;
CREATE POLICY "calendar_blocks: admin all"
  ON public.calendar_blocks FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
