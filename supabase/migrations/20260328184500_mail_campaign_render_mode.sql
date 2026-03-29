-- Add render mode + dynamic data payload support for admin campaigns.
-- editor_html: server renders bodyHTML from campaign body template.
-- sendgrid_native: SendGrid template handles layout/conditionals with dynamic data JSON.

ALTER TABLE public.mail_campaign_templates
  ADD COLUMN IF NOT EXISTS render_mode text NOT NULL DEFAULT 'editor_html'
    CHECK (render_mode IN ('editor_html', 'sendgrid_native'));

ALTER TABLE public.mail_campaign_templates
  ADD COLUMN IF NOT EXISTS dynamic_data_template jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.mail_campaigns
  ADD COLUMN IF NOT EXISTS render_mode text NOT NULL DEFAULT 'editor_html'
    CHECK (render_mode IN ('editor_html', 'sendgrid_native'));

ALTER TABLE public.mail_campaigns
  ADD COLUMN IF NOT EXISTS dynamic_data_json jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO public.mail_campaign_templates (
  slug,
  name,
  description,
  event_type,
  sendgrid_template_id,
  subject_template,
  preheader_template,
  body_template,
  render_mode,
  dynamic_data_template,
  active
)
VALUES (
  'website-launch-base',
  'Website Launch Base',
  'SendGrid-native modular campaign structure for major announcements and updates.',
  'mailing.memberBroadcast',
  '',
  'New Website Launch',
  'Bookings, memberships, and account tools are now live.',
  '',
  'sendgrid_native',
  '{
    "hero_enabled": true,
    "hero_eyebrow": "FO Studio",
    "hero_title": "New Website Launch",
    "hero_copy": "We''ve launched a new home for everything studio-related - bookings, memberships, calendar access, and account management.",
    "hero_cta_url": "https://fo.studio",
    "hero_cta_label": "Go to FO Studio",
    "intro_enabled": true,
    "intro_title": "Hi - {{ customerName }}",
    "intro_copy": "It''s been an amazing 2 years since FO Studio opened, and we''re proud to have served you during that time. We''ve built this new platform to make booking and membership management much easier moving forward.",
    "features_enabled": true,
    "features_title": "What''s new",
    "feature_1_enabled": true,
    "feature_1_title": "Book in 30-minute increments",
    "feature_1_copy": "More flexibility for short tests, quick sessions, and tighter scheduling.",
    "feature_2_enabled": true,
    "feature_2_title": "Request overnight holds",
    "feature_2_copy": "Leave equipment or setups in place overnight when your plan allows it.",
    "feature_3_enabled": true,
    "feature_3_title": "Manage everything in one place",
    "feature_3_copy": "View the calendar, book, reschedule, extend bookings, and export to your own calendar.",
    "transition_enabled": true,
    "transition_title": "Important membership transition",
    "transition_bullet_1": "Please cancel your current membership before April 30 and move to the new platform.",
    "transition_bullet_2": "If you cancel sooner, we can add your remaining hours into the new system.",
    "transition_bullet_3": "Membership spots are limited - once filled, new signups move to a waitlist.",
    "transition_primary_url": "https://fo.studio/memberships",
    "transition_primary_label": "View Memberships",
    "transition_secondary_url": "https://fo.studio/faq",
    "transition_secondary_label": "Read FAQ",
    "credits_enabled": true,
    "credits_title": "How the new credit system works",
    "credits_bullet_1": "Each plan includes a monthly credit allowance.",
    "credits_bullet_2": "Credits can roll over up to a cap.",
    "credits_bullet_3": "You can buy more credits if you run out.",
    "credits_bullet_4": "Peak times use more credits than off-peak.",
    "credits_bullet_5": "Pro and Studio+ plans get better peak-time efficiency.",
    "impact_enabled": true,
    "impact_title": "What this means for current and past members",
    "impact_bullet_1": "More usable time on the same plan, especially during off-peak hours.",
    "impact_bullet_2": "New quarterly and annual options with added benefits.",
    "impact_bullet_3": "Plan changes can happen after each billing cycle.",
    "impact_bullet_4": "Updated waiver and policy flow.",
    "impact_bullet_5": "A small price increase to support studio maintenance and improvements.",
    "offer_enabled": true,
    "offer_title": "Launch Offer",
    "offer_copy_html": "Use the code below for <strong>5% off</strong> your new membership through <strong>April 30</strong>.",
    "offer_code": "NEWSITE",
    "offer_cta_url": "https://fo.studio/memberships",
    "offer_cta_label": "Start Membership",
    "closing_enabled": true,
    "closing_title": "Thanks for being part of FO Studio",
    "closing_copy": "We''re working to make FO Studio the best turnkey studio in Los Angeles, and this new site is a big step in that direction.",
    "footer_name": "FO Studio",
    "footer_address_1": "3131 N. San Fernando Rd.",
    "footer_address_2": "Los Angeles, CA 90065",
    "footer_link_home_url": "https://fo.studio",
    "footer_link_home_label": "fo.studio",
    "footer_link_memberships_url": "https://fo.studio/memberships",
    "footer_link_memberships_label": "Memberships",
    "footer_link_faq_url": "https://fo.studio/faq",
    "footer_link_faq_label": "FAQ",
    "footer_link_contact_url": "https://fo.studio/contact",
    "footer_link_contact_label": "Contact"
  }'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;
