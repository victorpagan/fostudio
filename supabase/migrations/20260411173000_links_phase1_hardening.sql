-- Phase 1 hardening for links automation
-- Run in Supabase SQL editor before enabling the new worker.

-- 1) Add optional source field for observability
ALTER TABLE public.links
ADD COLUMN IF NOT EXISTS source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'links_source_valid'
      AND conrelid = 'public.links'::regclass
  ) THEN
    ALTER TABLE public.links
    ADD CONSTRAINT links_source_valid
    CHECK (source IS NULL OR source IN ('square', 'squarespace'));
  END IF;
END $$;

-- 2) Archive table for expired/deleted links
CREATE TABLE IF NOT EXISTS public.links_archive (
  id bigserial PRIMARY KEY,
  archived_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  reason text NOT NULL,
  "ssOrderId" bigint,
  "orderId" text,
  email text,
  link text,
  password text,
  expires_date timestamptz,
  source text,
  synology_link_id text,
  synology_name text,
  synology_path text,
  synology_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS links_archive_ssorder_idx
  ON public.links_archive ("ssOrderId");

CREATE INDEX IF NOT EXISTS links_archive_orderid_idx
  ON public.links_archive ("orderId");

CREATE INDEX IF NOT EXISTS links_archive_archived_at_idx
  ON public.links_archive (archived_at DESC);

-- 3) Enforce idempotency (clean duplicates first if this fails)
CREATE UNIQUE INDEX IF NOT EXISTS links_ssorderid_unique_idx
  ON public.links ("ssOrderId");

CREATE UNIQUE INDEX IF NOT EXISTS links_orderid_unique_not_null_idx
  ON public.links ("orderId")
  WHERE "orderId" IS NOT NULL;
