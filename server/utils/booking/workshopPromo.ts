import type { SupabaseClient } from '@supabase/supabase-js'

type WorkshopPromoRow = {
  id: string
  start_time: string
  end_time: string
  workshop_title: string | null
  workshop_description: string | null
  workshop_link: string | null
}

export type WorkshopPromoPayload = {
  bookingId: string
  startsAt: string
  endsAt: string
  title: string | null
  description: string | null
  link: string | null
}

function normalizeText(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

export async function getUpcomingWorkshopPromo(
  supabase: SupabaseClient,
  nowIso = new Date().toISOString()
): Promise<WorkshopPromoPayload | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id,start_time,end_time,workshop_title,workshop_description,workshop_link')
    .in('status', ['confirmed', 'requested'])
    .eq('booking_kind', 'workshop')
    .gte('end_time', nowIso)
    .order('start_time', { ascending: true })
    .limit(20)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const rows = (data ?? []) as WorkshopPromoRow[]
  for (const row of rows) {
    const title = normalizeText(row.workshop_title)
    const description = normalizeText(row.workshop_description)
    const link = normalizeText(row.workshop_link)
    if (!title && !description && !link) continue
    return {
      bookingId: row.id,
      startsAt: row.start_time,
      endsAt: row.end_time,
      title,
      description,
      link
    }
  }

  return null
}
