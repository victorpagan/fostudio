# fostudio Architecture

## Purpose

`fostudio` is the FO Studio booking, membership, admin, analytics, access-control, and content application. It manages studio bookings, member credits/holds, Square payments/subscriptions, Google Calendar and Peerspace-mirror sync, Home Assistant lock/Abode automation, mail campaigns/reminders, analytics outputs, incidents/expenses, waivers, referrals, and admin dashboards.

## Runtime

- Nuxt 4 app at repo root.
- Node server runtime via Nitro (`pnpm build`, `pnpm start` runs `node .output/server/index.mjs`).
- Package manager: pnpm 10.28.1.
- Key dependencies: `@nuxtjs/supabase`, Nuxt UI/Content/Image/Studio, Square SDK, FullCalendar, Luxon, PDFKit, better-sqlite3, zod, and analytics scripts via `tsx`.
- CI runs tests, a production dependency audit, lint, typecheck, and a production build. The Nitro build receives an 8 GB Node heap budget because final server packaging can exceed Node's default heap.

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
- Google Calendar API for booking calendar sync and Peerspace calendar-mirror ingestion. Peerspace is not treated as a direct API dependency; its supported Google/iCal mirror supplies reservation time, title, confirmation reference, and manage URL but not the guest email.
- Google Ads and Meta Marketing APIs for analytics ingestion.
- Google Ads browser measurement is loaded only after explicit cookie consent; essential account cookies remain available after an analytics opt-out.
- Nuxt Studio/content repository integration.

## Supabase Tables And Functions

Schema ownership lives in `fosupabase`; this repo owns Studio operational behavior over those tables.

- The compatibility migration set mirrors the shared `links.created_at` and `links_archive.created_at` lifecycle timestamps, the service-only latest `service_instance_heartbeats_current` view, the one-active-request-per-order `link_worker_requests`/`replace_link_for_worker` contract, and the service-only `count_order_note_events(bigint[])` dashboard aggregate with its partial activity index. `fosupabase` remains authoritative; FO Studio consumes none of these dashboard/PhaseTwo contracts.

- Studio core writes: `bookings`, `booking_holds`, `calendar_blocks`, `customers`, `memberships`, `membership_tiers`, `membership_credit_grants`, `membership_checkout_sessions`, `credit_balance`, `credit_topup_sessions`, `hold_balance`, `hold_topup_sessions`, `credits_ledger`, `hold_ledger`.
- Access-control writes: `lock_access_jobs`, `lock_access_incidents`, `lock_permanent_codes`, `lock_slot_assignments`, `booking_access_codes`, `booking_external_access`, `door_code_change_requests`.
- Admin/content/ops writes: `admin_expense_reports`, `admin_incident_reports`, `admin_manual_membership_events`, `admin_member_charges`, `mail_campaigns`, `mail_campaign_templates`, `mail_campaign_template_id_history`, `mail_reminder_rules`, `mail_reminder_deliveries`, `waiver_templates`, `member_waiver_signatures`, `promo_codes`, `referral_credit_rules`, `membership_referrals`, `member_referral_codes`.
- Analytics writes: `analytics_outputs`, `analytics_ad_daily`.
- Shared config/mail/error reads/writes: `system_config`, `mail_template_registry`, `mail_user_preferences`, `mail_admin_copy_preferences`, `app_error_groups`, `app_error_events`, `orders2`.
- Uses RPCs `get_secret`, `create_confirmed_booking_with_burn_and_rate`, and `create_confirmed_booking_with_burn_no_membership_and_rate`. The booking wrappers keep the booking, credit burn, rate kind, and rate-policy snapshot in one transaction and are executable only by `service_role`.

## Security And Data Boundaries

