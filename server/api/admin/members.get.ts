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
  waiver_status: 'current' | 'expired' | 'missing' | 'stale_version'
  waiver_signed_at: string | null
  waiver_expires_at: string | null
  waiver_signer_name: string | null
  waiver_version: number | null
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
  const now = new Date()

  const { data: activeWaiverTemplate, error: activeWaiverTemplateErr } = await supabase
    .from('waiver_templates')
    .select('id,version')
    .eq('is_active', true)
    .order('published_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeWaiverTemplateErr) {
    throw createError({ statusCode: 500, statusMessage: activeWaiverTemplateErr.message })
  }

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
  type WaiverSignatureRow = {
    user_id: string
    template_id: string
    template_version: number
    signer_name: string
    signed_at: string
    expires_at: string
  }

  const userIds = [...new Set((memberships ?? []).map(row => row.user_id))]
  let customers: CustomerRow[] = []
  let balances: BalanceRow[] = []
  let doorCodeRequests: DoorCodeRequestRow[] = []
  let waiverSignatures: WaiverSignatureRow[] = []

  if (userIds.length) {
    const [customersRes, balancesRes, doorCodeRequestsRes, waiverSignaturesRes] = await Promise.all([
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
        .order('requested_at', { ascending: false }),
      supabase
        .from('member_waiver_signatures')
        .select('user_id,template_id,template_version,signer_name,signed_at,expires_at')
        .in('user_id', userIds)
        .order('signed_at', { ascending: false })
    ])

    if (customersRes.error) throw createError({ statusCode: 500, statusMessage: customersRes.error.message })
    if (balancesRes.error) throw createError({ statusCode: 500, statusMessage: balancesRes.error.message })
    if (doorCodeRequestsRes.error) throw createError({ statusCode: 500, statusMessage: doorCodeRequestsRes.error.message })
    if (waiverSignaturesRes.error) throw createError({ statusCode: 500, statusMessage: waiverSignaturesRes.error.message })

    customers = (customersRes.data ?? []) as CustomerRow[]
    balances = (balancesRes.data ?? []) as BalanceRow[]
    doorCodeRequests = (doorCodeRequestsRes.data ?? []) as DoorCodeRequestRow[]
    waiverSignatures = (waiverSignaturesRes.data ?? []) as WaiverSignatureRow[]
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
  const latestWaiverSignatureByUserId = new Map<string, WaiverSignatureRow>()
  for (const signature of waiverSignatures) {
    if (!latestWaiverSignatureByUserId.has(signature.user_id)) {
      latestWaiverSignatureByUserId.set(signature.user_id, signature)
    }
  }

  const members: MemberRow[] = (memberships ?? []).map((membership) => {
    const customer = customersByUserId.get(membership.user_id)
    const latestDoorCodeRequest = latestDoorCodeRequestByUserId.get(membership.user_id)
    const latestWaiverSignature = latestWaiverSignatureByUserId.get(membership.user_id)

    let waiverStatus: MemberRow['waiver_status'] = 'missing'
    if (activeWaiverTemplate && latestWaiverSignature) {
      if (latestWaiverSignature.template_id !== activeWaiverTemplate.id) {
        waiverStatus = 'stale_version'
      } else {
        const expiresAtTs = Date.parse(latestWaiverSignature.expires_at)
        waiverStatus = Number.isNaN(expiresAtTs) || expiresAtTs <= now.getTime() ? 'expired' : 'current'
      }
    }

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
      credit_balance: balancesByUserId.get(membership.user_id) ?? null,
      waiver_status: waiverStatus,
      waiver_signed_at: latestWaiverSignature?.signed_at ?? null,
      waiver_expires_at: latestWaiverSignature?.expires_at ?? null,
      waiver_signer_name: latestWaiverSignature?.signer_name ?? null,
      waiver_version: latestWaiverSignature ? Number(latestWaiverSignature.template_version ?? 0) : null
    }
  })

  return { members }
})
