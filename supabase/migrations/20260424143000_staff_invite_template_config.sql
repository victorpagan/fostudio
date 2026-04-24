-- Staff provisioning invite email dynamic template.
-- Used by fomailer /api/mail/staff/invite.

INSERT INTO public.system_config (key, value)
VALUES (
  'STAFF_INVITE_SENDGRID_TEMPLATE_ID',
  '"d-1e2e6b4e075b4937a570ce45b9f4c0aa"'::jsonb
)
ON CONFLICT (key) DO NOTHING;
