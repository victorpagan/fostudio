import { requireServerAdmin } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const [states, events, failures24h, failures7d] = await Promise.all([
    db.from('studio_access_monitor_state').select('monitor_key,state,details,checked_at').in('monitor_key', ['abode-connection', 'last-verified:disarmed', 'last-verified:armed_away', 'last-verified:armed_home']),
    db.from('studio_access_monitor_events').select('id,monitor_key,state,previous_state,details,created_at,notified_at,notify_error').gte('created_at', since).order('created_at', { ascending: false }).limit(30),
    db.from('lock_access_incidents').select('id', { count: 'exact', head: true }).eq('incident_type', 'abode_automation_failure').gte('created_at', new Date(Date.now() - 86400000).toISOString()),
    db.from('lock_access_incidents').select('id', { count: 'exact', head: true }).eq('incident_type', 'abode_automation_failure').gte('created_at', since)
  ])
  if ([states, events, failures24h, failures7d].some(result => result.error)) {
    throw createError({ statusCode: 503, statusMessage: 'Access monitoring data is unavailable; verify the monitoring migration is installed.' })
  }
  return { states: states.data, events: events.data, failures24h: failures24h.count, failures7d: failures7d.count }
})
