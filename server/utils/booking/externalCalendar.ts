import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/app/types/database.types'

type SupabaseLike = SupabaseClient<Database>

function isMissingRelationError(error: { code?: string, message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42P01'
    || message.includes('schema cache')
    || (message.includes('booking_external_access') && message.includes('does not exist'))
}

async function getLinkedExternalEventIds(db: SupabaseLike, externalEventIds: string[]) {
  if (!externalEventIds.length) return new Set<string>()

  // The access-link table is additive. Calendar reads remain available during a
  // migration-first rollout or local development against an older schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('booking_external_access')
    .select('external_calendar_event_id')
    .in('external_calendar_event_id', externalEventIds)

  if (error) {
    if (isMissingRelationError(error)) return new Set<string>()
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return new Set<string>((data ?? [])
    .map((row: { external_calendar_event_id?: unknown }) => String(row.external_calendar_event_id ?? '').trim())
    .filter(Boolean))
}

export type ExternalCalendarBlock = {
  id: string
  title: string | null
  description: string | null
  location: string | null
  start_time: string
  end_time: string
  provider: string
  calendar_id: string
}

export async function getExternalCalendarEventsInRange(
  db: SupabaseLike,
  fromIso: string,
  toIso: string
) {
  const { data, error } = await db
    .from('external_calendar_events')
    .select('id,title,description,location,start_time,end_time,provider,calendar_id')
    .eq('active', true)
    .lt('start_time', toIso)
    .gt('end_time', fromIso)
    .order('start_time', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  const rows = (data ?? []) as ExternalCalendarBlock[]
  const linkedIds = await getLinkedExternalEventIds(db, rows.map(row => row.id))
  return rows.filter(row => !linkedIds.has(row.id))
}

export async function findExternalCalendarConflict(
  db: SupabaseLike,
  startIso: string,
  endIso: string
) {
  const { data, error } = await db
    .from('external_calendar_events')
    .select('id,title,start_time,end_time,provider,calendar_id')
    .eq('active', true)
    .lt('start_time', endIso)
    .gt('end_time', startIso)
    .order('start_time', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  const rows = (data ?? []) as Array<{
    id: string
    title: string | null
    start_time: string
    end_time: string
    provider: string
    calendar_id: string
  }>
  const linkedIds = await getLinkedExternalEventIds(db, rows.map(row => row.id))
  return rows.find(row => !linkedIds.has(row.id)) ?? null
}

export async function ensureNoExternalCalendarConflict(
  db: SupabaseLike,
  startIso: string,
  endIso: string,
  statusMessage = 'Time slot is blocked by external calendar booking'
) {
  const conflict = await findExternalCalendarConflict(db, startIso, endIso)
  if (!conflict) return

  throw createError({
    statusCode: 409,
    statusMessage
  })
}
