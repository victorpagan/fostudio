import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { resolveMembershipBillingPeriod } from '~~/server/utils/square/billingPeriod'
import { resolveOrderPaymentState } from '~~/server/utils/square/orderPayment'
import { ensureDoorCodeForUser } from '~~/server/utils/membership/doorCode'

const bodySchema = z.object({
  token: z.string().uuid()
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CheckoutSessionRow = {
  id: string
  token: string
  tier: string
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
  status: string
  return_to: string | null
  guest_email: string | null
  payment_link_id: string | null
  order_template_id: string | null
  plan_variation_id: string | null
  square_customer_id: string | null
  square_subscription_id: string | null
  paid_at: string | null
  created_at?: string | null
  claimed_by_user_id: string | null
  claimed_membership_id: string | null
}

type MembershipStatus = 'active' | 'pending_checkout' | 'past_due' | 'canceled'

type MembershipClaimRow = {
  id: string
  status: string | null
  activated_at: string | null
}

type ExistingMembershipRow = {
  id: string
  status: string | null
  activated_at: string | null
}

function normalizeReturnTo(value: string | null | undefined, fallback = '/dashboard/membership') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null

  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return null
}

function toRecordArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter(item => item && typeof item === 'object') as Record<string, unknown>[]
}

function mapSquareStatus(rawStatus: string | null): MembershipStatus {
  const status = (rawStatus ?? '').toUpperCase()
  if (!status) return 'pending_checkout'
  if (status === 'ACTIVE') return 'active'
  if (status === 'CANCELED' || status === 'CANCELLED') return 'canceled'
  if (status === 'PENDING') return 'pending_checkout'
  return 'past_due'
}

