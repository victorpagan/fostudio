import { randomInt } from 'node:crypto'
import { DateTime } from 'luxon'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { ensureDoorCodeForUser } from '~~/server/utils/membership/doorCode'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'
import { createAccessIncident } from '~~/server/utils/access/incidents'
import {
  computeAccessWindow,
  isAccessEligibleBookingStatus,
  isInsideAccessWindow,
  isOutsideAbodeArmingGap
} from '~~/server/utils/access/policy'
import {
  computeBookingEndJobTimes,
  DEFAULT_ABODE_BOOKING_END_ARM_DELAY_MINUTES,
  DEFAULT_ABODE_BOOKING_END_EARLY_HOUR,
  DEFAULT_ABODE_BOOKING_END_LATE_HOUR,
  DEFAULT_BOOKING_END_REMINDER_MINUTES,
  shouldScheduleAbodeArmAfterBookingEnd
} from '~~/server/utils/access/bookingEndPolicy'
import { clearLockUserCode, getLockProviderHealth, isLockSyncEnabled, sendAbodeAutomationEvent, setLockUserCode } from '~~/server/utils/access/providers'
import { getServerConfigMap } from '~~/server/utils/config/secret'
import { sendBookingEndingSoonReminderMail } from '~~/server/utils/mail/bookingEndingSoonReminder'
import { sanitizeForJSON } from '~~/server/utils/sanitize'
import {
  allocateGuestSlot,
  allocateMemberSlot,
  getActiveGuestSlot,
  getActiveMemberSlot,
  releaseGuestSlot
} from '~~/server/utils/access/slots'

const DEFAULT_RETRY_SCHEDULE_SECONDS = [0, 60, 300, 900]
const DEFAULT_MAX_ATTEMPTS = 4
const AUTO_RECOVERY_COOLDOWN_MINUTES = 5
const MAX_AUTO_RECOVERIES = 3

type LockAccessJobType
  = | 'activate_member_window'
    | 'deactivate_member_window'
    | 'activate_guest_window'
    | 'deactivate_guest_window'
    | 'send_booking_ending_reminder'
    | 'arm_after_booking_end'
    | 'refresh_member_active'

type BookingRow = {
  id: string
  user_id: string | null
  status: string | null
  start_time: string
  end_time: string
  guest_name: string | null
  guest_email: string | null
  booking_rate_kind: string | null
}

type JobRow = {
  id: number
  job_type: LockAccessJobType
  status: string
  booking_id: string | null
  user_id: string | null
  run_at: string
  attempts: number
  max_attempts: number
  payload: Record<string, unknown> | null
}

function parseRetrySchedule(value: unknown) {
  if (Array.isArray(value)) {
    const parsed = value
      .map(v => Number(v))
      .filter(v => Number.isFinite(v) && v >= 0)
      .map(v => Math.floor(v))

    if (parsed.length) return parsed
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = value
      .split(',')
      .map(chunk => Number(chunk.trim()))
      .filter(v => Number.isFinite(v) && v >= 0)
      .map(v => Math.floor(v))

    if (parsed.length) return parsed
  }

  return DEFAULT_RETRY_SCHEDULE_SECONDS
}

async function getRetryScheduleSeconds(event: H3Event) {
  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'LOCK_RETRY_SCHEDULE_SECONDS')
    .maybeSingle()

  if (error) {
    console.warn('[access/jobs] failed to read LOCK_RETRY_SCHEDULE_SECONDS, using default', error.message)
    return DEFAULT_RETRY_SCHEDULE_SECONDS
  }

  return parseRetrySchedule(data?.value)
}

type BookingEndAutomationPolicy = {
  reminderMinutes: number
  armDelayMinutes: number
  earlyHour: number
  lateHour: number
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)))
}

async function loadBookingEndAutomationPolicy(event: H3Event): Promise<BookingEndAutomationPolicy> {
  const config = await getServerConfigMap(event, [
    'BOOKING_END_REMINDER_MINUTES',
    'ABODE_BOOKING_END_ARM_DELAY_MINUTES',
    'ABODE_BOOKING_END_EARLY_HOUR',
    'ABODE_BOOKING_END_LATE_HOUR'
  ]).catch((error) => {
    console.warn('[access/jobs] failed to load booking-end policy, using defaults', {
      message: (error as Error)?.message ?? String(error)
    })
    return {} as Record<string, unknown>
  })

  return {
    reminderMinutes: boundedInteger(
      config.BOOKING_END_REMINDER_MINUTES,
      DEFAULT_BOOKING_END_REMINDER_MINUTES,
      1,
      180
    ),
    armDelayMinutes: boundedInteger(
      config.ABODE_BOOKING_END_ARM_DELAY_MINUTES,
      DEFAULT_ABODE_BOOKING_END_ARM_DELAY_MINUTES,
      0,
      240
    ),
    earlyHour: boundedInteger(
      config.ABODE_BOOKING_END_EARLY_HOUR,
      DEFAULT_ABODE_BOOKING_END_EARLY_HOUR,
      0,
      23
    ),
    lateHour: boundedInteger(
      config.ABODE_BOOKING_END_LATE_HOUR,
      DEFAULT_ABODE_BOOKING_END_LATE_HOUR,
      0,
      23
    )
  }
}

function nextRetryAtIso(now: DateTime, scheduleSeconds: number[], attempts: number) {
  const idx = Math.min(Math.max(1, attempts), scheduleSeconds.length - 1)
  const delaySeconds = scheduleSeconds[idx] ?? scheduleSeconds[scheduleSeconds.length - 1] ?? 60
  return now.plus({ seconds: delaySeconds }).toUTC().toISO()
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  return payload as Record<string, unknown>
}

