import { requireServerAdmin } from '~~/server/utils/auth'

type MemberRow = {
  membership_id: string
  user_id: string
  tier: string | null
  cadence: string | null
  status: string | null
  current_period_start: string | null
  current_period_end: string | null
  last_paid_at: string | null
  created_at: string
  customer_email: string | null
  customer_first_name: string | null
  customer_last_name: string | null
  credit_balance: number | null
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
  }
  type BalanceRow = {
    user_id: string
    balance: number
  }

  const userIds = [...new Set((memberships ?? []).map(row => row.user_id))]
  let customers: CustomerRow[] = []
  let balances: BalanceRow[] = []

  if (userIds.length) {
    const [customersRes, balancesRes] = await Promise.all([
      supabase
        .from('customers')
        .select('user_id,email,first_name,last_name')
        .in('user_id', userIds),
      supabase
        .from('credit_balance')
        .select('user_id,balance')
        .in('user_id', userIds)
    ])

    if (customersRes.error) throw createError({ statusCode: 500, statusMessage: customersRes.error.message })
    if (balancesRes.error) throw createError({ statusCode: 500, statusMessage: balancesRes.error.message })

    customers = (customersRes.data ?? []) as CustomerRow[]
    balances = (balancesRes.data ?? []) as BalanceRow[]
  }

  const customersByUserId = new Map<string, CustomerRow>()
  for (const customer of customers) {
    customersByUserId.set(customer.user_id, customer)
  }

  const balancesByUserId = new Map<string, number>()
  for (const balance of balances) {
    balancesByUserId.set(balance.user_id, Number(balance.balance ?? 0))
  }

  const members: MemberRow[] = (memberships ?? []).map((membership) => {
    const customer = customersByUserId.get(membership.user_id)
    return {
      membership_id: membership.id,
      user_id: membership.user_id,
      tier: membership.tier,
      cadence: membership.cadence,
      status: membership.status,
      current_period_start: membership.current_period_start,
      current_period_end: membership.current_period_end,
      last_paid_at: membership.last_paid_at,
      created_at: membership.created_at,
      customer_email: customer?.email ?? null,
      customer_first_name: customer?.first_name ?? null,
      customer_last_name: customer?.last_name ?? null,
      credit_balance: balancesByUserId.get(membership.user_id) ?? null
    }
  })

  return { members }
})
