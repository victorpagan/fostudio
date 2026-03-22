import { z } from 'zod'
import { getHeader, getRequestIP } from 'h3'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { getCurrentWaiverStatus } from '~~/server/utils/waiver/status'
import type { Json } from '~~/app/types/database.types'

const bodySchema = z.object({
  signerName: z.string().trim().min(2).max(120),
  accepted: z.literal(true)
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const body = bodySchema.parse(await readBody(event))
  const status = await getCurrentWaiverStatus(event, user.sub)
  if (!status.activeTemplate) {
    throw createError({ statusCode: 503, statusMessage: 'No active waiver template is available right now.' })
  }

  const supabase = serverSupabaseServiceRole(event)
  const nowIso = new Date().toISOString()
  const expiresAt = new Date(nowIso)
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 365)

  const { data: customerRow, error: customerErr } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (customerErr) {
    throw createError({ statusCode: 500, statusMessage: `Failed to load customer context: ${customerErr.message}` })
  }

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? null
  const userAgent = getHeader(event, 'user-agent') ?? null
  const consentFlags = JSON.parse(JSON.stringify({
    accepted: true,
    acceptedAt: nowIso
  })) as Json
  const metadataSnapshot = JSON.parse(JSON.stringify(status.activeTemplate.metadata ?? {})) as Json

  const { error: insertErr } = await supabase
    .from('member_waiver_signatures')
    .insert({
      user_id: user.sub,
      customer_id: customerRow?.id ?? null,
      template_id: status.activeTemplate.id,
      template_version: status.activeTemplate.version,
      signer_name: body.signerName,
      consent_flags: consentFlags,
      signed_at: nowIso,
      expires_at: expiresAt.toISOString(),
      ip,
      user_agent: userAgent,
      waiver_snapshot: status.activeTemplate.body,
      waiver_metadata_snapshot: metadataSnapshot
    })

  if (insertErr) {
    throw createError({ statusCode: 500, statusMessage: `Failed to save waiver signature: ${insertErr.message}` })
  }

  const nextStatus = await getCurrentWaiverStatus(event, user.sub)

  return {
    ok: true,
    status: nextStatus.status,
    renewalNeeded: nextStatus.renewalNeeded,
    latestSignature: nextStatus.latestSignature
      ? {
          id: nextStatus.latestSignature.id,
          signerName: nextStatus.latestSignature.signer_name,
          templateVersion: nextStatus.latestSignature.template_version,
          signedAt: nextStatus.latestSignature.signed_at,
          expiresAt: nextStatus.latestSignature.expires_at
        }
      : null
  }
})
