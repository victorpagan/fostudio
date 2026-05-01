import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { resolveAvailableCreditBalance } from '~~/server/utils/credits/availableBalance'

export type BookingAccountState = {
  kind: 'guest' | 'active_member'
  userId: string
  membership: {
    id?: string | null
    status?: string | null
    tier?: string | null
    current_period_start?: string | null
    current_period_end?: string | null
  } | null
  customer: {
    id: string
    email?: string | null
    phone?: string | null
    first_name?: string | null
    last_name?: string | null
    workshop_booking_enabled?: boolean | null
  } | null
  remainingCredits: number
}

type BookingCustomerState = BookingAccountState['customer']

export async function resolveBookingAccountState(event: H3Event, user: { sub: string, email?: string | null }): Promise<BookingAccountState> {
  const supabase = serverSupabaseServiceRole(event)

  const [{ data: membership, error: membershipErr }, { data: customer, error: customerErr }, remainingCredits] = await Promise.all([
    supabase
      .from('memberships')
      .select('id,status,tier,current_period_start,current_period_end')
      .eq('user_id', user.sub)
      .maybeSingle(),
    supabase
      .from('customers')
      .select('id,email,phone,first_name,last_name,workshop_booking_enabled')
      .eq('user_id', user.sub)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    resolveAvailableCreditBalance(supabase, user.sub).catch((error) => {
      throw createError({
        statusCode: 500,
        statusMessage: error instanceof Error ? error.message : 'Failed to load credits'
      })
    })
  ])

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (customerErr) throw createError({ statusCode: 500, statusMessage: customerErr.message })

  const customerState = customer as unknown as BookingCustomerState
  const hasActiveMembership = String(membership?.status ?? '').toLowerCase() === 'active'
  return {
    kind: hasActiveMembership ? 'active_member' : 'guest',
    userId: user.sub,
    membership: membership ?? null,
    customer: customerState ?? null,
    remainingCredits
  }
}
