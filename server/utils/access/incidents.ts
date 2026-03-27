import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'

export type AccessIncidentInput = {
  incidentType: string
  severity?: 'warning' | 'error' | 'critical'
  title: string
  message?: string | null
  userId?: string | null
  bookingId?: string | null
  metadata?: Record<string, unknown>
}

export async function createAccessIncident(event: H3Event, input: AccessIncidentInput) {
  const supabase = serverSupabaseServiceRole(event) as any
  const nowIso = new Date().toISOString()

  const { data: inserted, error } = await supabase
    .from('lock_access_incidents')
    .insert({
      incident_type: input.incidentType,
      severity: input.severity ?? 'error',
      status: 'open',
      title: input.title,
      message: input.message ?? null,
      user_id: input.userId ?? null,
      booking_id: input.bookingId ?? null,
      metadata: input.metadata ?? {},
      created_at: nowIso,
      updated_at: nowIso
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  try {
    await sendViaFomailer(event, {
      body: {
        type: 'lock_access_incident',
        payload: {
          id: inserted?.id ?? null,
          incidentType: input.incidentType,
          severity: input.severity ?? 'error',
          title: input.title,
          message: input.message ?? null,
          userId: input.userId ?? null,
          bookingId: input.bookingId ?? null,
          metadata: input.metadata ?? {},
          createdAt: nowIso
        }
      }
    })
  } catch (error) {
    console.warn('[access/incident] email dispatch failed (non-blocking)', {
      incidentType: input.incidentType,
      error: (error as Error)?.message ?? String(error)
    })
  }

  return {
    id: inserted?.id ?? null,
    createdAt: nowIso
  }
}
