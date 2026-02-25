import { z } from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

const qSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const supabase = await serverSupabaseClient(event)
  const q = qSchema.parse(getQuery(event))

  // Fetch membership + tier so we can enforce booking window
  const { data: membership, error: memErr } = await supabase
    .from('memberships')
    .select('tier, status')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (memErr) throw createError({ statusCode: 500, statusMessage: memErr.message })
  if (!membership || (membership.status || '').toLowerCase() !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Membership required' })
  }

  const { data: tierRow, error: tierErr } = await supabase
    .from('membership_tiers')
    .select('booking_window_days')
    .eq('id', membership.tier)
    .maybeSingle()

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })
  const windowDays = Number(tierRow?.booking_window_days ?? 30)

  // Use caller-supplied range if provided, clamped to the booking window
  const now = new Date()
  const maxTo = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000)

  const from = q.from ? new Date(q.from) : now
  // Respect caller's end but never exceed booking window
  const rawTo = q.to ? new Date(q.to) : maxTo
  const to = rawTo > maxTo ? maxTo : rawTo

  // All confirmed/requested bookings in the window
  const { data: bookings, error: bookErr } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, notes, credits_burned, user_id')
    .lt('start_time', to.toISOString())
    .gt('end_time', from.toISOString())
    .in('status', ['confirmed', 'requested'])
    .order('start_time', { ascending: true })

  if (bookErr) throw createError({ statusCode: 500, statusMessage: bookErr.message })

  // All holds in the window
  const { data: holds, error: holdsErr } = await supabase
    .from('booking_holds')
    .select('id, hold_start, hold_end')
    .lt('hold_start', to.toISOString())
    .gt('hold_end', from.toISOString())
    .order('hold_start', { ascending: true })

  if (holdsErr) throw createError({ statusCode: 500, statusMessage: holdsErr.message })

  // Shape events for FullCalendar — distinguish own bookings from others
  const events = [
    ...(bookings ?? []).map((b) => {
      const isOwn = b.user_id === user.sub
      return {
        id: `b_${b.id}`,
        start: b.start_time,
        end: b.end_time,
        title: isOwn ? `Your booking${b.credits_burned ? ` (${b.credits_burned} cr)` : ''}` : 'Booked',
        display: isOwn ? 'auto' : 'background',
        color: isOwn ? '#6366f1' : undefined, // indigo for own, default background for others
        extendedProps: {
          type: 'booking',
          isOwn,
          status: b.status,
          notes: isOwn ? b.notes : undefined
        }
      }
    }),
    ...(holds ?? []).map((h) => ({
      id: `h_${h.id}`,
      start: h.hold_start,
      end: h.hold_end,
      title: 'Hold',
      display: 'background',
      color: '#f59e0b', // amber for holds
      extendedProps: { type: 'hold' }
    }))
  ]

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    bookingWindowDays: windowDays,
    events
  }
})
