import { serverSupabaseUser } from '#supabase/server'
import { getCurrentWaiverStatus } from '~~/server/utils/waiver/status'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const status = await getCurrentWaiverStatus(event, user.sub)

  return {
    status: status.status,
    renewalNeeded: status.renewalNeeded,
    activeTemplate: status.activeTemplate
      ? {
          id: status.activeTemplate.id,
          version: status.activeTemplate.version,
          title: status.activeTemplate.title,
          body: status.activeTemplate.body,
          metadata: status.activeTemplate.metadata ?? {},
          publishedAt: status.activeTemplate.published_at,
          createdAt: status.activeTemplate.created_at
        }
      : null,
    latestSignature: status.latestSignature
      ? {
          id: status.latestSignature.id,
          signerName: status.latestSignature.signer_name,
          templateId: status.latestSignature.template_id,
          templateVersion: status.latestSignature.template_version,
          signedAt: status.latestSignature.signed_at,
          expiresAt: status.latestSignature.expires_at,
          consentFlags: status.latestSignature.consent_flags ?? {}
        }
      : null
  }
})