async function findLatestSubscription(
  square: Awaited<ReturnType<typeof useSquareClient>>,
  customerId: string,
  planVariationId: string | null
) {
  const runSearch = async (usePlanFilter: boolean) => {
    const filter: Record<string, unknown> = { customerIds: [customerId] }
    if (usePlanFilter && planVariationId) {
      filter.planVariationIds = [planVariationId]
    }

    const queryPayload = {
      query: {
        filter,
        sort: { sortOrder: 'DESC', sortField: 'CREATED_AT' }
      },
      limit: 20
    }

    const searchRes = await square.subscriptions.search(queryPayload as never)
    return toRecordArray((searchRes as { subscriptions?: unknown }).subscriptions)
  }

  const sortSubscriptions = (subscriptions: Record<string, unknown>[]) => {
    subscriptions.sort((left, right) => {
      const leftStatus = (readString(left, 'status') ?? '').toUpperCase()
      const rightStatus = (readString(right, 'status') ?? '').toUpperCase()
      const leftActive = leftStatus === 'ACTIVE' ? 1 : 0
      const rightActive = rightStatus === 'ACTIVE' ? 1 : 0
      if (rightActive !== leftActive) return rightActive - leftActive

      const leftCreated = Date.parse(readString(left, 'createdAt', 'created_at') ?? '')
      const rightCreated = Date.parse(readString(right, 'createdAt', 'created_at') ?? '')
      return (Number.isNaN(rightCreated) ? 0 : rightCreated) - (Number.isNaN(leftCreated) ? 0 : leftCreated)
    })
  }

  try {
    let subscriptions = await runSearch(true)
    if (!subscriptions.length && planVariationId) {
      // Fallback: the subscription can exist but not match the originally stored
      // plan variation id due to Square-side updates; search by customer only.
      subscriptions = await runSearch(false)
    }

    if (!subscriptions.length) return null
    sortSubscriptions(subscriptions)
    return subscriptions[0] ?? null
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub || !UUID_RE.test(user.sub)) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  }

  const body = bodySchema.parse(await readBody(event))
  const supabase = serverSupabaseServiceRole(event)

  const { data: rawSession, error: sessionErr } = await supabase
    .from('membership_checkout_sessions')
    .select('*')
    .eq('token', body.token)
    .maybeSingle()

  if (sessionErr) throw createError({ statusCode: 500, statusMessage: sessionErr.message })
  if (!rawSession) throw createError({ statusCode: 404, statusMessage: 'Checkout session not found' })

  const session = rawSession as CheckoutSessionRow
  const returnTo = normalizeReturnTo(session.return_to)

  if (session.claimed_by_user_id && session.claimed_by_user_id !== user.sub) {
    throw createError({ statusCode: 409, statusMessage: 'This checkout has already been claimed by another account.' })
  }

  if (session.claimed_by_user_id === user.sub && session.claimed_membership_id) {
    const { data: claimedMembership } = await supabase
      .from('memberships')
      .select('id,status')
      .eq('id', session.claimed_membership_id)
      .maybeSingle()

    const claimedStatus = (claimedMembership?.status ?? '').toLowerCase()
    if (claimedStatus === 'active') {
      return {
        ok: true,
        membershipId: session.claimed_membership_id,
        membershipStatus: claimedMembership?.status ?? 'active',
        returnTo
      }
    }

    // Session was already claimed but membership is not active yet.
    // Continue below to re-check Square payment/subscription state and
    // update membership status idempotently.
  }

  if (session.status === 'failed' || session.status === 'expired') {
    return {
      ok: false,
      pending: false,
      membershipStatus: 'pending_checkout',
      returnTo,
      message: 'This checkout session is no longer valid. Please start checkout again.'
    }
  }

  const square = await useSquareClient(event)

  let orderId = session.order_template_id
  if (!orderId && session.payment_link_id) {
    const linkRes = await square.checkout.paymentLinks.get({ id: session.payment_link_id } as never)
    const paymentLink = (linkRes as { paymentLink?: Record<string, unknown> | null }).paymentLink ?? null
    orderId = readString(paymentLink, 'orderId', 'order_id')
  }

  if (!orderId) {
    return {
      ok: false,
      pending: true,
      membershipStatus: 'pending_checkout',
      returnTo,
      message: 'Payment details are still syncing. Try again in a moment.'
    }
  }

  const paymentState = await resolveOrderPaymentState({
    square,
    orderId,
    beginTime: session.created_at ?? null
  })

  if (!paymentState.completed) {
    return {
      ok: false,
      pending: true,
      membershipStatus: 'pending_checkout',
      returnTo,
      message: 'Payment is not completed yet. Please refresh in a moment.',
      orderState: paymentState.orderState,
      paymentStatus: paymentState.paymentStatus
    }
  }

  const squareCustomerId = paymentState.paymentCustomerId
    ?? paymentState.orderCustomerId
    ?? session.square_customer_id
  if (!squareCustomerId) {
    return {
      ok: false,
      pending: true,
      membershipStatus: 'pending_checkout',
      returnTo,
      message: 'Payment completed, but customer sync is still in progress. Please try again shortly.',
      orderState: paymentState.orderState,
      paymentStatus: paymentState.paymentStatus
    }
  }

  const accountEmail = (session.guest_email ?? user.email ?? '').trim().toLowerCase() || null

  const { data: customerBySquare } = await supabase
    .from('customers')
    .select('id,user_id,email,square_customer_id')
    .eq('square_customer_id', squareCustomerId)
    .maybeSingle()

  if (customerBySquare) {
    if (customerBySquare.user_id && customerBySquare.user_id !== user.sub) {
      throw createError({ statusCode: 409, statusMessage: 'This membership payment is already linked to another account.' })
    }

    const customerPatch: Record<string, unknown> = { user_id: user.sub }
    if (!customerBySquare.email && accountEmail) customerPatch.email = accountEmail

    const { error: customerUpdateErr } = await supabase
      .from('customers')
      .update(customerPatch)
      .eq('id', customerBySquare.id)

    if (customerUpdateErr) throw createError({ statusCode: 500, statusMessage: customerUpdateErr.message })
  } else {
    const { data: customerByUser } = await supabase
      .from('customers')
      .select('id,email,square_customer_id')
      .eq('user_id', user.sub)
      .maybeSingle()

    if (customerByUser) {
      const customerPatch: Record<string, unknown> = { square_customer_id: squareCustomerId }
      if (!customerByUser.email && accountEmail) customerPatch.email = accountEmail

      const { error: customerUpdateErr } = await supabase
        .from('customers')
        .update(customerPatch)
        .eq('id', customerByUser.id)

      if (customerUpdateErr) throw createError({ statusCode: 500, statusMessage: customerUpdateErr.message })
    } else {
      const { error: customerInsertErr } = await supabase
        .from('customers')
        .insert({
          user_id: user.sub,
          email: accountEmail,
          square_customer_id: squareCustomerId
        })

      if (customerInsertErr) throw createError({ statusCode: 500, statusMessage: customerInsertErr.message })
    }
  }

  const subscription = await findLatestSubscription(square, squareCustomerId, session.plan_variation_id)
  const subscriptionId = readString(subscription, 'id')
  const membershipStatus = mapSquareStatus(readString(subscription, 'status'))
  const billingPeriod = resolveMembershipBillingPeriod({
    cadence: session.cadence,
    subscription,
    fallbackStart: null,
    fallbackEnd: null
  })

  const { data: existingMembershipRaw, error: existingErr } = await supabase
    .from('memberships')
    .select('id,status,activated_at')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (existingErr) throw createError({ statusCode: 500, statusMessage: existingErr.message })
  const existingMembership = (existingMembershipRaw as ExistingMembershipRow | null) ?? null

  const existingStatus = (existingMembership?.status ?? '').toLowerCase()
  const existingActivated = Boolean(existingMembership?.activated_at)
  const preserveActive = existingStatus === 'active' || existingActivated
  const resolvedMembershipStatus: MembershipStatus = preserveActive && membershipStatus !== 'active'
    ? 'active'
    : membershipStatus

  const nowIso = new Date().toISOString()
  const membershipPatch: Record<string, unknown> = {
    tier: session.tier,
    cadence: session.cadence,
    status: resolvedMembershipStatus,
    checkout_provider: 'square',
    checkout_payment_link_id: session.payment_link_id,
    checkout_order_template_id: orderId,
    square_plan_variation_id: session.plan_variation_id,
    square_customer_id: squareCustomerId,
    billing_provider: 'square',
    billing_customer_id: squareCustomerId
  }

  if (subscriptionId) {
    membershipPatch.square_subscription_id = subscriptionId
    membershipPatch.billing_subscription_id = subscriptionId
  }

  if (billingPeriod) {
    membershipPatch.current_period_start = billingPeriod.currentPeriodStart
    membershipPatch.current_period_end = billingPeriod.currentPeriodEnd
  }

  if (resolvedMembershipStatus === 'active' && !existingMembership?.activated_at) {
    membershipPatch.activated_at = nowIso
  }

  let claimedMembership: MembershipClaimRow

  if (existingMembership?.id) {
    const { data: updatedMembership, error: updateErr } = await supabase
      .from('memberships')
      .update(membershipPatch as never)
      .eq('id', existingMembership.id)
      .select('id,status,activated_at')
      .single()

    if (updateErr || !updatedMembership) {
      throw createError({ statusCode: 500, statusMessage: updateErr?.message ?? 'Failed to update membership' })
    }

    claimedMembership = updatedMembership as MembershipClaimRow
  } else {
    const { data: insertedMembership, error: insertErr } = await supabase
      .from('memberships')
      .insert({
        user_id: user.sub,
        ...membershipPatch
      } as never)
      .select('id,status,activated_at')
      .single()

    if (insertErr || !insertedMembership) {
      throw createError({ statusCode: 500, statusMessage: insertErr?.message ?? 'Failed to create membership' })
    }

    claimedMembership = insertedMembership as MembershipClaimRow
  }

  if (claimedMembership.status === 'active' && billingPeriod) {
    const { error: backfillErr } = await supabase.rpc('backfill_membership_credit_grants', {
      p_membership_id: claimedMembership.id
    })

    if (backfillErr) {
      console.error('[checkout-claim] failed to backfill grants', backfillErr)
    } else {
      const { error: processErr } = await supabase.rpc('process_due_membership_credit_grants', {
        p_limit: 24
      })
      if (processErr) {
        console.error('[checkout-claim] failed to process due grants', processErr)
      }
    }
  }

  const { error: sessionUpdateErr } = await supabase
    .from('membership_checkout_sessions')
    .update({
      status: 'claimed',
      claimed_by_user_id: user.sub,
      claimed_membership_id: claimedMembership.id,
      square_customer_id: squareCustomerId,
      square_subscription_id: subscriptionId ?? session.square_subscription_id,
      paid_at: session.paid_at ?? nowIso,
      order_template_id: orderId
    })
    .eq('id', session.id)

  if (sessionUpdateErr) throw createError({ statusCode: 500, statusMessage: sessionUpdateErr.message })

  await ensureDoorCodeForUser(event, {
    userId: user.sub,
    email: accountEmail ?? user.email ?? null
  })

  const finalStatus = (claimedMembership.status ?? 'pending_checkout').toLowerCase()
  if (finalStatus !== 'active') {
    return {
      ok: false,
      pending: true,
      membershipId: claimedMembership.id,
      membershipStatus: claimedMembership.status ?? 'pending_checkout',
      returnTo,
      message: 'Payment received. Waiting for Square to finalize your subscription.'
    }
  }

  return {
    ok: true,
    membershipId: claimedMembership.id,
    membershipStatus: claimedMembership.status ?? 'active',
    returnTo
  }
})