function readAutoRecoveryCount(payload: Record<string, unknown> | null | undefined) {
  const recovery = payload?.automaticRecovery
  if (!recovery || typeof recovery !== 'object' || Array.isArray(recovery)) return 0
  const count = Number((recovery as Record<string, unknown>).count)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function summarizeProviderResult(result: {
  status: number
  body: unknown
  verification?: { verified: true, inUse: boolean }
}) {
  return {
    status: result.status,
    response: result.body ?? null,
    verification: result.verification ?? null
  }
}

async function loadBooking(event: H3Event, bookingId: string): Promise<BookingRow | null> {
  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase
    .from('bookings')
    .select('id,user_id,status,start_time,end_time,guest_name,guest_email,booking_rate_kind')
    .eq('id', bookingId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as BookingRow | null) ?? null
}

async function insertJobs(event: H3Event, jobs: Array<{
  jobType: LockAccessJobType
  bookingId?: string | null
  userId?: string | null
  runAtIso: string
  payload?: Record<string, unknown>
}>) {
  if (!jobs.length) return 0

  const supabase = serverSupabaseServiceRole(event)
  const nowIso = new Date().toISOString()

  const { error } = await supabase
    .from('lock_access_jobs')
    .insert(jobs.map(job => ({
      job_type: job.jobType,
      booking_id: job.bookingId ?? null,
      user_id: job.userId ?? null,
      run_at: job.runAtIso,
      status: 'pending',
      attempts: 0,
      max_attempts: DEFAULT_MAX_ATTEMPTS,
      payload: sanitizeForJSON(job.payload ?? {}) ?? {},
      created_at: nowIso,
      updated_at: nowIso
    })))

  if (error) throw new Error(error.message)
  return jobs.length
}

function randomPinCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

async function hasPinCollision(event: H3Event, pinCode: string, excludeBookingId?: string | null) {
  const supabase = serverSupabaseServiceRole(event)

  let guestQuery = supabase
    .from('booking_access_codes')
    .select('id')
    .eq('pin_code', pinCode)
    .in('status', ['scheduled', 'active'])
    .limit(1)

  if (excludeBookingId) {
    guestQuery = guestQuery.neq('booking_id', excludeBookingId)
  }

  const [
    { data: memberCollision, error: memberErr },
    { data: guestCollision, error: guestErr },
    { data: permanentCollision, error: permanentErr }
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id')
      .eq('door_code', pinCode)
      .limit(1),
    guestQuery,
    supabase
      .from('lock_permanent_codes')
      .select('id')
      .eq('code', pinCode)
      .eq('active', true)
      .limit(1)
  ])

  if (memberErr) throw new Error(memberErr.message)
  if (guestErr) throw new Error(guestErr.message)
  if (permanentErr) throw new Error(permanentErr.message)

  return (memberCollision?.length ?? 0) > 0
    || (guestCollision?.length ?? 0) > 0
    || (permanentCollision?.length ?? 0) > 0
}

async function createUniqueGuestPin(event: H3Event) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const next = randomPinCode()
    const hasCollision = await hasPinCollision(event, next)
    if (!hasCollision) return next
  }

  throw new Error('Could not generate a unique guest PIN')
}

