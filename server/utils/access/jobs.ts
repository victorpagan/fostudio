import { randomInt } from 'node:crypto'
import { DateTime } from 'luxon'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { ensureDoorCodeForUser } from '~~/server/utils/membership/doorCode'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'
import { createAccessIncident } from '~~/server/utils/access/incidents'
import { computeAccessWindow, isAccessEligibleBookingStatus, isOutsideAbodeArmingGap } from '~~/server/utils/access/policy'
import { clearLockUserCode, isLockSyncEnabled, sendAbodeAutomationEvent, setLockUserCode } from '~~/server/utils/access/providers'
import {
  allocateGuestSlot,
  allocateMemberSlot,
  getActiveGuestSlot,
  getActiveMemberSlot,
  releaseGuestSlot
} from '~~/server/utils/access/slots'

const DEFAULT_RETRY_SCHEDULE_SECONDS = [0, 60, 300, 900]
const DEFAULT_MAX_ATTEMPTS = 4

type LockAccessJobType =
  | 'activate_member_window'
  | 'deactivate_member_window'
  | 'activate_guest_window'
  | 'deactivate_guest_window'
  | 'refresh_member_active'

type BookingRow = {
  id: string
  user_id: string | null
  status: string | null
  start_time: string
  end_time: string
  guest_name: string | null
  guest_email: string | null
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
  const supabase = serverSupabaseServiceRole(event) as any
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

function nextRetryAtIso(now: DateTime, scheduleSeconds: number[], attempts: number) {
  const idx = Math.min(Math.max(1, attempts), scheduleSeconds.length - 1)
  const delaySeconds = scheduleSeconds[idx] ?? scheduleSeconds[scheduleSeconds.length - 1] ?? 60
  return now.plus({ seconds: delaySeconds }).toUTC().toISO()
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  return payload as Record<string, unknown>
}

async function loadBooking(event: H3Event, bookingId: string): Promise<BookingRow | null> {
  const supabase = serverSupabaseServiceRole(event) as any
  const { data, error } = await supabase
    .from('bookings')
    .select('id,user_id,status,start_time,end_time,guest_name,guest_email')
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

  const supabase = serverSupabaseServiceRole(event) as any
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
      payload: job.payload ?? {},
      created_at: nowIso,
      updated_at: nowIso
    })))

  if (error) throw new Error(error.message)
  return jobs.length
}

function randomPinCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

async function hasPinCollision(event: H3Event, pinCode: string) {
  const supabase = serverSupabaseServiceRole(event) as any

  const [{ data: memberCollision, error: memberErr }, { data: guestCollision, error: guestErr }] = await Promise.all([
    supabase
      .from('customers')
      .select('id')
      .eq('door_code', pinCode)
      .limit(1),
    supabase
      .from('booking_access_codes')
      .select('id')
      .eq('pin_code', pinCode)
      .in('status', ['scheduled', 'active'])
      .limit(1)
  ])

  if (memberErr) throw new Error(memberErr.message)
  if (guestErr) throw new Error(guestErr.message)

  return (memberCollision?.length ?? 0) > 0 || (guestCollision?.length ?? 0) > 0
}

async function createUniqueGuestPin(event: H3Event) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const next = randomPinCode()
    const hasCollision = await hasPinCollision(event, next)
    if (!hasCollision) return next
  }

  throw new Error('Could not generate a unique guest PIN')
}

