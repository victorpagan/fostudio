import { z } from 'zod'
import { DateTime } from 'luxon'
import { requireServerAdmin } from '~~/server/utils/auth'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'
import { enqueueBookingAccessSync, enqueueMemberActiveRefresh } from '~~/server/utils/access/jobs'

const bodySchema = z.object({
  fromIso: z.string().datetime().optional(),
  bookingLimit: z.number().int().min(1).max(2000).optional(),
  includeMembers: z.boolean().optional(),
  memberLimit: z.number().int().min(1).max(5000).optional()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase
  const body = bodySchema.parse((await readBody(event).catch(() => ({}))) ?? {})

  const now = DateTime.now().setZone(STUDIO_TZ)
  const fallbackFrom = now.minus({ days: 1 }).toUTC().toISO() ?? new Date().toISOString()
  const fromIso = body.fromIso ?? fallbackFrom
  const bookingLimit = Math.max(1, Math.min(2000, Number(body.bookingLimit ?? 500)))
  const includeMembers = body.includeMembers ?? true
  const memberLimit = Math.max(1, Math.min(5000, Number(body.memberLimit ?? 1000)))

  const { data: bookings, error: bookingErr } = await db
    .from('bookings')
    .select('id,status,start_time,end_time,user_id')
    .in('status', ['confirmed', 'requested'])
    .gte('end_time', fromIso)
    .order('start_time', { ascending: true })
    .limit(bookingLimit)

  if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })

  let bookingQueued = 0
  for (const booking of bookings ?? []) {
    const result = await enqueueBookingAccessSync(event, {
      bookingId: String(booking.id),
      reason: 'admin_backfill'
    })
    bookingQueued += Number(result.queued ?? 0)
  }

  let membersScanned = 0
  let memberQueued = 0

  if (includeMembers) {
    const { data: members, error: memberErr } = await db
      .from('memberships')
      .select('user_id,status')
      .in('status', ['active', 'past_due'])
      .not('user_id', 'is', null)
      .limit(memberLimit)

    if (memberErr) throw createError({ statusCode: 500, statusMessage: memberErr.message })

    const uniqueUserIds = Array.from(new Set((members ?? [])
      .map((row: { user_id?: string | null }) => (typeof row.user_id === 'string' ? row.user_id : null))
      .filter(Boolean) as string[]))

    membersScanned = uniqueUserIds.length

    for (const userId of uniqueUserIds) {
      const result = await enqueueMemberActiveRefresh(event, {
        userId,
        reason: 'admin_backfill'
      })
      memberQueued += Number(result.queued ?? 0)
    }
  }

  return {
    ok: true,
    fromIso,
    bookingScanned: bookings?.length ?? 0,
    bookingQueued,
    membersScanned,
    memberQueued
  }
})