- Admin authorization trusts protected Supabase `app_metadata` only. User-editable `user_metadata` is never an authorization source.
- Anonymous and member calendars are sanitized application API responses. The application reads occupancy with the server-side service role and does not expose booking rows through a public Data API policy.
- Public marketing policy is normalized by `GET /api/site/important-bits`: it exposes only safe guest/non-member booking limits, standby savings, the current public entry membership, and one admin-selected homepage promotion. Promo visibility is still gated by active dates, remaining redemptions, membership scope, and a linked Square discount.
- Authenticated Data API access to `bookings` and `booking_holds` is read-only: members can read their own rows and dashboard admins can read operational rows. Booking and hold writes must pass through server routes and restricted RPCs so credit, waiver, overlap, guest, standby, and workshop rules cannot be bypassed.
- Admin-authored waiver HTML is allowlist-sanitized before persistence and again before rendering. Executable elements, event handlers, inline styles, and unsafe link protocols are removed.
- Production responses set CSP, HSTS, frame, MIME-sniffing, referrer, permissions, and cross-domain policy headers. The CSP explicitly permits the configured Square, Supabase, Google measurement, fonts, maps, and media dependencies.
- Public signup, checkout-signup, password-recovery, and contact routes use hashed IP/identifier rate-limit buckets. These buckets are process-local; platform/edge rate limiting remains the preferred additional defense for multi-dyno or high-volume abuse.

## Health, Readiness, And Heartbeat

- Dedicated HTTP health endpoints:
  - `GET /health`: process-level host check.
  - `GET /ready`: Supabase-backed readiness check using service-role server access.
- Service Fabric should use `/health` for public reachability and `/ready` for Supabase-backed readiness.
- Public `/ready` currently validates Supabase-backed server readiness; it does not fully validate Square, Home Assistant, Abode, Google Calendar, or internal worker auth/provider availability.
- Access subsystem has `GET /api/admin/access/status` for queue/incident and live provider-health visibility, plus `POST /api/admin/access/jobs.retry` for authenticated, reason-audited retries of dead jobs. Retry uses a conditional `status='dead'` update, resets execution state, and records the requesting admin plus prior error context in the job payload.
- Nitro app-error reporting writes to `app_error_groups` and `app_error_events`, but intentionally filters expected non-internal `401`/`403` auth denials and common static/bot `404` probes so Service Fabric alerts represent actionable application failures.
- Internal workers include `POST /api/internal/access/process`, `POST /api/internal/access/booking-sync`, `POST /api/internal/calendar/maintenance`, `POST /api/internal/mail/reminders/process`, `GET /api/internal/analytics/outputs`, and `POST /api/internal/analytics/run`.
- Supabase `pg_cron`/`pg_net` calls `POST /api/internal/access/process` every minute with `x-access-key`. The database scheduler is authoritative so a Home Assistant outage cannot also remove queue scheduling; the former HA automation is a disabled emergency fallback.
- Supabase `pg_cron`/`pg_net` calls `POST /api/internal/calendar/maintenance` every five minutes with `x-access-key`. In bounded batches, the worker checks Square before releasing a stale guest-payment reservation, preserves completed or in-flight payments for confirmation, deletes unpaid checkout links, expires the linked top-up session, and then cancels the local reservation. It also runs throttled Google Calendar maintenance; calendar GET requests are read-only.
- Status mapping:
  - `Up`: host responds.
  - `Ready`: app host and Supabase-backed server readiness are usable.
  - `Delayed`: access jobs, reminders, analytics, or calendar sync are behind.
  - `Degraded`: Square, fomailer, Home Assistant, Abode, Google Calendar, or analytics integrations partially fail.
  - `Blocked`: required Supabase/env/secret/system_config values are missing.
  - `Down`: host unavailable.

## Operational Notes

