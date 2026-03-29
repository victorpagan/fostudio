import { z } from 'zod'
import { getRequestURL } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'
import {
  buildAdminMailPayload,
  formatCadenceLabel,
  formatHumanDate,
  normalizeMailRecipient
} from '~~/server/utils/mail/adminPayload'

const MAX_RECIPIENTS_PER_SEND = 600
const SEND_CONCURRENCY = 6

const bodySchema = z.object({
  campaignId: z.string().uuid(),
  markSent: z.coerce.boolean().default(true)
})

type CampaignRow = {
  id: string
  name: string
  status: 'draft' | 'sent' | 'archived'
  event_type: string
  sendgrid_template_id: string
  render_mode: 'editor_html' | 'sendgrid_native'
  subject_template: string
  preheader_template: string
  body_template: string
  dynamic_data_json: Record<string, unknown> | null
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

type RecipientContext = {
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

type FailedRecipient = {
  recipient: string
  source: RecipientContext['source']
  message: string
}

function sortByLatestMembership(a: MembershipRow, b: MembershipRow) {
  const aAt = Date.parse(a.updated_at ?? a.created_at ?? '')
  const bAt = Date.parse(b.updated_at ?? b.created_at ?? '')
  if (Number.isNaN(aAt) && Number.isNaN(bAt)) return 0
  if (Number.isNaN(aAt)) return 1
  if (Number.isNaN(bAt)) return -1
  return bAt - aAt
}

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const value = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  }
  return value.data?.statusMessage ?? value.statusMessage ?? value.message ?? 'Unknown error'
}

function resolvePathValue(source: unknown, path: string): unknown {
  if (!path) return undefined
  const segments = path.split('.').filter(Boolean)
  let cursor: unknown = source
  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object' || !(segment in cursor)) {
      return undefined
    }
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

function renderTemplate(template: string, context: Record<string, unknown>) {
  return template.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, token: string) => {
    const value = resolvePathValue(context, token)
    if (value == null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return ''
  })
}

function renderDynamicValue(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    return renderTemplate(value, context)
  }
  if (Array.isArray(value)) {
    return value.map(item => renderDynamicValue(item, context))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, renderDynamicValue(item, context)])
    )
  }
  return value
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

