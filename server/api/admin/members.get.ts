import { requireServerAdmin } from '~~/server/utils/auth'

type MemberRow = {
  membership_id: string
  user_id: string
  tier: string | null
  cadence: string | null
  status: string | null
  effective_status: string
  current_period_start: string | null
  current_period_end: string | null
  last_paid_at: string | null
  created_at: string
  customer_email: string | null
  customer_first_name: string | null
  customer_last_name: string | null
  door_code: string | null
  door_code_request_status: string | null
  door_code_last_request_at: string | null
  credit_balance: number | null
}

function deriveEffectiveStatus(status: string | null, currentPeriodEnd: string | null, now = new Date()): string {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (!normalized) return 'unknown'

  if (normalized !== 'active' && normalized !== 'past_due') {
    return normalized
  }

  if (!currentPeriodEnd) return normalized
  const endAt = new Date(currentPeriodEnd)
  if (Number.isNaN(endAt.getTime())) return normalized

  return endAt.getTime() <= now.getTime() ? 'expired' : normalized
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)

  const { data: memberships, error: membershipsErr } = await supabase
    .from('memberships')
    .select('id,user_id,tier,cadence,status,current_period_start,current_period_end,last_paid_at,created_at')
    .order('created_at', { ascending: false })
    .limit(300)

  if (membershipsErr) throw createError({ statusCode: 500, statusMessage: membershipsErr.message })

  type CustomerRow = {
    user_id: string
    email: string | null
    first_name: string | null
    last_name: string | null
    door_code: string | null
  }
  type DoorCodeRequestRow = {
    user_id: string
    status: string | null
    requested_at: string
  }
  type BalanceRow = {
    user_id: string
    balance: number
  }

  const userIds = [...new Set((memberships ?? []).map(row => row.user_id))]
  let customers: CustomerRow[] = []
  let balances: BalanceRow[] = []
  let doorCodeRequests: DoorCodeRequestRow[] = []

  if (userIds.length) {
    const [customersRes, balancesRes, doorCodeRequestsRes] = await Promise.all([
      supabase
        .from('customers')
        .select('user_id,email,first_name,last_name,door_code')
        .in('user_id', userIds),
      supabase
        .from('credit_balance')
        .select('user_id,balance')
        .in('user_id', userIds),
      supabase
        .from('door_code_change_requests')
        .select('user_id,status,requested_at')
        .in('user_id', userIds)
        .order('requested_at', { ascending: false })
    ])

    if (customersRes.error) throw createError({ statusCode: 500, statusMessage: customersRes.error.message })
    if (balancesRes.error) throw createError({ statusCode: 500, statusMessage: balancesRes.error.message })
    if (doorCodeRequestsRes.error) throw createError({ statusCode: 500, statusMessage: doorCodeRequestsRes.error.message })

    customers = (customersRes.data ?? []) as CustomerRow[]
    balances = (balancesRes.data ?? []) as BalanceRow[]
    doorCodeRequests = (doorCodeRequestsRes.data ?? []) as DoorCodeRequestRow[]
  }

  const customersByUserId = new Map<string, CustomerRow>()
  for (const customer of customers) {
    customersByUserId.set(customer.user_id, customer)
  }

  const balancesByUserId = new Map<string, number>()
  for (const balance of balances) {
    balancesByUserId.set(balance.user_id, Number(balance.balance ?? 0))
  }

  const latestDoorCodeRequestByUserId = new Map<string, DoorCodeRequestRow>()
  for (const request of doorCodeRequests) {
    if (!latestDoorCodeRequestByUserId.has(request.user_id)) {
      latestDoorCodeRequestByUserId.set(request.user_id, request)
    }
  }

  const members: MemberRow[] = (memberships ?? []).map((membership) => {
    const customer = customersByUserId.get(membership.user_id)
    const latestDoorCodeRequest = latestDoorCodeRequestByUserId.get(membership.user_id)
    return {
      membership_id: membership.id,
      user_id: membership.user_id,
      tier: membership.tier,
      cadence: membership.cadence,
      status: membership.status,
      effective_status: deriveEffectiveStatus(membership.status, membership.current_period_end),
      current_period_start: membership.current_period_start,
      current_period_end: membership.current_period_end,
      last_paid_at: membership.last_paid_at,
      created_at: membership.created_at,
      customer_email: customer?.email ?? null,
      customer_first_name: customer?.first_name ?? null,
      customer_last_name: customer?.last_name ?? null,
      door_code: customer?.door_code ?? null,
      door_code_request_status: latestDoorCodeRequest?.status ?? null,
      door_code_last_request_at: latestDoorCodeRequest?.requested_at ?? null,
      credit_balance: balancesByUserId.get(membership.user_id) ?? null
    }
  })

  return { members }
})
