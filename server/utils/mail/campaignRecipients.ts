import { normalizeMailRecipient } from '~~/server/utils/mail/adminPayload'

export const MAX_CAMPAIGN_RECIPIENTS_PER_SEND = 600
export const CAMPAIGN_SEND_CONCURRENCY = 6

export type CampaignRecipientCampaign = {
  include_membership_recipients: boolean
  additional_recipients: string[] | null
}

type MembershipRow = {
  user_id: string
  tier: string | null
  cadence: string | null
  status: string | null
  current_period_start: string | null
  current_period_end: string | null
  updated_at: string | null
  created_at: string | null
}

type CustomerRow = {
  user_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  door_code: string | null
}

export type CampaignRecipientContext = {
  recipient: string
  source: 'member' | 'extra'
  userId: string | null
  customerName: string | null
  tierName: string | null
  cadence: string | null
  status: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  doorCode: string | null
}

export type CampaignFailedRecipient = {
  recipient: string
  source: CampaignRecipientContext['source']
  message: string
}

export type CampaignSkippedRecipient = {
  recipient: string
  source: CampaignRecipientContext['source']
  reason: string
}

export type CampaignRecipientCounts = {
  totalRecipients: number
  memberRecipients: number
  extraRecipients: number
  sent: number
  skipped: number
  failed: number
}

export type CampaignRecipientDb = {
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string, options?: { ascending?: boolean }) => {
        limit: (value: number) => Promise<{ data: unknown, error: { message: string } | null }>
      }
      in: (column: string, values: string[]) => Promise<{ data: unknown, error: { message: string } | null }>
    }
  }
}

function sortByLatestMembership(a: MembershipRow, b: MembershipRow) {
  const aAt = Date.parse(a.updated_at ?? a.created_at ?? '')
  const bAt = Date.parse(b.updated_at ?? b.created_at ?? '')
  if (Number.isNaN(aAt) && Number.isNaN(bAt)) return 0
  if (Number.isNaN(aAt)) return 1
  if (Number.isNaN(bAt)) return -1
  return bAt - aAt
}

export function summarizeCampaignRecipients(
  recipientContexts: CampaignRecipientContext[],
  sent = 0,
  skipped = 0,
  failed = 0
): CampaignRecipientCounts {
  return {
    totalRecipients: recipientContexts.length,
    memberRecipients: recipientContexts.filter(item => item.source === 'member').length,
    extraRecipients: recipientContexts.filter(item => item.source === 'extra').length,
    sent,
    skipped,
    failed
  }
}

export async function resolveCampaignRecipients(
  db: CampaignRecipientDb,
  campaign: CampaignRecipientCampaign,
  options: {
    testSend?: boolean
    testRecipient?: string
    adminEmail?: string | null
  } = {}
) {
  const recipientsByEmail = new Map<string, CampaignRecipientContext>()

  if (options.testSend) {
    const testRecipient = normalizeMailRecipient(options.testRecipient) ?? normalizeMailRecipient(options.adminEmail)
    if (testRecipient) {
      recipientsByEmail.set(testRecipient, {
        recipient: testRecipient,
        source: 'extra',
        userId: null,
        customerName: null,
        tierName: null,
        cadence: null,
        status: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        doorCode: null
      })
    }
    return [...recipientsByEmail.values()]
  }

  if (campaign.include_membership_recipients) {
    const membershipsResult = await db
      .from('memberships')
      .select('user_id,tier,cadence,status,current_period_start,current_period_end,updated_at,created_at')
      .order('updated_at', { ascending: false })
      .limit(5000)

    if (membershipsResult.error) {
      throw createError({ statusCode: 500, statusMessage: membershipsResult.error.message })
    }

    const memberships = (membershipsResult.data ?? []) as MembershipRow[]
    memberships.sort(sortByLatestMembership)

    const membershipByUserId = new Map<string, MembershipRow>()
    for (const membership of memberships) {
      if (!membershipByUserId.has(membership.user_id)) {
        membershipByUserId.set(membership.user_id, membership)
      }
    }

    const userIds = [...membershipByUserId.keys()]
    if (userIds.length > 0) {
      const customersResult = await db
        .from('customers')
        .select('user_id,email,first_name,last_name,door_code')
        .in('user_id', userIds)

      if (customersResult.error) {
        throw createError({ statusCode: 500, statusMessage: customersResult.error.message })
      }

      const customers = (customersResult.data ?? []) as CustomerRow[]
      const customerByUserId = new Map(customers.map(customer => [customer.user_id, customer]))

      for (const [userId, membership] of membershipByUserId.entries()) {
        const customer = customerByUserId.get(userId)
        const recipient = normalizeMailRecipient(customer?.email)
        if (!recipient) continue
        if (recipientsByEmail.has(recipient)) continue

        const customerName = [
          String(customer?.first_name ?? '').trim(),
          String(customer?.last_name ?? '').trim()
        ]
          .filter(Boolean)
          .join(' ')
          .trim() || null

        recipientsByEmail.set(recipient, {
          recipient,
          source: 'member',
          userId,
          customerName,
          tierName: String(membership.tier ?? '').trim() || null,
          cadence: String(membership.cadence ?? '').trim() || null,
          status: String(membership.status ?? '').trim() || null,
          currentPeriodStart: membership.current_period_start ?? null,
          currentPeriodEnd: membership.current_period_end ?? null,
          doorCode: String(customer?.door_code ?? '').trim() || null
        })
      }
    }
  }

  for (const extra of campaign.additional_recipients ?? []) {
    const recipient = normalizeMailRecipient(extra)
    if (!recipient) continue
    if (recipientsByEmail.has(recipient)) continue
    recipientsByEmail.set(recipient, {
      recipient,
      source: 'extra',
      userId: null,
      customerName: null,
      tierName: null,
      cadence: null,
      status: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      doorCode: null
    })
  }

  return [...recipientsByEmail.values()]
}

export async function runCampaignSendWithConcurrency<T>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<void>
) {
  if (!values.length) return
  let cursor = 0
  const poolSize = Math.max(1, Math.min(limit, values.length))
  const runners = Array.from({ length: poolSize }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      await worker(values[index] as T)
    }
  })
  await Promise.all(runners)
}
