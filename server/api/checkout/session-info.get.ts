import { z } from 'zod'
import { serverSupabaseServiceRole } from '#supabase/server'

const querySchema = z.object({
  token: z.string().uuid()
})

export default defineEventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  const supabase = serverSupabaseServiceRole(event)

  const { data: session, error: sessionErr } = await supabase
    .from('membership_checkout_sessions')
    .select('token,tier,cadence,status,guest_email,created_at')
    .eq('token', query.token)
    .maybeSingle()

  if (sessionErr) throw createError({ statusCode: 500, statusMessage: sessionErr.message })
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Checkout session not found' })

  const { data: tier, error: tierErr } = await supabase
    .from('membership_tiers')
    .select('id,display_name,booking_window_days')
    .eq('id', session.tier)
    .maybeSingle()

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })

  const { data: variation, error: variationErr } = await supabase
    .from('membership_plan_variations')
    .select('credits_per_month')
    .eq('tier_id', session.tier)
    .eq('cadence', session.cadence)
    .maybeSingle()

  if (variationErr) throw createError({ statusCode: 500, statusMessage: variationErr.message })

  return {
    session: {
      token: session.token,
      tier: session.tier,
      cadence: session.cadence,
      status: session.status,
      guestEmail: session.guest_email ?? null,
      createdAt: session.created_at ?? null,
      tierDisplayName: tier?.display_name ?? session.tier,
      bookingWindowDays: Number(tier?.booking_window_days ?? 0),
      credits: Number(variation?.credits_per_month ?? 0)
    }
  }
})