export async function upsertGuestAccessCode(event: H3Event, params: {
  bookingId: string
  pinCode?: string | null
  source?: string
}) {
  const supabase = serverSupabaseServiceRole(event)
  const nowIso = new Date().toISOString()
  const booking = await loadBooking(event, params.bookingId)
  if (!booking) throw new Error('Booking not found')
  if (booking.user_id) throw new Error('Temporary access codes require a guest booking')

  const { activateAtIso, deactivateAtIso } = computeAccessWindow(booking.start_time, booking.end_time)

  if (!activateAtIso || !deactivateAtIso) {
    throw new Error('Could not compute booking access window')
  }

  const { data: existing, error: readErr } = await supabase
    .from('booking_access_codes')
    .select('id,pin_code,status,slot_assignment_id,metadata')
    .eq('booking_id', booking.id)
    .eq('code_type', 'guest')
    .maybeSingle()

  if (readErr) throw new Error(readErr.message)

  const requestedPin = typeof params.pinCode === 'string' ? params.pinCode.trim() : ''
  if (requestedPin && !/^\d{6}$/.test(requestedPin)) {
    throw new Error('Code must be exactly 6 digits')
  }

  const existingPin = typeof existing?.pin_code === 'string' ? existing.pin_code : ''
  const existingStatus = String(existing?.status ?? '').toLowerCase()
  const canReuseExisting = existingPin && ['scheduled', 'active'].includes(existingStatus)
  const pinCode = requestedPin || (canReuseExisting ? existingPin : await createUniqueGuestPin(event))

  if (pinCode !== existingPin && await hasPinCollision(event, pinCode, booking.id)) {
    throw new Error('Code is already assigned to another active or scheduled account')
  }

  if (existingStatus === 'active' && existingPin && pinCode !== existingPin) {
    throw new Error('Active access codes must be revoked before changing the PIN')
  }

  const metadata = {
    ...normalizePayload(existing?.metadata),
    source: params.source ?? 'booking_sync',
    prepared_at: nowIso
  }

  if (existing?.id) {
    const { data: updated, error: updateErr } = await supabase
      .from('booking_access_codes')
      .update({
        pin_code: pinCode,
        valid_from: activateAtIso,
        valid_until: deactivateAtIso,
        status: existingStatus === 'active' ? 'active' : 'scheduled',
        slot_assignment_id: existingStatus === 'active' ? existing.slot_assignment_id : null,
        metadata,
        updated_at: nowIso
      })
      .eq('id', existing.id)
      .select('id,pin_code,valid_from,valid_until')
      .single()

    if (updateErr || !updated) throw new Error(updateErr?.message ?? 'Failed to update guest access code')

    return {
      id: String(updated.id),
      pinCode: String(updated.pin_code),
      validFrom: String(updated.valid_from),
      validUntil: String(updated.valid_until)
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('booking_access_codes')
    .insert({
      booking_id: booking.id,
      code_type: 'guest',
      pin_code: pinCode,
      valid_from: activateAtIso,
      valid_until: deactivateAtIso,
      status: 'scheduled',
      metadata,
      created_at: nowIso,
      updated_at: nowIso
    })
    .select('id,pin_code,valid_from,valid_until')
    .single()

  if (insertErr || !inserted) throw new Error(insertErr?.message ?? 'Failed to create guest access code')

  return {
    id: String(inserted.id),
    pinCode: String(inserted.pin_code),
    validFrom: String(inserted.valid_from),
    validUntil: String(inserted.valid_until)
  }
}

async function ensureGuestAccessCode(event: H3Event, booking: BookingRow) {
  return upsertGuestAccessCode(event, {
    bookingId: booking.id,
    source: 'booking_sync'
  })
}

async function clearGuestAccessCode(event: H3Event, bookingId: string, status: 'expired' | 'revoked') {
  const supabase = serverSupabaseServiceRole(event)
  const nowIso = new Date().toISOString()

  const { error } = await supabase
    .from('booking_access_codes')
    .update({
      status,
      pin_code: null,
      updated_at: nowIso,
      metadata: {
        cleared_at: nowIso,
        cleared_status: status
      }
    })
    .eq('booking_id', bookingId)
    .eq('code_type', 'guest')

  if (error) throw new Error(error.message)
}

async function deletePendingBookingJobs(event: H3Event, bookingId: string) {
  const supabase = serverSupabaseServiceRole(event)
  const { error } = await supabase
    .from('lock_access_jobs')
    .delete()
    .eq('booking_id', bookingId)
    .eq('status', 'pending')

  if (error) throw new Error(error.message)
}

export async function enqueueBookingAccessSync(event: H3Event, params: {
  bookingId: string
  reason?: string
}) {
  const booking = await loadBooking(event, params.bookingId)
  if (!booking) {
    throw new Error('Booking not found')
  }

  const now = DateTime.now().setZone(STUDIO_TZ)
  const nowIso = now.toUTC().toISO()
  if (!nowIso) throw new Error('Could not compute current time')

  await deletePendingBookingJobs(event, booking.id)

  const isGuest = !booking.user_id
  const isEligible = isAccessEligibleBookingStatus(booking.status)

  if (!isEligible) {
    const jobType: LockAccessJobType = isGuest ? 'deactivate_guest_window' : 'deactivate_member_window'
    await insertJobs(event, [{
      jobType,
      bookingId: booking.id,
      userId: booking.user_id,
      runAtIso: nowIso,
      payload: {
        reason: params.reason ?? 'status_not_eligible'
      }
    }])

    if (isGuest) {
      await clearGuestAccessCode(event, booking.id, 'revoked').catch((error) => {
        console.warn('[access/jobs] failed to revoke guest PIN during enqueue', booking.id, (error as Error)?.message ?? String(error))
      })
    }

    return {
      bookingId: booking.id,
      queued: 1,
      isGuest,
      status: booking.status
    }
  }

  const { activateAtIso, deactivateAtIso, activateAt, deactivateAt } = computeAccessWindow(booking.start_time, booking.end_time)
  if (!activateAtIso || !deactivateAtIso) {
    throw new Error('Could not compute access window')
  }

  const endPolicy = await loadBookingEndAutomationPolicy(event)
  const bookingEnd = DateTime.fromISO(booking.end_time, { setZone: true }).setZone(STUDIO_TZ)
  const {
    reminderAt,
    reminderAtIso,
    armAtIso
  } = computeBookingEndJobTimes(booking.end_time, endPolicy)
  if (!bookingEnd.isValid || !reminderAtIso || !armAtIso) {
    throw new Error('Could not compute booking-end automation times')
  }

  if (deactivateAt <= now) {
    const jobType: LockAccessJobType = isGuest ? 'deactivate_guest_window' : 'deactivate_member_window'
    await insertJobs(event, [{
      jobType,
      bookingId: booking.id,
      userId: booking.user_id,
      runAtIso: nowIso,
      payload: {
        reason: params.reason ?? 'window_already_ended'
      }
    }])

    if (isGuest) {
      await clearGuestAccessCode(event, booking.id, 'expired').catch((error) => {
        console.warn('[access/jobs] failed to expire guest PIN during enqueue', booking.id, (error as Error)?.message ?? String(error))
      })
    }

    return {
      bookingId: booking.id,
      queued: 1,
      isGuest,
      status: booking.status
    }
  }

  if (isGuest) {
    await ensureGuestAccessCode(event, booking)
  }

  const activateRunAtIso = activateAt <= now ? nowIso : activateAtIso
  const shouldQueueEndingReminder = Boolean(booking.user_id)
    && String(booking.booking_rate_kind ?? 'standard').toLowerCase() !== 'standby'
    && bookingEnd > now
  const shouldQueueArmAway = shouldScheduleAbodeArmAfterBookingEnd(booking.end_time, {
    earlyHour: endPolicy.earlyHour,
    lateHour: endPolicy.lateHour
  })
  const reminderRunAtIso = reminderAt <= now ? nowIso : reminderAtIso

  let activeGuestCodeNeedsPause = false
  if (isGuest && activateAt > now) {
    const supabase = serverSupabaseServiceRole(event)
    const { data: activeCode, error: activeCodeError } = await supabase
      .from('booking_access_codes')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('code_type', 'guest')
      .eq('status', 'active')
      .maybeSingle()

    if (activeCodeError) throw new Error(activeCodeError.message)
    activeGuestCodeNeedsPause = Boolean(activeCode?.id)
  }

  const queued = await insertJobs(event, [
    ...(activeGuestCodeNeedsPause
      ? [{
          jobType: 'deactivate_guest_window' as const,
          bookingId: booking.id,
          userId: null,
          runAtIso: nowIso,
          payload: {
            reason: 'guest_window_rescheduled_to_future',
            preserve_code: true
          }
        }]
      : []),
    {
      jobType: isGuest ? 'activate_guest_window' : 'activate_member_window',
      bookingId: booking.id,
      userId: booking.user_id,
      runAtIso: activateRunAtIso,
      payload: {
        reason: params.reason ?? 'booking_sync'
      }
    },
    {
      jobType: isGuest ? 'deactivate_guest_window' : 'deactivate_member_window',
      bookingId: booking.id,
      userId: booking.user_id,
      runAtIso: deactivateAtIso,
      payload: {
        reason: params.reason ?? 'booking_sync'
      }
    },
    ...(shouldQueueEndingReminder
      ? [{
          jobType: 'send_booking_ending_reminder' as const,
          bookingId: booking.id,
          userId: booking.user_id,
          runAtIso: reminderRunAtIso,
          payload: {
            reason: params.reason ?? 'booking_sync',
            expected_end_time: booking.end_time,
            reminder_minutes: endPolicy.reminderMinutes
          }
        }]
      : []),
    ...(shouldQueueArmAway
      ? [{
          jobType: 'arm_after_booking_end' as const,
          bookingId: booking.id,
          userId: booking.user_id,
          runAtIso: armAtIso,
          payload: {
            reason: params.reason ?? 'booking_sync',
            expected_end_time: booking.end_time,
            arm_delay_minutes: endPolicy.armDelayMinutes,
            early_hour: endPolicy.earlyHour,
            late_hour: endPolicy.lateHour
          }
        }]
      : [])
  ])

  return {
    bookingId: booking.id,
    queued,
    isGuest,
    status: booking.status,
    activateAt: activateRunAtIso,
    deactivateAt: deactivateAtIso,
    reminderAt: shouldQueueEndingReminder ? reminderRunAtIso : null,
    armAt: shouldQueueArmAway ? armAtIso : null
  }
}

export async function enqueueMemberActiveRefresh(event: H3Event, params: {
  userId: string
  reason?: string
}) {
  const nowIso = new Date().toISOString()
  const queued = await insertJobs(event, [{
    jobType: 'refresh_member_active',
    userId: params.userId,
    runAtIso: nowIso,
    payload: {
      reason: params.reason ?? 'manual_refresh'
    }
  }])

  return {
    userId: params.userId,
    queued
  }
}

async function hasAnotherActiveMemberWindowNow(event: H3Event, params: {
  userId: string
  excludeBookingId?: string | null
}) {
  const supabase = serverSupabaseServiceRole(event)
  const now = DateTime.now().setZone(STUDIO_TZ)
  const startsBeforeIso = now.plus({ minutes: 30 }).toUTC().toISO()
  const endsAfterIso = now.minus({ minutes: 30 }).toUTC().toISO()

  if (!startsBeforeIso || !endsAfterIso) return false

  let query = supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', params.userId)
    .in('status', ['confirmed', 'requested'])
    .lte('start_time', startsBeforeIso)
    .gte('end_time', endsAfterIso)

  if (params.excludeBookingId) {
    query = query.neq('id', params.excludeBookingId)
  }

  const { count, error } = await query
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

async function hasAnotherActiveBookingWindowNow(event: H3Event, excludeBookingId?: string | null) {
  const supabase = serverSupabaseServiceRole(event)
  const now = DateTime.now().setZone(STUDIO_TZ)
  const startsBeforeIso = now.plus({ minutes: 30 }).toUTC().toISO()
  const endsAfterIso = now.minus({ minutes: 30 }).toUTC().toISO()

  if (!startsBeforeIso || !endsAfterIso) return false

  let query = supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .in('status', ['confirmed', 'requested'])
    .lte('start_time', startsBeforeIso)
    .gte('end_time', endsAfterIso)

  if (excludeBookingId) {
    query = query.neq('id', excludeBookingId)
  }

  const { count, error } = await query
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

async function listActiveMemberWindowBookings(event: H3Event, userId: string) {
  const supabase = serverSupabaseServiceRole(event)
  const now = DateTime.now().setZone(STUDIO_TZ)
  const startsBeforeIso = now.plus({ minutes: 30 }).toUTC().toISO()
  const endsAfterIso = now.minus({ minutes: 30 }).toUTC().toISO()

  if (!startsBeforeIso || !endsAfterIso) return [] as BookingRow[]

  const { data, error } = await supabase
    .from('bookings')
    .select('id,user_id,status,start_time,end_time,guest_name,guest_email,booking_rate_kind')
    .eq('user_id', userId)
    .in('status', ['confirmed', 'requested'])
    .lte('start_time', startsBeforeIso)
    .gte('end_time', endsAfterIso)
    .order('start_time', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as BookingRow[]
}

async function triggerAbodeArmAwayAfterBookingEnd(event: H3Event, params: {
  bookingId?: string | null
  userId?: string | null
  slotNumber?: number | null
}) {
  if (!isOutsideAbodeArmingGap()) {
    return {
      skipped: 'inside_daytime_gap'
    }
  }

  if (await hasAnotherActiveBookingWindowNow(event, params.bookingId)) {
    return {
      skipped: 'another_active_booking_window_exists'
    }
  }

  const result = await sendAbodeAutomationEvent(event, {
    eventType: 'booking_window_end_arm_away',
    bookingId: params.bookingId ?? null,
    userId: params.userId ?? null,
    lockSlot: params.slotNumber ?? null,
    occurredAt: new Date().toISOString()
  })

  return result
}

function timestampsMatch(left: unknown, right: string) {
  if (typeof left !== 'string' || !left.trim()) return false
  const leftTime = DateTime.fromISO(left, { setZone: true })
  const rightTime = DateTime.fromISO(right, { setZone: true })
  return leftTime.isValid && rightTime.isValid && leftTime.toMillis() === rightTime.toMillis()
}

async function triggerAbodeDisarmForWindowStart(event: H3Event, params: {
  bookingId?: string | null
  userId?: string | null
  slotNumber?: number | null
}) {
  if (!isOutsideAbodeArmingGap()) {
    return {
      skipped: 'inside_daytime_gap'
    }
  }

  return sendAbodeAutomationEvent(event, {
    eventType: 'unlock_disarm_home',
    bookingId: params.bookingId ?? null,
    userId: params.userId ?? null,
    lockSlot: params.slotNumber ?? null,
    occurredAt: new Date().toISOString()
  })
}

function incidentTypeForJob(jobType: LockAccessJobType) {
  if (jobType === 'arm_after_booking_end') return 'abode_automation_failure'
  if (jobType === 'send_booking_ending_reminder') return 'booking_reminder_failure'
  return 'lock_sync_failure'
}

async function markJobSucceeded(event: H3Event, job: JobRow, response: Record<string, unknown>) {
  const supabase = serverSupabaseServiceRole(event)
  const nowIso = new Date().toISOString()

  const { error } = await supabase
    .from('lock_access_jobs')
    .update({
      status: 'succeeded',
      last_error: null,
      last_response: sanitizeForJSON(response) ?? null,
      processed_at: nowIso,
      updated_at: nowIso
    })
    .eq('id', job.id)

  if (error) throw new Error(error.message)

  const { error: incidentError } = await supabase
    .from('lock_access_incidents')
    .update({
      status: 'resolved',
      resolved_at: nowIso,
      updated_at: nowIso
    })
    .eq('incident_type', incidentTypeForJob(job.job_type))
    .eq('status', 'open')
    .contains('metadata', { jobId: job.id })

  if (incidentError) {
    console.warn('[access/jobs] failed to resolve recovered job incidents', {
      jobId: job.id,
      error: incidentError.message
    })
  }
}

async function shouldAutomaticallyRecoverJob(event: H3Event, job: JobRow) {
  if (job.job_type === 'refresh_member_active') {
    if (!job.user_id) return false
    const activeBookings = await listActiveMemberWindowBookings(event, job.user_id)
    if (activeBookings.length > 0) return true
    return Boolean((await getActiveMemberSlot(event, job.user_id))?.slot_number)
  }

  if (!job.booking_id) return false
  const booking = await loadBooking(event, job.booking_id)
  if (!booking) return false

  if (job.job_type === 'activate_member_window' || job.job_type === 'activate_guest_window') {
    return isAccessEligibleBookingStatus(booking.status) && isInsideAccessWindow(booking.start_time, booking.end_time)
  }

  if (job.job_type === 'deactivate_member_window' || job.job_type === 'deactivate_guest_window') {
    if (!isAccessEligibleBookingStatus(booking.status)) return true
    const { deactivateAt } = computeAccessWindow(booking.start_time, booking.end_time)
    return deactivateAt <= DateTime.now().setZone(STUDIO_TZ)
  }

  if (job.job_type === 'arm_after_booking_end') {
    if (!timestampsMatch(job.payload?.expected_end_time, booking.end_time)) return false
    return isAccessEligibleBookingStatus(booking.status)
  }

  return false
}

async function recoverDeadAccessJobs(event: H3Event, limit: number) {
  const supabase = serverSupabaseServiceRole(event)
  const now = DateTime.now().setZone(STUDIO_TZ)
  const nowIso = now.toUTC().toISO()
  const cutoffIso = now.minus({ minutes: AUTO_RECOVERY_COOLDOWN_MINUTES }).toUTC().toISO()
  if (!nowIso || !cutoffIso) throw new Error('Could not compute access recovery timestamp')

  const { data: rows, error } = await supabase
    .from('lock_access_jobs')
    .select('id,job_type,status,booking_id,user_id,run_at,attempts,max_attempts,payload')
    .eq('status', 'dead')
    .lte('updated_at', cutoffIso)
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, Math.min(50, limit)))

  if (error) throw new Error(error.message)
  if (!rows?.length) {
    return { checked: 0, recovered: 0, providerHealthy: null as boolean | null }
  }

  const candidates: Array<{ job: JobRow, recoveryCount: number }> = []
  for (const row of rows) {
    const job = {
      ...row,
      payload: normalizePayload(row.payload)
    } as JobRow
    const recoveryCount = readAutoRecoveryCount(job.payload)
    if (recoveryCount >= MAX_AUTO_RECOVERIES) continue
    if (await shouldAutomaticallyRecoverJob(event, job)) {
      candidates.push({ job, recoveryCount })
    }
  }

  if (!candidates.length) {
    return { checked: rows.length, recovered: 0, providerHealthy: null as boolean | null }
  }

  const provider = await getLockProviderHealth(event)
  if (!provider.ok) {
    return {
      checked: rows.length,
      recovered: 0,
      providerHealthy: false,
      providerState: provider.state,
      reason: provider.reason ?? 'Lock provider is unavailable'
    }
  }

  let recovered = 0
  for (const { job, recoveryCount } of candidates) {
    const payload = {
      ...normalizePayload(job.payload),
      automaticRecovery: {
        count: recoveryCount + 1,
        recoveredAt: nowIso,
        reason: 'provider_healthy_after_dead_job'
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('lock_access_jobs')
      .update({
        status: 'pending',
        attempts: 0,
        run_at: nowIso,
        processed_at: null,
        last_error: null,
        last_response: null,
        payload: sanitizeForJSON(payload) ?? {},
        updated_at: nowIso
      })
      .eq('id', job.id)
      .eq('status', 'dead')
      .select('id')
      .maybeSingle()

    if (updateError) throw new Error(updateError.message)
    if (updated) recovered += 1
  }

  return {
    checked: rows.length,
    recovered,
    providerHealthy: true,
    providerState: provider.state
  }
}

async function markJobRetryOrDead(event: H3Event, params: {
  job: JobRow
  attempts: number
  errorMessage: string
  scheduleSeconds: number[]
}) {
  const supabase = serverSupabaseServiceRole(event)
  const now = DateTime.now().setZone(STUDIO_TZ)
  const nowIso = now.toUTC().toISO()
  if (!nowIso) throw new Error('Could not compute retry timestamp')

  const maxAttempts = Math.max(1, Number(params.job.max_attempts ?? DEFAULT_MAX_ATTEMPTS))
  const isDead = params.attempts >= maxAttempts

  const patch: Record<string, unknown> = {
    status: isDead ? 'dead' : 'pending',
    last_error: params.errorMessage,
    processed_at: isDead ? nowIso : null,
    updated_at: nowIso
  }

  if (!isDead) {
    patch.run_at = nextRetryAtIso(now, params.scheduleSeconds, params.attempts)
  }

  const { error } = await supabase
    .from('lock_access_jobs')
    .update(patch)
    .eq('id', params.job.id)

  if (error) throw new Error(error.message)

  const shouldAlert = params.attempts === 1 || isDead
  if (shouldAlert) {
    const incidentType = incidentTypeForJob(params.job.job_type)
    const jobLabel = params.job.job_type === 'arm_after_booking_end'
      ? 'Abode booking-end arm job'
      : params.job.job_type === 'send_booking_ending_reminder'
        ? 'Booking ending reminder job'
        : 'Lock access job'
    await createAccessIncident(event, {
      incidentType,
      severity: isDead ? 'critical' : 'error',
      title: isDead
        ? `${jobLabel} failed permanently`
        : `${jobLabel} failed (retry scheduled)`,
      message: params.errorMessage,
      bookingId: params.job.booking_id,
      userId: params.job.user_id,
      metadata: {
        jobId: params.job.id,
        jobType: params.job.job_type,
        attempts: params.attempts,
        maxAttempts,
        nextRetryAt: isDead ? null : patch.run_at,
        payload: params.job.payload ?? {}
      }
    }).catch((incidentError) => {
      console.warn('[access/jobs] failed to create incident', {
        jobId: params.job.id,
        incidentError: (incidentError as Error)?.message ?? String(incidentError)
      })
    })
  }

  return {
    isDead,
    nextRunAt: isDead ? null : patch.run_at
  }
}

async function claimPendingJob(event: H3Event, jobId: number) {
  const supabase = serverSupabaseServiceRole(event)
  const nowIso = new Date().toISOString()

  const { data: pending, error: pendingErr } = await supabase
    .from('lock_access_jobs')
    .select('id,job_type,status,booking_id,user_id,run_at,attempts,max_attempts,payload')
    .eq('id', jobId)
    .eq('status', 'pending')
    .maybeSingle()

  if (pendingErr || !pending) return null

  const attempts = Number((pending as { attempts?: number }).attempts ?? 0) + 1

  const { data: claimed, error: claimErr } = await supabase
    .from('lock_access_jobs')
    .update({
      status: 'processing',
      attempts,
      updated_at: nowIso
    })
    .eq('id', jobId)
    .eq('status', 'pending')
    .eq('attempts', Number((pending as { attempts?: number }).attempts ?? 0))
    .select('id,job_type,status,booking_id,user_id,run_at,attempts,max_attempts,payload')
    .single()

  if (claimErr || !claimed) return null
  return claimed as unknown as JobRow
}

async function runActivateMemberJob(event: H3Event, job: JobRow) {
  if (!job.user_id) throw new Error('activate_member_window missing user_id')

  const activeBookings = await listActiveMemberWindowBookings(event, job.user_id)
  const targetBooking = job.booking_id
    ? activeBookings.find(row => row.id === job.booking_id)
    : activeBookings[0]

  if (!targetBooking) {
    return {
      ok: true,
      skipped: 'no_active_booking_window',
      userId: job.user_id
    }
  }

  const { customerId, doorCode } = await ensureDoorCodeForUser(event, {
    userId: job.user_id,
    email: targetBooking.guest_email ?? null
  })

  const slot = await allocateMemberSlot(event, job.user_id)
  const providerResult = await setLockUserCode(event, {
    slotNumber: slot.slotNumber,
    code: doorCode,
    kind: 'member',
    bookingId: targetBooking.id,
    userId: job.user_id
  })

  // The code becomes valid at the access-window lead time. Disarm then so the
  // customer's door-open action is never racing a remote alarm round trip.
  const abode = await triggerAbodeDisarmForWindowStart(event, {
    bookingId: targetBooking.id,
    userId: job.user_id,
    slotNumber: slot.slotNumber
  })

  return {
    ok: true,
    action: 'member_code_set',
    bookingId: targetBooking.id,
    userId: job.user_id,
    customerId,
    slotNumber: slot.slotNumber,
    provider: summarizeProviderResult(providerResult),
    abode
  }
}

async function runDeactivateMemberJob(event: H3Event, job: JobRow) {
  if (!job.user_id) throw new Error('deactivate_member_window missing user_id')

  const shouldKeepActive = await hasAnotherActiveMemberWindowNow(event, {
    userId: job.user_id,
    excludeBookingId: job.booking_id
  })

  if (shouldKeepActive) {
    return {
      ok: true,
      skipped: 'another_active_window_exists',
      userId: job.user_id
    }
  }

  const assignment = await getActiveMemberSlot(event, job.user_id)
  if (!assignment?.slot_number) {
    return {
      ok: true,
      skipped: 'member_slot_not_allocated',
      userId: job.user_id
    }
  }

  const providerResult = await clearLockUserCode(event, {
    slotNumber: Number(assignment.slot_number),
    kind: 'member',
    bookingId: job.booking_id,
    userId: job.user_id,
    reason: 'window_ended'
  })

  return {
    ok: true,
    action: 'member_code_cleared',
    bookingId: job.booking_id,
    userId: job.user_id,
    slotNumber: Number(assignment.slot_number),
    provider: summarizeProviderResult(providerResult)
  }
}

async function runActivateGuestJob(event: H3Event, job: JobRow) {
  if (!job.booking_id) throw new Error('activate_guest_window missing booking_id')

  const booking = await loadBooking(event, job.booking_id)
  if (!booking) {
    return {
      ok: true,
      skipped: 'booking_missing',
      bookingId: job.booking_id
    }
  }

  if (booking.user_id) {
    return {
      ok: true,
      skipped: 'not_guest_booking',
      bookingId: booking.id
    }
  }

  if (!isAccessEligibleBookingStatus(booking.status)) {
    return {
      ok: true,
      skipped: 'booking_not_access_eligible',
      bookingId: booking.id,
      status: booking.status
    }
  }

  const accessCode = await ensureGuestAccessCode(event, booking)
  const slot = await allocateGuestSlot(event, booking.id)

  const providerResult = await setLockUserCode(event, {
    slotNumber: slot.slotNumber,
    code: accessCode.pinCode,
    kind: 'guest',
    bookingId: booking.id,
    userId: null,
    validFrom: accessCode.validFrom,
    validUntil: accessCode.validUntil
  })

  const supabase = serverSupabaseServiceRole(event)
  const nowIso = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('booking_access_codes')
    .update({
      status: 'active',
      slot_assignment_id: slot.assignmentId,
      updated_at: nowIso
    })
    .eq('id', accessCode.id)

  if (updateErr) throw new Error(updateErr.message)

  const abode = await triggerAbodeDisarmForWindowStart(event, {
    bookingId: booking.id,
    slotNumber: slot.slotNumber
  })

  return {
    ok: true,
    action: 'guest_code_set',
    bookingId: booking.id,
    slotNumber: slot.slotNumber,
    provider: summarizeProviderResult(providerResult),
    abode
  }
}

async function runDeactivateGuestJob(event: H3Event, job: JobRow) {
  if (!job.booking_id) throw new Error('deactivate_guest_window missing booking_id')

  const preserveCode = job.payload?.preserve_code === true
  const assignment = await getActiveGuestSlot(event, job.booking_id)

  if (assignment?.slot_number) {
    await clearLockUserCode(event, {
      slotNumber: Number(assignment.slot_number),
      kind: 'guest',
      bookingId: job.booking_id,
      reason: 'window_ended'
    })
  }

  await releaseGuestSlot(event, job.booking_id)
  if (preserveCode) {
    const supabase = serverSupabaseServiceRole(event)
    const { error: codeError } = await supabase
      .from('booking_access_codes')
      .update({
        status: 'scheduled',
        slot_assignment_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('booking_id', job.booking_id)
      .eq('code_type', 'guest')

    if (codeError) throw new Error(codeError.message)
  } else {
    await clearGuestAccessCode(event, job.booking_id, 'expired')
  }

  return {
    ok: true,
    action: preserveCode ? 'guest_code_paused_for_reschedule' : 'guest_code_cleared',
    bookingId: job.booking_id,
    slotNumber: assignment?.slot_number ? Number(assignment.slot_number) : null
  }
}

async function runBookingEndingReminderJob(event: H3Event, job: JobRow) {
  if (!job.booking_id) throw new Error('send_booking_ending_reminder missing booking_id')

  const booking = await loadBooking(event, job.booking_id)
  if (!booking) {
    return {
      ok: true,
      skipped: 'booking_missing',
      bookingId: job.booking_id
    }
  }

  if (!timestampsMatch(job.payload?.expected_end_time, booking.end_time)) {
    return {
      ok: true,
      skipped: 'booking_end_changed',
      bookingId: booking.id,
      expectedEndTime: job.payload?.expected_end_time ?? null,
      currentEndTime: booking.end_time
    }
  }

  return sendBookingEndingSoonReminderMail(event, {
    bookingId: booking.id,
    expectedEndTime: booking.end_time,
    reminderMinutes: boundedInteger(
      job.payload?.reminder_minutes,
      DEFAULT_BOOKING_END_REMINDER_MINUTES,
      1,
      180
    )
  })
}

async function runArmAfterBookingEndJob(event: H3Event, job: JobRow) {
  if (!job.booking_id) throw new Error('arm_after_booking_end missing booking_id')

  const booking = await loadBooking(event, job.booking_id)
  if (!booking) {
    return {
      ok: true,
      skipped: 'booking_missing',
      bookingId: job.booking_id
    }
  }

  if (!timestampsMatch(job.payload?.expected_end_time, booking.end_time)) {
    return {
      ok: true,
      skipped: 'booking_end_changed',
      bookingId: booking.id,
      expectedEndTime: job.payload?.expected_end_time ?? null,
      currentEndTime: booking.end_time
    }
  }

  if (!isAccessEligibleBookingStatus(booking.status)) {
    return {
      ok: true,
      skipped: 'booking_not_access_eligible',
      bookingId: booking.id,
      status: booking.status
    }
  }

  const earlyHour = boundedInteger(
    job.payload?.early_hour,
    DEFAULT_ABODE_BOOKING_END_EARLY_HOUR,
    0,
    23
  )
  const lateHour = boundedInteger(
    job.payload?.late_hour,
    DEFAULT_ABODE_BOOKING_END_LATE_HOUR,
    0,
    23
  )
  if (!shouldScheduleAbodeArmAfterBookingEnd(booking.end_time, { earlyHour, lateHour })) {
    return {
      ok: true,
      skipped: 'booking_end_inside_no_arm_hours',
      bookingId: booking.id
    }
  }

  const armDelayMinutes = boundedInteger(
    job.payload?.arm_delay_minutes,
    DEFAULT_ABODE_BOOKING_END_ARM_DELAY_MINUTES,
    0,
    240
  )
  const { armAt } = computeBookingEndJobTimes(booking.end_time, { armDelayMinutes })
  if (DateTime.now().setZone(STUDIO_TZ) < armAt) {
    throw new Error(`Booking-end arm job ran before its ${armDelayMinutes}-minute delay elapsed`)
  }

  const abode = await triggerAbodeArmAwayAfterBookingEnd(event, {
    bookingId: booking.id,
    userId: booking.user_id
  })

  return {
    ok: true,
    action: 'booking_end_arm_away',
    bookingId: booking.id,
    userId: booking.user_id,
    bookingEnd: booking.end_time,
    armDelayMinutes,
    abode
  }
}

async function runRefreshMemberActiveJob(event: H3Event, job: JobRow) {
  if (!job.user_id) throw new Error('refresh_member_active missing user_id')

  const activeBookings = await listActiveMemberWindowBookings(event, job.user_id)
  if (!activeBookings.length) {
    const assignment = await getActiveMemberSlot(event, job.user_id)
    if (!assignment?.slot_number) {
      return {
        ok: true,
        skipped: 'no_active_booking_window',
        userId: job.user_id
      }
    }

    const providerResult = await clearLockUserCode(event, {
      slotNumber: Number(assignment.slot_number),
      kind: 'member',
      userId: job.user_id,
      reason: 'refresh_no_active_window'
    })

    return {
      ok: true,
      action: 'member_code_cleared_inactive_refresh',
      userId: job.user_id,
      slotNumber: Number(assignment.slot_number),
      provider: summarizeProviderResult(providerResult)
    }
  }

  return runActivateMemberJob(event, {
    ...job,
    booking_id: activeBookings[0]?.id ?? job.booking_id
  })
}

async function executeJob(event: H3Event, job: JobRow) {
  switch (job.job_type) {
    case 'activate_member_window':
      return runActivateMemberJob(event, job)
    case 'deactivate_member_window':
      return runDeactivateMemberJob(event, job)
    case 'activate_guest_window':
      return runActivateGuestJob(event, job)
    case 'deactivate_guest_window':
      return runDeactivateGuestJob(event, job)
    case 'send_booking_ending_reminder':
      return runBookingEndingReminderJob(event, job)
    case 'arm_after_booking_end':
      return runArmAfterBookingEndJob(event, job)
    case 'refresh_member_active':
      return runRefreshMemberActiveJob(event, job)
    default:
      throw new Error(`Unsupported lock access job type: ${job.job_type}`)
  }
}

export async function processDueAccessJobs(event: H3Event, options?: { limit?: number }) {
  const enabled = await isLockSyncEnabled(event)
  const supabase = serverSupabaseServiceRole(event)
  const nowIso = new Date().toISOString()
  const limit = Math.max(1, Math.min(200, Number(options?.limit ?? 20)))
  const retrySchedule = await getRetryScheduleSeconds(event)
  const recovery = enabled
    ? await recoverDeadAccessJobs(event, limit)
    : { checked: 0, recovered: 0, providerHealthy: null as boolean | null }

  let dueQuery = supabase
    .from('lock_access_jobs')
    .select('id,job_type,status,booking_id,user_id,run_at,attempts,max_attempts,payload')
    .eq('status', 'pending')
    .lte('run_at', nowIso)
    .order('run_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit)

  // Booking reminders remain available during lock-provider maintenance. All
  // physical access and alarm jobs stay queued until lock sync is re-enabled.
  if (!enabled) {
    dueQuery = dueQuery.eq('job_type', 'send_booking_ending_reminder')
  }

  const { data: dueJobs, error: dueErr } = await dueQuery

  if (dueErr) throw new Error(dueErr.message)

  let succeeded = 0
  let failed = 0
  let dead = 0

  for (const row of dueJobs ?? []) {
    const claimed = await claimPendingJob(event, Number(row.id))
    if (!claimed) continue

    try {
      const response = await executeJob(event, {
        ...claimed,
        payload: normalizePayload(claimed.payload)
      })

      await markJobSucceeded(event, claimed, response)
      succeeded += 1
    } catch (error) {
      const attempts = Number(claimed.attempts ?? 1)
      const message = (error as Error)?.message ?? String(error)
      const result = await markJobRetryOrDead(event, {
        job: claimed,
        attempts,
        errorMessage: message,
        scheduleSeconds: retrySchedule
      })

      failed += 1
      if (result.isDead) dead += 1
    }
  }

  return {
    enabled,
    recovery,
    queued: dueJobs?.length ?? 0,
    processed: succeeded + failed,
    succeeded,
    failed,
    dead,
    ...(!enabled
      ? { message: 'LOCK_SYNC_ENABLED is false; only booking-ending reminder jobs are processed.' }
      : {})
  }
}
