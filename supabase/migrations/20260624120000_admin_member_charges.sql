-- Admin-initiated member repair/damage charges

CREATE TABLE IF NOT EXISTS public.admin_member_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('repair', 'damage', 'replacement', 'cleaning', 'other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 240),
  internal_note text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  incident_id uuid REFERENCES public.admin_incident_reports(id) ON DELETE SET NULL,
  square_customer_id text,
  square_card_id text,
  card_brand text,
  card_last4 text,
  square_payment_id text,
  payment_status text,
  charge_error text,
  charged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  charged_at timestamptz,
  receipt_sent_at timestamptz,
  receipt_error text,
  fomailer_response jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_member_charges_member_created_idx
  ON public.admin_member_charges (member_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_member_charges_status_created_idx
  ON public.admin_member_charges (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS admin_member_charges_square_payment_uidx
  ON public.admin_member_charges (square_payment_id)
  WHERE square_payment_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admin_member_charges_updated_at'
  ) THEN
    CREATE TRIGGER trg_admin_member_charges_updated_at
      BEFORE UPDATE ON public.admin_member_charges
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.admin_member_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_member_charges_staff_all" ON public.admin_member_charges;
CREATE POLICY "admin_member_charges_staff_all"
  ON public.admin_member_charges
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

INSERT INTO public.mail_template_registry (
  event_type,
  sendgrid_template_id,
  category,
  active,
  description,
  subject_template,
  preheader_template,
  body_template
)
VALUES (
  'billing.memberChargeReceipt',
  'd-4ebd522797324b88b14803e24a900341',
  'critical',
  true,
  'Receipt for an admin-initiated member repair, damage, replacement, cleaning, or other studio charge.',
  'FO Studio payment receipt',
  'Your {{ chargeCategoryLabel }} payment of ${{ amountDollars }} was processed.',
  '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Payment receipt</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, this confirms a studio account charge was processed.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Charge type:</strong> {{ chargeCategoryLabel }}</p>
<p style="margin:0 0 8px;"><strong>Amount:</strong> ${{ amountDollars }}</p>
<p style="margin:0 0 8px;"><strong>Reason:</strong> {{ chargeReason }}</p>
<p style="margin:0 0 8px;"><strong>Card:</strong> {{ cardBrand }} ending in {{ cardLast4 }}</p>
<p style="margin:0;"><strong>Payment reference:</strong> {{ paymentId }}</p>
</div>
<p style="margin:0 0 14px;">If you have questions about this charge, reply to this email or contact <a href="mailto:{{ supportEmail }}">{{ supportEmail }}</a>.</p>
<p style="margin:16px 0 0;font-size:13px;color:#666;">FO Studio · {{ studioAddress }}</p>
</div>'
)
ON CONFLICT (event_type) DO UPDATE SET
  sendgrid_template_id = CASE
    WHEN NULLIF(BTRIM(COALESCE(mail_template_registry.sendgrid_template_id, '')), '') IS NULL
      THEN EXCLUDED.sendgrid_template_id
    ELSE mail_template_registry.sendgrid_template_id
  END,
  category = EXCLUDED.category,
  active = COALESCE(mail_template_registry.active, EXCLUDED.active),
  description = EXCLUDED.description,
  subject_template = COALESCE(NULLIF(mail_template_registry.subject_template, ''), EXCLUDED.subject_template),
  preheader_template = COALESCE(NULLIF(mail_template_registry.preheader_template, ''), EXCLUDED.preheader_template),
  body_template = COALESCE(NULLIF(mail_template_registry.body_template, ''), EXCLUDED.body_template),
  updated_at = now();
