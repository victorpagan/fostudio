import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import {
  MAX_CAMPAIGN_RECIPIENTS_PER_SEND,
  resolveCampaignRecipients,
  summarizeCampaignRecipients
} from '~~/server/utils/mail/campaignRecipients'

const bodySchema = z.object({
  campaignId: z.string().uuid()
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

function resolveAudienceMode(campaign: CampaignRow) {
  const hasMembers = Boolean(campaign.include_membership_recipients)
  const hasExtra = Array.isArray(campaign.additional_recipients) && campaign.additional_recipients.length > 0
  if (hasMembers && hasExtra) return 'members_and_alternates'
  if (hasMembers) return 'members'
  if (hasExtra) return 'alternates_only'
  return 'none'
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

  const errors: string[] = []
  const warnings: string[] = []
  const templateId = String(campaign.sendgrid_template_id ?? '').trim()
  const subject = String(campaign.subject_template ?? '').trim()

  if (campaign.status === 'archived') {
    errors.push('Archived campaigns cannot be sent.')
  }
  if (!templateId) {
    errors.push('Campaign is missing a SendGrid template id.')
  }
  if (!subject) {
    warnings.push('Campaign subject is empty.')
  }
  if (campaign.status === 'sent') {
    warnings.push('This campaign has already been marked sent.')
  }

  const recipientContexts = await resolveCampaignRecipients(db, campaign)
  const counts = summarizeCampaignRecipients(recipientContexts)

  if (recipientContexts.length === 0) {
    errors.push('No valid recipients resolved from campaign settings.')
  }
  if (recipientContexts.length > MAX_CAMPAIGN_RECIPIENTS_PER_SEND) {
    errors.push(`Too many recipients (${recipientContexts.length}). Reduce to ${MAX_CAMPAIGN_RECIPIENTS_PER_SEND} or fewer.`)
  }

  return {
    ok: errors.length === 0,
    canSend: errors.length === 0,
    campaignId: campaign.id,
    campaignName: campaign.name,
    status: campaign.status,
    eventType: campaign.event_type,
    templateId,
    renderMode: campaign.render_mode,
    subject,
    preheader: campaign.preheader_template ?? '',
    audienceMode: resolveAudienceMode(campaign),
    includeMembershipRecipients: Boolean(campaign.include_membership_recipients),
    counts,
    warnings,
    errors
  }
})
