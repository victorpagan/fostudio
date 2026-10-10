# Abode monitoring deployment

This package is passive: no alarm commands, restarts, or integration reloads.

1. Back up HA configuration. Enable package loading if not already enabled:
   `homeassistant: packages: !include_dir_named packages` (merge with existing config).
2. Merge `fire_event: true` into the existing `system_log` configuration.
3. Install `fo_studio_abode_monitor.yaml` in the HA packages directory. Verify
   `alarm_control_panel.abode_alarm` matches the installed entity. Validate HA config
   before loading. Schedule any necessary restart only in an approved empty-site window.
4. Confirm `sensor.fo_studio_abode_monitor` exists. If its entity ID differs, set
   `HOME_ASSISTANT_ABODE_MONITOR_ENTITY_ID` in FO Studio system_config.
5. Apply fosupabase migration `20261010190157_studio_abode_monitor.sql`, then deploy
   FO Studio. Set `ACCESS_MONITOR_ENABLED=true` only after the endpoint and HA package
   are ready. Cron uses the existing Vault access key and processor URL, every 5 min.
6. Confirm Admin / Door codes / Jobs shows a recent monitoring check. A stale check
   is Degraded, never green. Check cron/net response history if timestamps stop.
7. After a legitimate, safely scheduled arm/disarm, confirm the corresponding
   last-verified timestamp changes. Do not generate test alarm commands while occupied.

HA notifications are persistent dashboard notifications, not mobile push by default.
For push, add an existing staff notify action to the notification automation; do not
invent a device target. Stable notification IDs group repeated errors. A state becoming
reachable is not proof a cloud command worked. Only FO Studio's actual command read-back
produces verified recovery. HA cannot notify reliably when its host is offline; the
external five-minute check supplies this coverage. If FO Studio or its cron is also
Down, use the existing Service Fabric availability monitor; no single monitor covers
its own outage.

Rollback: set ACCESS_MONITOR_ENABLED=false. Remove only the new HA package at the next
safe reload. Retain monitoring tables/history; existing access scheduling is independent.
