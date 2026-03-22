import type { H3Event } from 'h3'
import { createError } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

export type WaiverStatusCode = 'current' | 'expired' | 'missing' | 'stale_version'

type WaiverTemplateRow = {
  id: string
  version: number
  title: string
  body: string
  metadata: Record<string, unknown> | null
  published_at: string | null
  created_at: string
}

type WaiverSignatureRow = {
  id: string
  template_id: string
  template_version: number
  signer_name: string
  signed_at: string
  expires_at: string
  consent_flags: Record<string, unknown> | null
}

export type WaiverStatusResult = {
  status: WaiverStatusCode
  activeTemplate: WaiverTemplateRow | null
  latestSignature: WaiverSignatureRow | null
  renewalNeeded: boolean
}

function isExpired(isoValue: string | null | undefined) {
  if (!isoValue) return true
  const ts = Date.parse(isoValue)
  if (Number.isNaN(ts)) return true
  return ts <= Date.now()
}

export async function getCurrentWaiverStatus(event: H3Event, userId: string): Promise<WaiverStatusResult> {
  const supabase = serverSupabaseServiceRole(event)

  const [{ data: activeTemplate, error: templateErr }, { data: latestSignature, error: signatureErr }] = await Promise.all([
    supabase
      .from('waiver_templates')
      .select('id,version,title,body,metadata,published_at,created_at')
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('member_waiver_signatures')
      .select('id,template_id,template_version,signer_name,signed_at,expires_at,consent_flags')
      .eq('user_id', userId)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ])

  if (templateErr) {
    throw createError({ statusCode: 500, statusMessage: `Failed to load active waiver template: ${templateErr.message}` })
  }
  if (signatureErr) {
    throw createError({ statusCode: 500, statusMessage: `Failed to load waiver signature status: ${signatureErr.message}` })
  }

  const typedTemplate = (activeTemplate ?? null) as WaiverTemplateRow | null
  const typedSignature = (latestSignature ?? null) as WaiverSignatureRow | null

  let status: WaiverStatusCode = 'missing'
  if (typedTemplate && typedSignature) {
    if (typedSignature.template_id !== typedTemplate.id) {
      status = 'stale_version'
    } else if (isExpired(typedSignature.expires_at)) {
      status = 'expired'
    } else {
      status = 'current'
    }
  } else if (!typedTemplate) {
    status = 'missing'
  } else if (!typedSignature) {
    status = 'missing'
  }

  return {
    status,
    activeTemplate: typedTemplate,
    latestSignature: typedSignature,
    renewalNeeded: status !== 'current'
  }
}

export async function assertCurrentWaiver(event: H3Event, userId: string) {
  const status = await getCurrentWaiverStatus(event, userId)
  if (status.status === 'current') return status

  throw createError({
    statusCode: 428,
    statusMessage: 'Waiver signature is required before booking.',
    data: {
      code: 'WAIVER_REQUIRED',
      waiverStatus: status.status,
      activeTemplateVersion: status.activeTemplate?.version ?? null,
      signedTemplateVersion: status.latestSignature?.template_version ?? null,
      signedAt: status.latestSignature?.signed_at ?? null,
      expiresAt: status.latestSignature?.expires_at ?? null
    }
  })
}
