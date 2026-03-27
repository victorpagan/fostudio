# FO Studio

## Lock Access + Home Assistant Runbook

This project uses a queued lock access workflow:

1. Booking and membership events enqueue jobs in `public.lock_access_jobs`.
2. A worker endpoint processes due jobs.
3. Processed jobs call Home Assistant service APIs to set/clear Z-Wave lock PINs and trigger Abode alarm actions.

If no scheduler calls the worker endpoint, lock changes never reach Home Assistant.

### Queue and worker

- Queue table: `public.lock_access_jobs`
- Worker logic: `server/utils/access/jobs.ts` (`processDueAccessJobs`)
- Worker endpoint: `POST /api/internal/access/process`
- Internal auth: `x-access-key: ACCESS_AUTOMATION_SHARED_KEY`

### Required `system_config` keys

Set these values:

- `LOCK_SYNC_ENABLED = true`
- `LOCK_PROVIDER_MODE = "home_assistant"`
- `ABODE_PROVIDER_MODE = "home_assistant"`
- `HOME_ASSISTANT_BASE_URL = "https://<your-ha-remote-url>"`
- `HOME_ASSISTANT_LOCK_ENTITY_ID = "lock.yale_studio_lock"` (or your lock entity)
- `HOME_ASSISTANT_ABODE_ALARM_ENTITY_ID = "alarm_control_panel.abode_alarm"` (or your Abode entity)
- `HOME_ASSISTANT_ABODE_UNLOCK_ACTION = "alarm_control_panel.alarm_disarm"` (or `alarm_control_panel.alarm_arm_home`)
- `HOME_ASSISTANT_ABODE_ARM_AWAY_ACTION = "alarm_control_panel.alarm_arm_away"`

### Required Vault secrets

- `HOME_ASSISTANT_API_TOKEN` (HA long-lived access token)
- `ACCESS_AUTOMATION_SHARED_KEY` (shared key for internal worker endpoints)
- Optional: `HOME_ASSISTANT_ABODE_ALARM_CODE` (if disarm/arm actions require an alarm code)

### Home Assistant scheduler (recommended)

Add these blocks in Home Assistant `configuration.yaml`:

```yaml
rest_command:
  fostudio_access_process:
    url: "https://<your-fostudio-api>/api/internal/access/process"
    method: POST
    headers:
      content-type: "application/json"
      x-access-key: "<ACCESS_AUTOMATION_SHARED_KEY>"
    payload: '{"limit":50}'

automation:
  - alias: "FO Studio Access Queue Worker"
    trigger:
      - platform: time_pattern
        minutes: "/1"
    action:
      - service: rest_command.fostudio_access_process
    mode: single
```

Then reload `rest_command` and automations (or restart HA).

### Manual verification commands

```bash
API_BASE="https://<your-fostudio-api>"
ACCESS_KEY="<ACCESS_AUTOMATION_SHARED_KEY>"

# process due jobs
curl -sS -X POST "$API_BASE/api/internal/access/process" \
  -H "Content-Type: application/json" \
  -H "x-access-key: $ACCESS_KEY" \
  -d '{"limit":50}'

# enqueue one booking
curl -sS -X POST "$API_BASE/api/internal/access/booking-sync" \
  -H "Content-Type: application/json" \
  -H "x-access-key: $ACCESS_KEY" \
  -d '{"bookingId":"<BOOKING_UUID>","reason":"manual_test"}'
```

### Current behavior notes

- Access activation window is `booking start - 30m` through `booking end + 30m`.
- PINs are set when the activation window begins (not necessarily at booking creation time).
- Reschedule, cancel, and delete booking paths enqueue access sync jobs.
- Guest bookings created as `pending_payment` do not get active access until payment confirmation marks them as `confirmed/requested` and `/api/internal/access/booking-sync` is called.

### Troubleshooting

- If lock slots stay empty, confirm worker endpoint is actually being called every minute.
- Check admin status endpoint: `GET /api/admin/access/status`.
- Inspect queue directly:

```sql
select id, job_type, status, booking_id, user_id, run_at, attempts, max_attempts, last_error, updated_at
from public.lock_access_jobs
order by run_at asc, id asc
limit 100;
```
