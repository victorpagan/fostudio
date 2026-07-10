import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  jobId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(200)
})

export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))
  // The generated client can lag the access queue schema owned by fosupabase.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: existing, error: readError } = await db
    .from('lock_access_jobs')
    .select('id,job_type,status,booking_id,user_id,run_at,attempts,max_attempts,payload,last_error')
    .eq('id', body.jobId)
    .maybeSingle()

  if (readError) throw createError({ statusCode: 500, statusMessage: readError.message })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Access job not found.' })
  if (existing.status !== 'dead') {
    throw createError({
      statusCode: 409,
      statusMessage: `Only dead access jobs can be retried. Current status: ${existing.status}.`
    })
  }

  const retriedAt = new Date().toISOString()
  const priorPayload = existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload)
    ? existing.payload as Record<string, unknown>
    : {}

  const payload = {
    ...priorPayload,
    manualRetry: {
      requestedAt: retriedAt,
      requestedBy: user.sub ?? null,
      reason: body.reason,
      priorAttempts: Number(existing.attempts ?? 0),
      priorError: existing.last_error ?? null
    }
  }

  const { data: job, error: updateError } = await db
    .from('lock_access_jobs')
    .update({
      status: 'pending',
      attempts: 0,
      run_at: retriedAt,
      processed_at: null,
      last_error: null,
      last_response: null,
      payload,
      updated_at: retriedAt
    })
    .eq('id', body.jobId)
    .eq('status', 'dead')
    .select('id,job_type,status,booking_id,user_id,run_at,attempts,max_attempts,last_error,created_at,updated_at')
    .maybeSingle()

  if (updateError) throw createError({ statusCode: 500, statusMessage: updateError.message })
  if (!job) throw createError({ statusCode: 409, statusMessage: 'Access job changed before it could be retried.' })

  return { job }
})
