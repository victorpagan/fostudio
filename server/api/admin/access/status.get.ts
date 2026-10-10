import { accessJobOutcome } from '~~/server/utils/access/jobOutcome'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getAlarmProviderHealth, getLockProviderHealth } from '~~/server/utils/access/providers'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase
  const requestedJobId = getQuery(event).jobId
  const jobId = requestedJobId === undefined ? null : Number(requestedJobId)
  if (jobId !== null && (!Number.isSafeInteger(jobId) || jobId <= 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid job ID' })
  }

  const [
    pendingRes,
    deadRes,
    openIncidentsRes,
    deadJobsRes,
    recentJobsRes,
    recentIncidentsRes,
    provider,
    alarmProvider
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
      .select('id,job_type,status,booking_id,user_id,run_at,attempts,max_attempts,last_error,last_response,payload,processed_at,created_at,updated_at')
      .eq('status', 'dead')
      .order('updated_at', { ascending: false })
      .limit(50),
    db
      .from('lock_access_jobs')
      .select('id,job_type,status,booking_id,user_id,run_at,attempts,max_attempts,last_error,last_response,payload,processed_at,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(20),
    db
      .from('lock_access_incidents')
      .select('id,incident_type,severity,status,title,message,booking_id,user_id,metadata,resolved_at,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(20),
    getLockProviderHealth(event),
    getAlarmProviderHealth(event)
  ])

  const errors = [
    pendingRes.error,
    deadRes.error,
    openIncidentsRes.error,
    deadJobsRes.error,
    recentJobsRes.error,
    recentIncidentsRes.error
  ].filter(Boolean)

  if (errors.length) {
    throw createError({ statusCode: 500, statusMessage: errors[0]?.message ?? 'Failed to load access sync status' })
  }

  const summarizeJob = (job: NonNullable<typeof recentJobsRes.data>[number]) => {
    const { last_response, payload, ...safe } = job
    return { ...safe, outcome: accessJobOutcome({ ...safe, last_response, payload }) }
  }

  const selectedRes = jobId === null
    ? null
    : await db.from('lock_access_jobs')
        .select('id,job_type,status,booking_id,user_id,run_at,attempts,max_attempts,last_error,last_response,payload,processed_at,created_at,updated_at')
        .eq('id', jobId)
        .maybeSingle()
  if (selectedRes?.error) throw createError({ statusCode: 500, statusMessage: 'Could not check retry outcome' })

  return {
    selectedJob: selectedRes?.data ? summarizeJob(selectedRes.data) : null,
    provider,
    alarmProvider,
    summary: {
      pendingJobs: pendingRes.count ?? 0,
      deadJobs: deadRes.count ?? 0,
      openIncidents: openIncidentsRes.count ?? 0
    },
    deadJobs: (deadJobsRes.data ?? []).map(summarizeJob),
    recentJobs: (recentJobsRes.data ?? []).map(summarizeJob),
    recentIncidents: (recentIncidentsRes.data ?? []).map(({ metadata, ...incident }) => ({
      ...incident,
      jobId: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? String(metadata.jobId ?? '') : ''
    }))
  }
})