async function ensureGuestAccessCode(event: H3Event, booking: BookingRow) {
  const supabase = serverSupabaseServiceRole(event) as any
  const nowIso = new Date().toISOString()

  const { activateAtIso, deactivateAtIso } = computeAccessWindow(booking.start_time, booking.end_time)

  if (!activateAtIso || !deactivateAtIso) {
    throw new Error('Could not compute booking access window')
  }

  const { data: existing, error: readErr } = await supabase
    .from('booking_access_codes')
    .select('id,pin_code,status')
    .eq('booking_id', booking.id)
    .eq('code_type', 'guest')
    .maybeSingle()

  if (readErr) throw new Error(readErr.message)

  if (existing?.pin_code && ['scheduled', 'active'].includes(String(existing.status ?? '').toLowerCase())) {
    const { error: updateErr } = await supabase
      .from('booking_access_codes')
      .update({
        valid_from: activateAtIso,
        valid_until: deactivateAtIso,
        updated_at: nowIso
      })
      .eq('id', existing.id)

    if (updateErr) throw new Error(updateErr.message)

    return {
      id: String(existing.id),
      pinCode: String(existing.pin_code),
      validFrom: activateAtIso,
      validUntil: deactivateAtIso
    }
  }

  const pinCode = await createUniqueGuestPin(event)

  if (existing?.id) {
    const { data: updated, error: updateErr } = await supabase
      .from('booking_access_codes')
      .update({
        pin_code: pinCode,
        valid_from: activateAtIso,
        valid_until: deactivateAtIso,
        status: 'scheduled',
        slot_assignment_id: null,
        metadata: {
          regenerated_at: nowIso
        },
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
      metadata: {
        source: 'booking_sync'
      },
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

async function clearGuestAccessCode(event: H3Event, bookingId: string, status: 'expired' | 'revoked') {
  const supabase = serverSupabaseServiceRole(event) as any
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
  const supabase = serverSupabaseServiceRole(event) as any
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

  const queued = await insertJobs(event, [
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
    }
  ])

  return {
    bookingId: booking.id,
    queued,
    isGuest,
    status: booking.status,
    activateAt: activateRunAtIso,
    deactivateAt: deactivateAtIso
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
  const supabase = serverSupabaseServiceRole(event) as any
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

async function listActiveMemberWindowBookings(event: H3Event, userId: string) {
  const supabase = serverSupabaseServiceRole(event) as any
  const now = DateTime.now().setZone(STUDIO_TZ)
  const startsBeforeIso = now.plus({ minutes: 30 }).toUTC().toISO()
  const endsAfterIso = now.minus({ minutes: 30 }).toUTC().toISO()

  if (!startsBeforeIso || !endsAfterIso) return [] as BookingRow[]

  const { data, error } = await supabase
    .from('bookings')
    .select('id,user_id,status,start_time,end_time,guest_name,guest_email')
    .eq('user_id', userId)
    .in('status', ['confirmed', 'requested'])
    .lte('start_time', startsBeforeIso)
    .gte('end_time', endsAfterIso)
    .order('start_time', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as BookingRow[]
}

async function triggerAbodeArmAwayForWindowEnd(event: H3Event, params: {
  bookingId?: string | null
  userId?: string | null
  slotNumber?: number | null
}) {
  if (!isOutsideAbodeArmingGap()) {
    return {
      skipped: 'inside_daytime_gap'
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

async function markJobSucceeded(event: H3Event, jobId: number, response: Record<string, unknown>) {
  const supabase = serverSupabaseServiceRole(event) as any
  const nowIso = new Date().toISOString()

  const { error } = await supabase
    .from('lock_access_jobs')
    .update({
      status: 'succeeded',
      last_response: response,
      processed_at: nowIso,
      updated_at: nowIso
    })
    .eq('id', jobId)

  if (error) throw new Error(error.message)
}

async function markJobRetryOrDead(event: H3Event, params: {
  job: JobRow
  attempts: number
  errorMessage: string
  scheduleSeconds: number[]
}) {
  const supabase = serverSupabaseServiceRole(event) as any
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
    await createAccessIncident(event, {
      incidentType: 'lock_sync_failure',
      severity: isDead ? 'critical' : 'error',
      title: isDead
        ? 'Lock access job failed permanently'
        : 'Lock access job failed (retry scheduled)',
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
  const supabase = serverSupabaseServiceRole(event) as any
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

  return {
    ok: true,
    action: 'member_code_set',
    bookingId: targetBooking.id,
    userId: job.user_id,
    customerId,
    slotNumber: slot.slotNumber,
    provider: providerResult.body ?? null
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

  const abode = await triggerAbodeArmAwayForWindowEnd(event, {
    bookingId: job.booking_id,
    userId: job.user_id,
    slotNumber: Number(assignment.slot_number)
  }).catch(async (error) => {
    const message = (error as Error)?.message ?? String(error)
    await createAccessIncident(event, {
      incidentType: 'abode_automation_failure',
      severity: 'error',
      title: 'Abode arm-away automation failed',
      message,
      bookingId: job.booking_id,
      userId: job.user_id,
      metadata: {
        source: 'member_window_end',
        slotNumber: Number(assignment.slot_number)
      }
    }).catch(() => {})

    return {
      ok: false,
      error: message
    }
  })

  return {
    ok: true,
    action: 'member_code_cleared',
    bookingId: job.booking_id,
    userId: job.user_id,
    slotNumber: Number(assignment.slot_number),
    provider: providerResult.body ?? null,
    abode
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

  const supabase = serverSupabaseServiceRole(event) as any
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

  return {
    ok: true,
    action: 'guest_code_set',
    bookingId: booking.id,
    slotNumber: slot.slotNumber,
    provider: providerResult.body ?? null
  }
}

async function runDeactivateGuestJob(event: H3Event, job: JobRow) {
  if (!job.booking_id) throw new Error('deactivate_guest_window missing booking_id')

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
  await clearGuestAccessCode(event, job.booking_id, 'expired')

  const abode = await triggerAbodeArmAwayForWindowEnd(event, {
    bookingId: job.booking_id,
    slotNumber: assignment?.slot_number ? Number(assignment.slot_number) : null
  }).catch(async (error) => {
    const message = (error as Error)?.message ?? String(error)
    await createAccessIncident(event, {
      incidentType: 'abode_automation_failure',
      severity: 'error',
      title: 'Abode arm-away automation failed',
      message,
      bookingId: job.booking_id,
      metadata: {
        source: 'guest_window_end',
        slotNumber: assignment?.slot_number ? Number(assignment.slot_number) : null
      }
    }).catch(() => {})

    return {
      ok: false,
      error: message
    }
  })

  return {
    ok: true,
    action: 'guest_code_cleared',
    bookingId: job.booking_id,
    slotNumber: assignment?.slot_number ? Number(assignment.slot_number) : null,
    abode
  }
}

async function runRefreshMemberActiveJob(event: H3Event, job: JobRow) {
  if (!job.user_id) throw new Error('refresh_member_active missing user_id')

  const activeBookings = await listActiveMemberWindowBookings(event, job.user_id)
  if (!activeBookings.length) {
    return {
      ok: true,
      skipped: 'no_active_booking_window',
      userId: job.user_id
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
    case 'refresh_member_active':
      return runRefreshMemberActiveJob(event, job)
    default:
      throw new Error(`Unsupported lock access job type: ${job.job_type}`)
  }
}

export async function processDueAccessJobs(event: H3Event, options?: { limit?: number }) {
  const enabled = await isLockSyncEnabled(event)
  if (!enabled) {
    return {
      enabled: false,
      queued: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      dead: 0,
      message: 'LOCK_SYNC_ENABLED is false; queue is not processed.'
    }
  }

  const supabase = serverSupabaseServiceRole(event) as any
  const nowIso = new Date().toISOString()
  const limit = Math.max(1, Math.min(200, Number(options?.limit ?? 20)))
  const retrySchedule = await getRetryScheduleSeconds(event)

  const { data: dueJobs, error: dueErr } = await supabase
    .from('lock_access_jobs')
    .select('id,job_type,status,booking_id,user_id,run_at,attempts,max_attempts,payload')
    .eq('status', 'pending')
    .lte('run_at', nowIso)
    .order('run_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit)

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

      await markJobSucceeded(event, claimed.id, response)
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
    enabled: true,
    queued: dueJobs?.length ?? 0,
    processed: succeeded + failed,
    succeeded,
    failed,
    dead
  }
}
