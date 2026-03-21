-- Add registry-driven copy overrides for SendGrid base template interpolation
ALTER TABLE public.mail_template_registry
  ADD COLUMN IF NOT EXISTS subject_template text,
  ADD COLUMN IF NOT EXISTS preheader_template text,
  ADD COLUMN IF NOT EXISTS body_template text;
