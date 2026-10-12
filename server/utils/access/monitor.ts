import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { getAbodeMonitorHealth } from './providers'
import { accessJobOutcome } from './jobOutcome'
import { monitorMailOperationKey, monitorMailWasSent } from './monitorMail'
import { sendViaFomailer } from '../mail/fomailer'
import { normalizeMailRecipient } from '../mail/adminPayload'

export async function monitorAccess(event: H3Event) {
  // Schema lives in fosupabase and may precede generated application types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serverSupabaseServiceRole(event) as any
  const { data: prior, error: priorError } = await db.from('studio_access_monitor_state').select('monitor_key,state,details')
  if (priorError) throw new Error(priorError.message)
  const previous = new Map<string, { state: string, details: Record<string, unknown> }>((prior ?? []).map((row: { monitor_key: string, state: string, details: Record<string, unknown> }) => [row.monitor_key, row]))
  const observe = async (key: string, state: string, details: Record<string, unknown>) => {
    const old = previous.get(key)
    if (key !== 'abode-connection' && old?.state === state && JSON.stringify(old.details) === JSON.stringify(details)) return
    const { error } = await db.rpc('record_studio_access_observation', { p_key: key, p_state: state, p_details: details })
    if (error) throw new Error(error.message)
    previous.set(key, { state, details })
  }
  const health = await getAbodeMonitorHealth(event)
  await observe('abode-connection', health.ok && health.mode === 'home_assistant' ? 'Ready' : 'Degraded', {
    reportedState: health.state,
    message: health.ok ? 'Entity reachable; command verification is separate.' : 'HA alarm entity unavailable or unreachable. Review HA integration logs.'
  })
  const { data: jobs, error } = await db.from('lock_access_jobs')
    .select('id,job_type,status,attempts,payload,last_response,processed_at,booking_id')
    .in('job_type', ['arm_after_booking_end', 'activate_member_window', 'activate_guest_window'])
    .gte('updated_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .order('updated_at', { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  for (const job of jobs ?? []) {
    const outcome = accessJobOutcome(job)
    if (job.status === 'dead') {
      await observe(`job:${job.id}`, 'Failed', { jobId: job.id, bookingId: job.booking_id, message: 'Required access/alarm job exhausted retries. No successful recovery confirmed.' })
    } else if (job.status === 'succeeded') {
      const verifiedAlarm = job.last_response?.abode?.verification
      if (verifiedAlarm?.verified === true && ['disarmed', 'armed_away', 'armed_home'].includes(verifiedAlarm.state)) {
        const key = `last-verified:${verifiedAlarm.state}`
        const priorTime = Date.parse(String(previous.get(key)?.details.verifiedAt ?? ''))
        if (!Number.isFinite(priorTime) || Date.parse(job.processed_at) > priorTime) {
          await observe(key, 'Verified', { jobId: job.id, verifiedAt: job.processed_at })
        }
      }
      if (!previous.has(`job:${job.id}`)) continue
      await observe(`job:${job.id}`, outcome.verified ? 'Verified' : 'Skipped', {
        jobId: job.id, bookingId: job.booking_id, verifiedAt: job.processed_at,
        message: outcome.verified ? `${outcome.evidence.join('. ')}. Only the listed operations were verified; this does not verify other access operations.` : 'Work completed without physical recovery verification; inspect job outcome.'
      })
    }
  }
  const { data: alerts, error: alertError } = await db.from('studio_access_monitor_events')
    .select('id,monitor_key,state,previous_state,details,created_at').is('notified_at', null).order('created_at').limit(1)
  if (alertError) throw new Error(alertError.message)
  const { data: prefs, error: prefsError } = await db.from('mail_admin_copy_preferences').select('recipients').eq('scope', 'global').maybeSingle()
  if (prefsError) throw new Error(prefsError.message)
  const to = normalizeMailRecipient(useRuntimeConfig(event).contactToEmail as string | undefined)
    ?? (prefs?.recipients ?? []).map(normalizeMailRecipient).find(Boolean)
  let notified = 0
  for (const alert of alerts ?? []) {
    try {
      if (!to) throw new Error('No staff notification recipient configured')
      const title = alert.monitor_key === 'abode-connection' && alert.state === 'Ready'
        ? 'Abode connection restored; command verification pending'
        : `${alert.monitor_key}: ${alert.state === 'Verified' ? 'Verified outcome recorded; review evidence' : alert.state}`
      // Only locally constructed summaries enter mail, never raw HA logs or codes.
      const body = `<p>${title}</p><p>${String(alert.details.message ?? '').replace(/[<>&"']/g, '')}</p><p>Observed at ${new Date(alert.created_at).toISOString()}. This reports a recorded transition, not necessarily the current state.</p><p>Review Admin / Door codes / Jobs for timestamps and evidence.</p>`
      const delivery = await sendViaFomailer(event, {
        body: { type: 'mailing.memberBroadcast',
          payload: { to, eventType: 'mailing.memberBroadcast', skipRegistryCopyOverrides: true, subject: `Studio access: ${title}`, body, bodyHtml: body, bodyHTML: body } },
        headers: { 'x-idempotency-key': monitorMailOperationKey(alert.id) }
      }, { timeoutMs: 6000 })
      if (!delivery.ok || !monitorMailWasSent(delivery.data)) throw new Error('Fomailer delivery not confirmed')
      const { error: updateError } = await db.from('studio_access_monitor_events').update({ notified_at: new Date().toISOString(), notify_error: null }).eq('id', alert.id)
      if (updateError) throw new Error(updateError.message)
      notified++
    } catch {
      await db.from('studio_access_monitor_events').update({ notify_error: 'Staff alert delivery failed; will retry next check.' }).eq('id', alert.id)
    }
  }
  return { checked: true, notified }
}
