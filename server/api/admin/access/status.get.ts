import { requireServerAdmin } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any

  const [
    pendingRes,
    deadRes,
    openIncidentsRes,
    recentJobsRes,
    recentIncidentsRes
  ] = await Promise.all([
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
      .from('lock_access_jobs')
      .select('id,job_type,status,booking_id,user_id,run_at,attempts,max_attempts,last_error,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(20),
    db
      .from('lock_access_incidents')
      .select('id,incident_type,severity,status,title,message,booking_id,user_id,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(20)
  ])

  const errors = [
    pendingRes.error,
    deadRes.error,
    openIncidentsRes.error,
    recentJobsRes.error,
    recentIncidentsRes.error
  ].filter(Boolean)

  if (errors.length) {
    throw createError({ statusCode: 500, statusMessage: errors[0]?.message ?? 'Failed to load access sync status' })
  }

  return {
    summary: {
      pendingJobs: pendingRes.count ?? 0,
      deadJobs: deadRes.count ?? 0,
      openIncidents: openIncidentsRes.count ?? 0
    },
    recentJobs: recentJobsRes.data ?? [],
    recentIncidents: recentIncidentsRes.data ?? []
  }
})
