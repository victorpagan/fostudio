CREATE OR REPLACE FUNCTION public.add_settings_template_column(p_column_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text;
BEGIN
  IF to_regclass('public.settings') IS NULL THEN
    RAISE EXCEPTION 'settings table does not exist';
  END IF;

  normalized := btrim(p_column_name);
  IF normalized = '' THEN
    RAISE EXCEPTION 'column name is required';
  END IF;

  IF normalized !~ '^[A-Za-z][A-Za-z0-9_]*$' THEN
    RAISE EXCEPTION 'invalid column name: %', normalized;
  END IF;

  IF normalized IN ('id', 'created_at', 'locationId') THEN
    RAISE EXCEPTION 'column name is reserved: %', normalized;
  END IF;

  EXECUTE format('ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS %I text', normalized);
  RETURN normalized;
END
$$;

GRANT EXECUTE ON FUNCTION public.add_settings_template_column(text) TO service_role;
