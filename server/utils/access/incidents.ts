import { getRequestURL, type H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'
import { normalizeMailRecipient } from '~~/server/utils/mail/adminPayload'

export type AccessIncidentInput = {
  incidentType: string
  severity?: 'warning' | 'error' | 'critical'
  title: string
  message?: string | null
  userId?: string | null
  bookingId?: string | null
  metadata?: Record<string, unknown>
}

type MailAdminCopyPreferencesRow = {
  recipients: string[] | null
}

type SupabaseAccessIncidentClient = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: { id?: string | null } | null
          error: { message: string } | null
        }>
      }
    }
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: unknown
          error: { message: string } | null
        }>
      }
    }
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll(/'/g, '&#39;')
}

async function resolveAccessIncidentRecipient(event: H3Event, supabase: SupabaseAccessIncidentClient) {
  const config = useRuntimeConfig(event)
  const fallbackRecipient = normalizeMailRecipient(config.contactToEmail as string | undefined)

  const { data, error } = await supabase
    .from('mail_admin_copy_preferences')
    .select('recipients')
    .eq('scope', 'global')
    .maybeSingle()

  if (error) {
    console.warn('[access/incident] failed to load admin mail recipients', {
      message: error.message
    })
    return fallbackRecipient
  }

  const prefRow = (data ?? null) as MailAdminCopyPreferencesRow | null
  const prefRecipient = Array.isArray(prefRow?.recipients)
    ? prefRow.recipients.map(value => normalizeMailRecipient(value)).find(Boolean) ?? null
    : null

  return fallbackRecipient ?? prefRecipient
}

function buildAccessIncidentBody(input: AccessIncidentInput, incidentId: string | null, createdAt: string, incidentUrl: string) {
  const metadataText = JSON.stringify(input.metadata ?? {}, null, 2)
  const clippedMetadata = metadataText.length > 4000 ? `${metadataText.slice(0, 4000)}...` : metadataText
  const messageHtml = input.message ? `<p style="margin:0 0 14px;">${escapeHtml(input.message)}</p>` : ''
  const metadataHtml = clippedMetadata !== '{}'
    ? `<p style="margin:0 0 8px;"><strong>Metadata</strong></p><pre style="white-space:pre-wrap;background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin:0 0 16px;">${escapeHtml(clippedMetadata)}</pre>`
    : ''

  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">',
    '<h1 style="font-size:24px;margin:0 0 12px;">Access incident recorded</h1>',
    `<p style="margin:0 0 14px;"><strong>${escapeHtml(input.title)}</strong></p>`,
    messageHtml,
    '<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">',
    `<p style="margin:0 0 8px;"><strong>Incident ID:</strong> ${escapeHtml(incidentId ?? 'Not returned')}</p>`,
    `<p style="margin:0 0 8px;"><strong>Type:</strong> ${escapeHtml(input.incidentType)}</p>`,
    `<p style="margin:0 0 8px;"><strong>Severity:</strong> ${escapeHtml(input.severity ?? 'error')}</p>`,
    `<p style="margin:0 0 8px;"><strong>User ID:</strong> ${escapeHtml(input.userId ?? 'None')}</p>`,
    `<p style="margin:0 0 8px;"><strong>Booking ID:</strong> ${escapeHtml(input.bookingId ?? 'None')}</p>`,
    `<p style="margin:0;"><strong>Created:</strong> ${escapeHtml(createdAt)}</p>`,
    '</div>',
    metadataHtml,
    `<p style="margin:0;"><a href="${escapeHtml(incidentUrl)}">Open admin operations</a></p>`,
    '</div>'
  ].join('')
}

export async function createAccessIncident(event: H3Event, input: AccessIncidentInput) {
  const supabase = serverSupabaseServiceRole(event) as unknown as SupabaseAccessIncidentClient
  const nowIso = new Date().toISOString()

  const { data: inserted, error } = await supabase
    .from('lock_access_incidents')
    .insert({
      incident_type: input.incidentType,
      severity: input.severity ?? 'error',
      status: 'open',
      title: input.title,
      message: input.message ?? null,
      user_id: input.userId ?? null,
      booking_id: input.bookingId ?? null,
      metadata: input.metadata ?? {},
      created_at: nowIso,
      updated_at: nowIso
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  try {
    const to = await resolveAccessIncidentRecipient(event, supabase)
    if (!to) {
      console.warn('[access/incident] email dispatch skipped: no admin recipient configured', {
        incidentType: input.incidentType
      })
      return {
        id: inserted?.id ?? null,
        createdAt: nowIso
      }
    }

    const origin = getRequestURL(event).origin
    const incidentUrl = `${origin}/dashboard/admin`
    const bodyHtml = buildAccessIncidentBody(input, inserted?.id ?? null, nowIso, incidentUrl)

    await sendViaFomailer(event, {
      type: 'mailing.memberBroadcast',
      payload: {
        to,
        eventType: 'mailing.memberBroadcast',
        skipRegistryCopyOverrides: true,
        subject: `Access incident: ${input.title}`,
        preheader: `${input.severity ?? 'error'} access incident: ${input.incidentType}`,
        body: bodyHtml,
        bodyHtml,
        bodyHTML: bodyHtml,
        incidentId: inserted?.id ?? null,
        incidentType: input.incidentType,
        severity: input.severity ?? 'error',
        title: input.title,
        message: input.message ?? null,
        userId: input.userId ?? null,
        bookingId: input.bookingId ?? null,
        metadata: input.metadata ?? {},
        createdAt: nowIso
      }
    })
  } catch (error) {
    console.warn('[access/incident] email dispatch failed (non-blocking)', {
      incidentType: input.incidentType,
      error: (error as Error)?.message ?? String(error)
    })
  }

  return {
    id: inserted?.id ?? null,
    createdAt: nowIso
  }
}
