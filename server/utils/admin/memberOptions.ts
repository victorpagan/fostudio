import type { H3Event } from 'h3'
import { createError } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

export type AdminMemberOption = {
  userId: string
  name: string | null
  email: string | null
  label: string
  membershipStatus: string | null
  tier: string | null
}

type MembershipRow = {
  user_id: string
  status: string | null
  tier: string | null
  created_at: string
}

type CustomerRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
}

function buildLabel(name: string | null, email: string | null, userId: string) {
  if (name && email) return `${name} (${email})`
  if (name) return name
  if (email) return email
  return userId
}

export async function loadAdminMemberOptions(event: H3Event, limit = 600): Promise<AdminMemberOption[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = serverSupabaseServiceRole(event) as any

  const { data: membershipsData, error: membershipsError } = await supabase
    .from('memberships')
    .select('user_id,status,tier,created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(10, limit))

  if (membershipsError) {
    throw createError({ statusCode: 500, statusMessage: membershipsError.message })
  }

  const memberships = (membershipsData ?? []) as MembershipRow[]
  if (!memberships.length) return []

  const byUserId = new Map<string, MembershipRow>()
  for (const row of memberships) {
    const userId = String(row.user_id ?? '').trim()
    if (!userId || byUserId.has(userId)) continue
    byUserId.set(userId, row)
  }

  const userIds = [...byUserId.keys()]
  if (!userIds.length) return []

  const { data: customersData, error: customersError } = await supabase
    .from('customers')
    .select('user_id,email,first_name,last_name')
    .in('user_id', userIds)

  if (customersError) {
    throw createError({ statusCode: 500, statusMessage: customersError.message })
  }

  const customers = (customersData ?? []) as CustomerRow[]
  const customerByUser = new Map<string, CustomerRow>()
  for (const customer of customers) {
    const userId = String(customer.user_id ?? '').trim()
    if (!userId) continue
    customerByUser.set(userId, customer)
  }

  return userIds
    .map((userId) => {
      const membership = byUserId.get(userId) ?? null
      const customer = customerByUser.get(userId) ?? null
      const name = [customer?.first_name, customer?.last_name].filter(Boolean).join(' ').trim() || null
      const email = customer?.email ?? null

      return {
        userId,
        name,
        email,
        label: buildLabel(name, email, userId),
        membershipStatus: membership?.status ?? null,
        tier: membership?.tier ?? null
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label))
}
