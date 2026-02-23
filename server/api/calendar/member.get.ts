import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const supabase = await serverSupabaseClient(event)

  const { data: membership, error: memErr } = await supabase
    .from('memberships')
    .select('tier,status')
    .eq('user_id', user.id)
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
  const days = tierRow?.booking_window_days ?? 30

  const now = new Date()
  const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('start_time,end_time,status')
    .gte('start_time', now.toISOString())
    .lte('start_time', to.toISOString())
    .in('status', ['confirmed', 'requested'])
    .order('start_time', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const { data: holds, error: holdsErr } = await supabase
    .from('booking_holds')
    .select('hold_start,hold_end')
    .gte('hold_start', now.toISOString())
    .lte('hold_start', to.toISOString())
    .order('hold_start', { ascending: true })

  if (holdsErr) throw createError({ statusCode: 500, statusMessage: holdsErr.message })

  return {
    from: now.toISOString(),
    to: to.toISOString(),
    busy: (bookings ?? []).map((b) => ({ start: b.start_time, end: b.end_time, type: 'booking' })),
    holds: (holds ?? []).map((h) => ({ start: h.hold_start, end: h.hold_end, type: 'hold' }))
  }
})
