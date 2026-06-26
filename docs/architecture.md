# fostudio Architecture

## Purpose

`fostudio` is the FO Studio booking, membership, admin, analytics, access-control, and content application. It manages studio bookings, member credits/holds, Square payments/subscriptions, Google Calendar sync, Home Assistant lock/Abode automation, mail campaigns/reminders, analytics outputs, incidents/expenses, waivers, referrals, and admin dashboards.

## Runtime

- Nuxt 4 app at repo root.
- Node server runtime via Nitro (`pnpm build`, `pnpm start` runs `node .output/server/index.mjs`).
- Package manager: pnpm 10.28.1.
- Key dependencies: `@nuxtjs/supabase`, Nuxt UI/Content/Image/Studio, Square SDK, FullCalendar, Luxon, PDFKit, better-sqlite3, zod, and analytics scripts via `tsx`.

## Hosting And Deploy

- Standard Nuxt commands: `pnpm build`, `pnpm start`, `pnpm preview`.
- Public site URL defaults to `https://fo.studio` in runtime config.
- Production host: Heroku team `film-objektiv`, app `fostudio`.
- Current Heroku URL: `https://fostudio-2472c7fb148b.herokuapp.com/`.
- Nuxt Studio can be enabled in production or via `NUXT_STUDIO_ENABLED`.

## Key Directories

- `app/`: Nuxt application shell and components.
- `server/api/`: public, account, admin, internal, webhook, booking, checkout, membership, analytics, access, mail, and payments routes.
- `server/utils/`: business logic for access, booking, credits, membership, mail, Square, Google Calendar, analytics, waivers, and config.
- `server/lib/payments/`: payment provider abstraction and Square/Stripe providers.
- `admin/analytics/`: analytics ingestion, compute, report, publish, and remote-run scripts.
- `supabase/`: compatibility copy of Supabase migrations/config; source of truth is `fosupabase`.
- `content/` and Nuxt Content config: site/editor content.

## External Dependencies

- Supabase database, auth, storage, `system_config`, and `get_secret`.
- Square for payments, subscriptions, cards, catalog/pricing, customers, and webhooks. Customer sync normalizes phone numbers to Square-safe E.164 at the Square boundary and omits invalid/ambiguous phone values from Square requests while preserving local customer data. Admin-only member repair/damage charges use Square saved cards through a separate audit path and do not mint credits or alter membership revenue flows.
- `fomailer` for mail sends; SendGrid for template/admin checks. FO Studio sends registry-backed lifecycle events including `account.signup`, `booking.memberCreated`, booking changes, membership changes, credits/holds top-ups, admin member charge receipts, contact, and broadcasts.
- Home Assistant and Abode for lock/alarm access automation.
- Google Calendar API for booking calendar sync.
- Google Ads and Meta Marketing APIs for analytics ingestion.
- Nuxt Studio/content repository integration.

## Supabase Tables And Functions

Schema ownership lives in `fosupabase`; this repo owns Studio operational behavior over those tables.

- Studio core writes: `bookings`, `booking_holds`, `calendar_blocks`, `customers`, `memberships`, `membership_tiers`, `membership_credit_grants`, `membership_checkout_sessions`, `credit_balance`, `credit_topup_sessions`, `hold_balance`, `hold_topup_sessions`, `credits_ledger`, `hold_ledger`.
- Access-control writes: `lock_access_jobs`, `lock_access_incidents`, `lock_permanent_codes`, `lock_slot_assignments`, `booking_access_codes`, `door_code_change_requests`.
- Admin/content/ops writes: `admin_expense_reports`, `admin_incident_reports`, `admin_manual_membership_events`, `admin_member_charges`, `mail_campaigns`, `mail_campaign_templates`, `mail_campaign_template_id_history`, `mail_reminder_rules`, `mail_reminder_deliveries`, `waiver_templates`, `member_waiver_signatures`, `promo_codes`, `referral_credit_rules`, `membership_referrals`, `member_referral_codes`.
- Analytics writes: `analytics_outputs`, `analytics_ad_daily`.
- Shared config/mail/error reads/writes: `system_config`, `mail_template_registry`, `mail_user_preferences`, `mail_admin_copy_preferences`, `app_error_groups`, `app_error_events`, `orders2`.
- Uses RPC `get_secret`.

## Health, Readiness, And Heartbeat

- Dedicated HTTP health endpoints:
  - `GET /health`: process-level host check.
  - `GET /ready`: Supabase-backed readiness check using service-role server access.
- Service Fabric should use `/health` for public reachability and `/ready` for Supabase-backed readiness.
- Public `/ready` currently validates Supabase-backed server readiness; it does not fully validate Square, Home Assistant, Abode, Google Calendar, or internal worker auth/provider availability.
- Access subsystem has `GET /api/admin/access/status`.
- Nitro app-error reporting writes to `app_error_groups` and `app_error_events`, but intentionally filters expected non-internal `401`/`403` auth denials and common static/bot `404` probes so Service Fabric alerts represent actionable application failures.
- Internal workers include `POST /api/internal/access/process`, `POST /api/internal/access/booking-sync`, `POST /api/internal/mail/reminders/process`, `GET /api/internal/analytics/outputs`, and `POST /api/internal/analytics/run`.
- Recommended Home Assistant scheduler calls `POST /api/internal/access/process` every minute with `x-access-key`.
- Status mapping:
  - `Up`: host responds.
  - `Ready`: app host and Supabase-backed server readiness are usable.
  - `Delayed`: access jobs, reminders, analytics, or calendar sync are behind.
  - `Degraded`: Square, fomailer, Home Assistant, Abode, Google Calendar, or analytics integrations partially fail.
  - `Blocked`: required Supabase/env/secret/system_config values are missing.
  - `Down`: host unavailable.

## Operational Notes

- Access jobs activate 30 minutes before booking start and deactivate 30 minutes after booking end.
- `lock_access_jobs` is processed only if an external scheduler calls the internal process endpoint.
- Permanent lock codes are stored in `lock_permanent_codes`; active permanent slots are reserved from booking/member allocation.
- Access incident records are written before notification attempts. Notification email is best-effort and routes through the registry-backed `mailing.memberBroadcast` Fomailer handler to configured admin recipients so notification failure does not block incident creation.
- Admin member charges write a pending audit row before Square is called, update to `paid` or `failed` after Square response, and send the customer only the `billing.memberChargeReceipt` email receipt on successful payment.
- Secrets are loaded through Supabase Vault via `get_secret`; non-secret settings use `system_config` and runtime env.
- Database/RLS changes must be authored in `fosupabase`.

## Update Triggers

Update this file and `ops/service-catalog.yml` whenever changing runtime boundaries, hosting/deploy flow, env/config ownership, database/RLS behavior, Supabase table contracts, external integrations, background jobs, health/readiness/heartbeat behavior, or cross-repo contracts.