async function runWithConcurrency<T>(
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

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: unknown, error: { message: string } | null }>
        }
        order: (column: string, options?: { ascending?: boolean }) => {
          limit: (value: number) => Promise<{ data: unknown, error: { message: string } | null }>
        }
        in: (column: string, values: string[]) => Promise<{ data: unknown, error: { message: string } | null }>
      }
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => Promise<{ data: unknown, error: { message: string } | null }>
      }
    }
  }

  const body = bodySchema.parse(await readBody(event))

  const campaignLookup = await db
    .from('mail_campaigns')
    .select('id,name,status,event_type,sendgrid_template_id,render_mode,subject_template,preheader_template,body_template,dynamic_data_json,include_membership_recipients,additional_recipients')
    .eq('id', body.campaignId)
    .maybeSingle()

  if (campaignLookup.error) {
    throw createError({ statusCode: 500, statusMessage: `Could not load campaign: ${campaignLookup.error.message}` })
  }

  const campaign = (campaignLookup.data ?? null) as CampaignRow | null
  if (!campaign) {
    throw createError({ statusCode: 404, statusMessage: 'Campaign not found.' })
  }

  if (campaign.status === 'archived') {
    throw createError({ statusCode: 400, statusMessage: 'Archived campaigns cannot be sent.' })
  }

  const templateId = String(campaign.sendgrid_template_id ?? '').trim()
  if (!templateId) {
    throw createError({ statusCode: 400, statusMessage: 'Campaign is missing a SendGrid template id.' })
  }

  const recipientsByEmail = new Map<string, RecipientContext>()

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

  const recipientContexts = [...recipientsByEmail.values()]
  if (recipientContexts.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No valid recipients resolved from campaign settings.'
    })
  }

  if (recipientContexts.length > MAX_RECIPIENTS_PER_SEND) {
    throw createError({
      statusCode: 400,
      statusMessage: `Too many recipients (${recipientContexts.length}). Reduce to ${MAX_RECIPIENTS_PER_SEND} or fewer.`
    })
  }

  const origin = getRequestURL(event).origin
  const failedRecipients: FailedRecipient[] = []
  const skippedRecipients: Array<{ recipient: string, source: RecipientContext['source'], reason: string }> = []
  let sentCount = 0

  await runWithConcurrency(recipientContexts, SEND_CONCURRENCY, async (context) => {
    const payload = buildAdminMailPayload({
      eventType: campaign.event_type,
      recipient: context.recipient,
      userId: context.userId ?? 'admin-broadcast',
      templateId,
      origin
    }) as Record<string, unknown>

    if (!context.userId) {
      delete payload.userId
      payload.customerEmail = context.recipient
      payload.guestEmail = context.recipient
      payload.customerName = null
      payload.guestName = null
      payload.doorCode = null
      payload.tierId = null
      payload.tierName = null
      payload.membershipPlanName = null
      payload.currentPeriodStart = null
      payload.currentPeriodEnd = null
      payload.startPeriodHuman = null
      payload.endPeriodHuman = null
    } else {
      payload.userId = context.userId
      payload.customerEmail = context.recipient
      payload.guestEmail = context.recipient
      if (context.customerName) {
        payload.customerName = context.customerName
        payload.guestName = context.customerName
      }
      if (context.tierName) {
        payload.tierId = context.tierName
        payload.tierName = context.tierName
        payload.membershipPlanName = context.tierName
      }
      if (context.cadence) {
        payload.cadence = context.cadence
        payload.cadenceLabel = formatCadenceLabel(context.cadence)
      }
      if (context.status) {
        payload.squareStatus = context.status
      }
      if (context.currentPeriodStart) {
        payload.currentPeriodStart = context.currentPeriodStart
        payload.startPeriodHuman = formatHumanDate(context.currentPeriodStart)
      }
      if (context.currentPeriodEnd) {
        payload.currentPeriodEnd = context.currentPeriodEnd
        payload.endPeriodHuman = formatHumanDate(context.currentPeriodEnd)
      }
      if (context.doorCode) {
        payload.doorCode = context.doorCode
      }
    }

    const renderedDynamicData = renderDynamicValue(asRecord(campaign.dynamic_data_json), payload)
    Object.assign(payload, asRecord(renderedDynamicData))

    const renderedSubject = renderTemplate(String(campaign.subject_template ?? ''), payload).trim()
    const renderedPreheader = renderTemplate(String(campaign.preheader_template ?? ''), payload).trim()
    const renderedBody = renderTemplate(String(campaign.body_template ?? ''), payload).trim()

    if (renderedSubject) payload.subject = renderedSubject
    if (renderedPreheader) payload.preheader = renderedPreheader
    if (renderedBody) {
      payload.body = renderedBody
      payload.bodyHtml = renderedBody
      payload.bodyHTML = renderedBody
    }

    try {
      const sendResult = await sendViaFomailer(event, {
        body: {
          type: campaign.event_type,
          payload
        }
      })

      if (!sendResult.ok) {
        failedRecipients.push({
          recipient: context.recipient,
          source: context.source,
          message: sendResult.reason ?? 'mailer_not_configured'
        })
        return
      }

      const response = sendResult.data as {
        sent_customer?: boolean
        skipped_reason?: string
      }

      if (response?.sent_customer === false || response?.skipped_reason) {
        skippedRecipients.push({
          recipient: context.recipient,
          source: context.source,
          reason: response?.skipped_reason ?? 'not_sent'
        })
        return
      }

      sentCount += 1
    } catch (error: unknown) {
      failedRecipients.push({
        recipient: context.recipient,
        source: context.source,
        message: readErrorMessage(error)
      })
    }
  })

  const summary = {
    totalRecipients: recipientContexts.length,
    memberRecipients: recipientContexts.filter(item => item.source === 'member').length,
    extraRecipients: recipientContexts.filter(item => item.source === 'extra').length,
    sent: sentCount,
    skipped: skippedRecipients.length,
    failed: failedRecipients.length
  }

  if (body.markSent) {
    const nextStatus = sentCount > 0 ? 'sent' : campaign.status
    const updateResult = await db
      .from('mail_campaigns')
      .update({
        status: nextStatus,
        last_send_summary: summary,
        last_sent_at: sentCount > 0 ? new Date().toISOString() : null
      })
      .eq('id', campaign.id)

    if (updateResult.error) {
      throw createError({
        statusCode: 500,
        statusMessage: `Campaign send completed but could not update campaign status: ${updateResult.error.message}`
      })
    }
  }

  return {
    ok: true,
    campaignId: campaign.id,
    campaignName: campaign.name,
    eventType: campaign.event_type,
    templateId,
    includeMembershipRecipients: campaign.include_membership_recipients,
    counts: summary,
    failedRecipients,
    skippedRecipients
  }
})