- Access jobs activate 30 minutes before booking start and deactivate 30 minutes after booking end.
- `lock_access_jobs` is processed by the once-per-minute Supabase scheduler. Jobs use atomic compare-and-claim updates so brief scheduler overlap is safe.
- Home Assistant lock writes fail closed when the lock entity is `unknown`/`unavailable` and must pass a physical `get_lock_usercode` read-back before the job succeeds. Still-relevant dead jobs are health-gated and automatically requeued after a cooldown, up to a bounded recovery limit; successful recovery clears stale errors and resolves matching lock-sync incidents.
- Outside daytime lab hours, access activation sends an explicit Abode disarm at the 30-minute booking lead and verifies the alarm reports `disarmed` before the job succeeds. Disarm requests are never skipped based only on Home Assistant's cached state because the Abode entity can remain stale while the physical panel changes. The Yale unlock automation is a direct disarm fallback, not the primary disarm path. Alarm service calls poll the entity after Home Assistant accepts the command, and an end-of-window arm is skipped while any other booking access window is active.
- Abode arm actions read the current alarm state first and treat an already-satisfied arm request as success. Disarm actions are intentionally repeated for physical-entry safety.
- Admin dead-job retry only returns a job to `pending`; the normal internal access processor remains responsible for execution. Non-dead or concurrently changed jobs fail closed with `409`.
- Permanent lock codes are stored in `lock_permanent_codes`; active permanent slots are reserved from booking/member allocation.
- Access incident records are written before notification attempts. Notification email is best-effort and routes through the registry-backed `mailing.memberBroadcast` Fomailer handler to configured admin recipients so notification failure does not block incident creation.
- Admin member charges write a pending audit row before Square is called, update to `paid` or `failed` after Square response, and send the customer only the `billing.memberChargeReceipt` email receipt on successful payment.
- Admin scheduled external access represents Peerspace/manual reservations as ordinary guest `bookings` rows linked by `booking_external_access`. This intentionally reuses the existing 30-minute lead/trail window, guest slot allocator, physical lock read-back, retry/dead-job recovery, and cancellation cleanup. Linked external calendar rows are suppressed from occupancy responses, and linked local bookings are not pushed back to Google, preventing duplicate blocks and sync loops. Migration `20260805174630_fostudio_external_booking_access.sql` and the matching runtime are `Ready` in production as of 2026-08-05.
- Peerspace reconciliation runs after inbound Google Calendar upserts. A normalized confirmation number can atomically adopt a previously manual entry even when its entered time boundaries differ, while preserving the existing PIN; the mirrored Peerspace event then owns booking times and the normal access queue recalculates its 30-minute lead/trail window. Ambiguous confirmations fail closed, repeated failures are deduplicated, and recovery resolves matching sync incidents. Cancellation updates the linked booking and queues immediate access cleanup. PIN delivery remains an explicit admin action through the Peerspace conversation because the calendar mirror does not provide the guest email. `peerspace_access_auto_provision_enabled` in `system_config` owns automatic provisioning.
- Authenticated guests can inspect and resume their own active Square checkout through `GET /api/bookings/guest/payment-status`. Releasing a pending reservation closes its Square payment link before the local slot is canceled; a completed or in-flight payment fails closed for confirmation instead of being discarded.
- Secrets are loaded through Supabase Vault via `get_secret`; non-secret settings use `system_config` and runtime env.
- Guest booking policy is runtime-configurable through `system_config`; the current operational access window and application fallback are 9:00 AM–9:00 PM Los Angeles time.
- `ACCESS_AUTOMATION_SHARED_KEY` authenticates both access and calendar-maintenance workers. `ACCESS_PROCESSOR_URL` and `CALENDAR_MAINTENANCE_URL` in `system_config` own their callback URLs; the shared key remains Vault-only.
- Database/RLS changes must be authored in `fosupabase`.
- Booking hardening rollout order is additive RPC migration, application deployment, then Data API RLS lockdown and calendar cron activation. Reversing that order would temporarily break calendar reads or booking creation. Scheduled external access followed the required additive `booking_external_access` migration-first order before its admin UI/API deployment; calendar reads retain a missing-table compatibility fallback for older environments.

## Update Triggers

Update this file and `ops/service-catalog.yml` whenever changing runtime boundaries, hosting/deploy flow, env/config ownership, database/RLS behavior, Supabase table contracts, external integrations, background jobs, health/readiness/heartbeat behavior, or cross-repo contracts.
