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
const BROADCAST_EVENT_TYPE = 'mailing.memberBroadcast'

const bodySchema = z.object({
  eventType: z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._-]+$/).optional().default(BROADCAST_EVENT_TYPE),
  includeMembershipRecipients: z.coerce.boolean().default(true),
  additionalRecipients: z.array(z.string().trim().email().max(320)).max(1000).default([])
})

type MailTemplateRegistryRow = {
  event_type: string
  sendgrid_template_id: string
  active: boolean
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
  const body = bodySchema.parse(await readBody(event))
  if (body.eventType !== BROADCAST_EVENT_TYPE) {
    throw createError({
      statusCode: 400,
      statusMessage: `eventType must be ${BROADCAST_EVENT_TYPE}`
    })
  }

  const { data: templateRowRaw, error: templateError } = await supabase
    .from('mail_template_registry')
    .select('event_type,sendgrid_template_id,active')
    .eq('event_type', body.eventType)
    .maybeSingle()

  if (templateError) throw createError({ statusCode: 500, statusMessage: templateError.message })

  const templateRow = (templateRowRaw ?? null) as MailTemplateRegistryRow | null
  const templateId = String(templateRow?.sendgrid_template_id ?? '').trim()
  if (!templateId) {
    throw createError({
      statusCode: 400,
      statusMessage: `No SendGrid template id configured for ${body.eventType}`
    })
  }

  if (templateRow?.active === false) {
    throw createError({
      statusCode: 400,
      statusMessage: `${body.eventType} is currently inactive in the registry`
    })
  }

  const recipientsByEmail = new Map<string, RecipientContext>()

  if (body.includeMembershipRecipients) {
    const { data: membershipsRaw, error: membershipsError } = await supabase
      .from('memberships')
      .select('user_id,tier,cadence,status,current_period_start,current_period_end,updated_at,created_at')
      .order('updated_at', { ascending: false })
      .limit(5000)

    if (membershipsError) {
      throw createError({ statusCode: 500, statusMessage: membershipsError.message })
    }

    const memberships = (membershipsRaw ?? []) as MembershipRow[]
    memberships.sort(sortByLatestMembership)

    const membershipByUserId = new Map<string, MembershipRow>()
    for (const membership of memberships) {
      if (!membershipByUserId.has(membership.user_id)) {
        membershipByUserId.set(membership.user_id, membership)
      }
    }

    const userIds = [...membershipByUserId.keys()]
    if (userIds.length > 0) {
      const { data: customersRaw, error: customersError } = await supabase
        .from('customers')
        .select('user_id,email,first_name,last_name,door_code')
        .in('user_id', userIds)

      if (customersError) {
        throw createError({ statusCode: 500, statusMessage: customersError.message })
      }

      const customers = (customersRaw ?? []) as CustomerRow[]
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

  for (const extraRecipient of body.additionalRecipients) {
    const recipient = normalizeMailRecipient(extraRecipient)
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
      statusMessage: 'No valid recipients resolved from memberships or additional recipient list'
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
      eventType: body.eventType,
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
      if (context.currentPeriodStart) {
        payload.currentPeriodStart = context.currentPeriodStart
        payload.startPeriodHuman = formatHumanDate(context.currentPeriodStart)
      }
      if (context.currentPeriodEnd) {
        payload.currentPeriodEnd = context.currentPeriodEnd
        payload.endPeriodHuman = formatHumanDate(context.currentPeriodEnd)
      }
      if (context.status) {
        payload.squareStatus = context.status.toUpperCase()
      }
      if (context.doorCode) {
        payload.doorCode = context.doorCode
      }
    }

    const customerPayload = payload.customer
    if (customerPayload && typeof customerPayload === 'object' && !Array.isArray(customerPayload)) {
      payload.customer = {
        ...(customerPayload as Record<string, unknown>),
        emailAddress: context.recipient
      }
    }

    try {
      const sendResult = await sendViaFomailer(event, {
        type: body.eventType,
        payload
      })

      if (!sendResult.ok) {
        failedRecipients.push({
          recipient: context.recipient,
          source: context.source,
          message: `Mailer preflight failed: ${sendResult.reason ?? 'unknown'}`
        })
        return
      }

      const mailerData = (sendResult.data ?? null) as { skipped_reason?: unknown } | null
      const skippedReason = typeof mailerData?.skipped_reason === 'string'
        ? mailerData.skipped_reason
        : null

      if (skippedReason) {
        skippedRecipients.push({
          recipient: context.recipient,
          source: context.source,
          reason: skippedReason
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

  return {
    ok: true,
    eventType: body.eventType,
    includeMembershipRecipients: body.includeMembershipRecipients,
    templateId,
    counts: {
      totalRecipients: recipientContexts.length,
      memberRecipients: recipientContexts.filter(ctx => ctx.source === 'member').length,
      extraRecipients: recipientContexts.filter(ctx => ctx.source === 'extra').length,
      sent: sentCount,
      skipped: skippedRecipients.length,
      failed: failedRecipients.length
    },
    failedRecipients: failedRecipients.slice(0, 100),
    skippedRecipients: skippedRecipients.slice(0, 100)
  }
})
