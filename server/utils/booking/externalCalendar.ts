type SupabaseLike = {
  from: (table: string) => any
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
  return (data ?? []) as ExternalCalendarBlock[]
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
    .limit(1)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return (data?.[0] ?? null) as null | {
    id: string
    title: string | null
    start_time: string
    end_time: string
    provider: string
    calendar_id: string
  }
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
