import { requireServerAdmin } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any
  const now = new Date().toISOString()

  const [
    dueGrantCountRes,
    scheduledGrantCountRes,
    dueGrantsRes,
    upcomingGrantsRes,
    membershipsAttentionRes,
    recentGuestBookingsRes,
    activeExtendedMembershipsRes,
    futureGrantMembershipsRes,
    pendingLockJobsRes,
    deadLockJobsRes,
    openLockIncidentsRes,
    recentLockIncidentsRes
  ] = await Promise.all([
    supabase
      .from('membership_credit_grants')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .lte('due_at', now),
    supabase
      .from('membership_credit_grants')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled'),
    supabase
      .from('membership_credit_grants')
      .select('id, membership_id, user_id, invoice_id, due_at, credits, processed_credits, status, last_error, created_at')
      .eq('status', 'scheduled')
      .lte('due_at', now)
      .order('due_at', { ascending: true })
      .limit(10),
    supabase
      .from('membership_credit_grants')
      .select('id, membership_id, user_id, invoice_id, due_at, credits, processed_credits, status, last_error, created_at')
      .eq('status', 'scheduled')
      .gt('due_at', now)
      .order('due_at', { ascending: true })
      .limit(10),
    supabase
      .from('memberships')
      .select('id, user_id, tier, cadence, status, current_period_start, current_period_end, last_invoice_id, last_paid_at')
      .in('status', ['pending_checkout', 'past_due', 'canceled'])
      .order('last_paid_at', { ascending: true, nullsFirst: true })
      .limit(12),
    supabase
      .from('bookings')
      .select('id, start_time, end_time, status, guest_name, guest_email, notes, created_at, square_order_id')
      .is('user_id', null)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('memberships')
      .select('id, user_id, tier, cadence, status, current_period_start, current_period_end, last_invoice_id, last_paid_at')
      .eq('status', 'active')
      .in('cadence', ['quarterly', 'annual'])
      .not('current_period_start', 'is', null)
      .not('current_period_end', 'is', null)
      .limit(100),
    supabase
      .from('membership_credit_grants')
      .select('membership_id')
      .eq('status', 'scheduled')
      .gt('due_at', now),
    db
      .from('lock_access_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    db
      .from('lock_access_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'dead'),
    db
      .from('lock_access_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
    db
      .from('lock_access_incidents')
      .select('id,incident_type,severity,status,title,message,booking_id,user_id,created_at')
      .order('created_at', { ascending: false })
      .limit(8)
  ])

  const errors = [
    dueGrantCountRes.error,
    scheduledGrantCountRes.error,
    dueGrantsRes.error,
    upcomingGrantsRes.error,
    membershipsAttentionRes.error,
    recentGuestBookingsRes.error,
    activeExtendedMembershipsRes.error,
    futureGrantMembershipsRes.error,
    pendingLockJobsRes.error,
    deadLockJobsRes.error,
    openLockIncidentsRes.error,
    recentLockIncidentsRes.error
  ].filter(Boolean)

  if (errors.length) {
    throw createError({ statusCode: 500, statusMessage: errors[0]?.message ?? 'Failed to load admin ops data' })
  }

  const futureGrantMembershipIds = new Set(
    (futureGrantMembershipsRes.data ?? []).map(row => row.membership_id)
  )

  const membershipsMissingFutureSchedule = (activeExtendedMembershipsRes.data ?? []).filter(
    membership => !futureGrantMembershipIds.has(membership.id)
  )

  return {
    summary: {
      dueGrantCount: dueGrantCountRes.count ?? 0,
      scheduledGrantCount: scheduledGrantCountRes.count ?? 0,
      membershipsNeedingAttention: membershipsAttentionRes.data?.length ?? 0,
      guestBookings: recentGuestBookingsRes.data?.length ?? 0,
      membershipsMissingFutureSchedule: membershipsMissingFutureSchedule.length,
      pendingLockJobs: pendingLockJobsRes.count ?? 0,
      deadLockJobs: deadLockJobsRes.count ?? 0,
      openLockIncidents: openLockIncidentsRes.count ?? 0
    },
    dueGrants: dueGrantsRes.data ?? [],
    upcomingGrants: upcomingGrantsRes.data ?? [],
    membershipsNeedingAttention: membershipsAttentionRes.data ?? [],
    membershipsMissingFutureSchedule,
    recentGuestBookings: recentGuestBookingsRes.data ?? [],
    recentLockIncidents: recentLockIncidentsRes.data ?? []
  }
})
