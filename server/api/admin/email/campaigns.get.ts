import { requireServerAdmin } from '~~/server/utils/auth'
import { getAvailableVariablesByEvent } from '~~/server/utils/mail/templateVariables'

type CampaignTemplateRow = {
  id: string
  slug: string
  name: string
  description: string | null
  event_type: string
  sendgrid_template_id: string
  subject_template: string
  preheader_template: string
  body_template: string
  render_mode: 'editor_html' | 'sendgrid_native'
  dynamic_data_template: Record<string, unknown> | null
  active: boolean
  updated_at: string
  created_at: string
}

type CampaignRow = {
  id: string
  name: string
  status: 'draft' | 'sent' | 'archived'
  template_id: string | null
  event_type: string
  sendgrid_template_id: string
  subject_template: string
  preheader_template: string
  body_template: string
  render_mode: 'editor_html' | 'sendgrid_native'
  dynamic_data_json: Record<string, unknown> | null
  include_membership_recipients: boolean
  additional_recipients: string[] | null
  last_send_summary: Record<string, unknown> | null
  last_sent_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (column: string, options?: { ascending?: boolean }) => PromiseLike<{ data: unknown, error: { message: string } | null }>
      }
    }
  }

  const [templateResult, campaignResult] = await Promise.all([
    db
      .from('mail_campaign_templates')
      .select('id,slug,name,description,event_type,sendgrid_template_id,subject_template,preheader_template,body_template,render_mode,dynamic_data_template,active,updated_at,created_at')
      .order('name', { ascending: true }),
    db
      .from('mail_campaigns')
      .select('id,name,status,template_id,event_type,sendgrid_template_id,subject_template,preheader_template,body_template,render_mode,dynamic_data_json,include_membership_recipients,additional_recipients,last_send_summary,last_sent_at,created_by,created_at,updated_at')
      .order('updated_at', { ascending: false })
  ])

  if (templateResult.error) {
    throw createError({ statusCode: 500, statusMessage: `Could not load campaign templates: ${templateResult.error.message}` })
  }

  if (campaignResult.error) {
    throw createError({ statusCode: 500, statusMessage: `Could not load campaigns: ${campaignResult.error.message}` })
  }

  const templates = ((templateResult.data ?? []) as CampaignTemplateRow[]).map(template => ({
    id: template.id,
    slug: template.slug,
    name: template.name,
    description: template.description ?? '',
    eventType: template.event_type,
    sendgridTemplateId: template.sendgrid_template_id ?? '',
    subjectTemplate: template.subject_template ?? '',
    preheaderTemplate: template.preheader_template ?? '',
    bodyTemplate: template.body_template ?? '',
    renderMode: template.render_mode ?? 'editor_html',
    dynamicDataTemplate: (template.dynamic_data_template && typeof template.dynamic_data_template === 'object' && !Array.isArray(template.dynamic_data_template))
      ? template.dynamic_data_template
      : {},
    active: Boolean(template.active),
    updatedAt: template.updated_at,
    createdAt: template.created_at
  }))

  const campaigns = ((campaignResult.data ?? []) as CampaignRow[]).map(campaign => ({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    templateId: campaign.template_id,
    eventType: campaign.event_type,
    sendgridTemplateId: campaign.sendgrid_template_id ?? '',
    subjectTemplate: campaign.subject_template ?? '',
    preheaderTemplate: campaign.preheader_template ?? '',
    bodyTemplate: campaign.body_template ?? '',
    renderMode: campaign.render_mode ?? 'editor_html',
    dynamicData: (campaign.dynamic_data_json && typeof campaign.dynamic_data_json === 'object' && !Array.isArray(campaign.dynamic_data_json))
      ? campaign.dynamic_data_json
      : {},
    includeMembershipRecipients: Boolean(campaign.include_membership_recipients),
    additionalRecipients: Array.isArray(campaign.additional_recipients)
      ? campaign.additional_recipients.filter(value => typeof value === 'string' && value.trim().length > 0)
      : [],
    lastSendSummary: campaign.last_send_summary ?? null,
    lastSentAt: campaign.last_sent_at,
    createdBy: campaign.created_by,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at
  }))

  return {
    templates,
    campaigns,
    availableVariablesByEvent: getAvailableVariablesByEvent()
  }
})
