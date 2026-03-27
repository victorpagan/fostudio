import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { getServerConfigMap } from '~~/server/utils/config/secret'

type SlotRange = {
  memberStart: number
  memberEnd: number
  guestStart: number
  guestEnd: number
}

function normalizeRange(input: unknown, fallback: number, min: number, max: number) {
  const n = Number(input)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function isUniqueViolation(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code
  return code === '23505'
}

async function getReservedPermanentSlots(event: H3Event) {
  const supabase = serverSupabaseServiceRole(event) as any
  const { data, error } = await supabase
    .from('lock_permanent_codes')
    .select('slot_number')
    .eq('active', true)

  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((row: any) => Number(row.slot_number)))
}

export async function getLockSlotRanges(event: H3Event): Promise<SlotRange> {
  const config = await getServerConfigMap(event, [
    'LOCK_MEMBER_SLOT_START',
    'LOCK_MEMBER_SLOT_END',
    'LOCK_GUEST_SLOT_START',
    'LOCK_GUEST_SLOT_END'
  ])

  let memberStart = normalizeRange(config.LOCK_MEMBER_SLOT_START, 1, 1, 99)
  let memberEnd = normalizeRange(config.LOCK_MEMBER_SLOT_END, 49, 1, 99)
  let guestStart = normalizeRange(config.LOCK_GUEST_SLOT_START, 50, 1, 99)
  let guestEnd = normalizeRange(config.LOCK_GUEST_SLOT_END, 99, 1, 99)

  if (memberStart > memberEnd) [memberStart, memberEnd] = [memberEnd, memberStart]
  if (guestStart > guestEnd) [guestStart, guestEnd] = [guestEnd, guestStart]

  return {
    memberStart,
    memberEnd,
    guestStart,
    guestEnd
  }
}

export async function getActiveMemberSlot(event: H3Event, userId: string) {
  const supabase = serverSupabaseServiceRole(event) as any
  const { data, error } = await supabase
    .from('lock_slot_assignments')
    .select('id,slot_number,active,slot_kind,user_id')
    .eq('slot_kind', 'member')
    .eq('user_id', userId)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function allocateMemberSlot(event: H3Event, userId: string) {
  const supabase = serverSupabaseServiceRole(event) as any

  const existing = await getActiveMemberSlot(event, userId)
  if (existing?.slot_number) {
    return {
      assignmentId: existing.id as string,
      slotNumber: Number(existing.slot_number)
    }
  }

  const { memberStart, memberEnd } = await getLockSlotRanges(event)

  const { data: usedRows, error: usedErr } = await supabase
    .from('lock_slot_assignments')
    .select('slot_number')
    .eq('slot_kind', 'member')
    .eq('active', true)

  if (usedErr) throw new Error(usedErr.message)
  const used = new Set((usedRows ?? []).map((row: any) => Number(row.slot_number)))
  const reserved = await getReservedPermanentSlots(event)

  for (let slot = memberStart; slot <= memberEnd; slot += 1) {
    if (used.has(slot)) continue
    if (reserved.has(slot)) continue

    const { data: inserted, error: insertErr } = await supabase
      .from('lock_slot_assignments')
      .insert({
        slot_number: slot,
        slot_kind: 'member',
        user_id: userId,
        active: true,
        allocated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id,slot_number')
      .single()

    if (!insertErr && inserted) {
      return {
        assignmentId: String(inserted.id),
        slotNumber: Number(inserted.slot_number)
      }
    }

    if (isUniqueViolation(insertErr)) continue
    throw new Error(insertErr?.message ?? 'Failed to allocate member slot')
  }

  throw new Error(`No free member lock slots available in range ${memberStart}-${memberEnd}`)
}

export async function getActiveGuestSlot(event: H3Event, bookingId: string) {
  const supabase = serverSupabaseServiceRole(event) as any
  const { data, error } = await supabase
    .from('lock_slot_assignments')
    .select('id,slot_number,active,slot_kind,booking_id')
    .eq('slot_kind', 'guest')
    .eq('booking_id', bookingId)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function allocateGuestSlot(event: H3Event, bookingId: string) {
  const supabase = serverSupabaseServiceRole(event) as any

  const existing = await getActiveGuestSlot(event, bookingId)
  if (existing?.slot_number) {
    return {
      assignmentId: existing.id as string,
      slotNumber: Number(existing.slot_number)
    }
  }

  const { guestStart, guestEnd } = await getLockSlotRanges(event)

  const { data: usedRows, error: usedErr } = await supabase
    .from('lock_slot_assignments')
    .select('slot_number')
    .eq('slot_kind', 'guest')
    .eq('active', true)

  if (usedErr) throw new Error(usedErr.message)
  const used = new Set((usedRows ?? []).map((row: any) => Number(row.slot_number)))
  const reserved = await getReservedPermanentSlots(event)

  for (let slot = guestStart; slot <= guestEnd; slot += 1) {
    if (used.has(slot)) continue
    if (reserved.has(slot)) continue

    const { data: inserted, error: insertErr } = await supabase
      .from('lock_slot_assignments')
      .insert({
        slot_number: slot,
        slot_kind: 'guest',
        booking_id: bookingId,
        active: true,
        allocated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id,slot_number')
      .single()

    if (!insertErr && inserted) {
      return {
        assignmentId: String(inserted.id),
        slotNumber: Number(inserted.slot_number)
      }
    }

    if (isUniqueViolation(insertErr)) continue
    throw new Error(insertErr?.message ?? 'Failed to allocate guest slot')
  }

  throw new Error(`No free guest lock slots available in range ${guestStart}-${guestEnd}`)
}

export async function releaseGuestSlot(event: H3Event, bookingId: string) {
  const supabase = serverSupabaseServiceRole(event) as any
  const nowIso = new Date().toISOString()

  const { data: rows, error: readErr } = await supabase
    .from('lock_slot_assignments')
    .select('id,slot_number')
    .eq('slot_kind', 'guest')
    .eq('booking_id', bookingId)
    .eq('active', true)

  if (readErr) throw new Error(readErr.message)

  if (!rows?.length) return [] as number[]

  const ids = rows.map((row: any) => row.id)

  const { error: updateErr } = await supabase
    .from('lock_slot_assignments')
    .update({
      active: false,
      released_at: nowIso,
      updated_at: nowIso
    })
    .in('id', ids)

  if (updateErr) throw new Error(updateErr.message)

  return rows.map((row: any) => Number(row.slot_number))
}
