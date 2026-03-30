import { z } from 'zod'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'

const bodySchema = z.object({
  email: z.string().trim().email().max(320)
})

function stripWrappingQuotes(value: string | undefined) {
  const raw = (value ?? '').trim()
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith('\'') && raw.endsWith('\''))) {
    return raw.slice(1, -1).trim()
  }
  return raw
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll(/'/g, '&#39;')
}

function normalizeErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  const details = error as {
    statusMessage?: string
    message?: string
    data?: unknown
    response?: { _data?: unknown }
  }
  const payload = details.data ?? details.response?._data
  const payloadText = payload == null
    ? ''
    : (typeof payload === 'string' ? payload : JSON.stringify(payload))
  return [details.statusMessage, details.message, payloadText]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .trim()
}

function isUserNotFoundError(error: unknown) {
  const corpus = normalizeErrorMessage(error).toLowerCase()
  return corpus.includes('user_not_found') || corpus.includes('user with this email not found')
}

function isRecoverSendFailure(error: unknown) {
  const corpus = normalizeErrorMessage(error).toLowerCase()
  return corpus.includes('error sending recovery email')
    || corpus.includes('unexpected_failure')
    || corpus.includes('status 500')
}

export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid recovery request payload',
      data: parsed.error.flatten()
    })
  }

  const email = parsed.data.email.trim().toLowerCase()
  const runtimeConfig = useRuntimeConfig(event)
  const requestOrigin = getRequestURL(event).origin
  const configuredSiteUrl = typeof runtimeConfig.public?.siteUrl === 'string'
    ? runtimeConfig.public.siteUrl.trim()
    : ''
  const siteBaseUrl = configuredSiteUrl || requestOrigin
  const redirectTo = new URL('/reset-password', siteBaseUrl).toString()

  const supabaseUrl = stripWrappingQuotes(process.env.SUPABASE_URL)
  const anonKey = stripWrappingQuotes(process.env.SUPABASE_KEY)
  const serviceKey = stripWrappingQuotes(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY)
  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw createError({ statusCode: 500, statusMessage: 'Supabase auth configuration is incomplete.' })
  }

  // Primary path: native Supabase recover mail.
  try {
    await $fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      query: { redirect_to: redirectTo },
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      },
      body: { email }
    })

    return { ok: true, delivery: 'supabase' as const }
  } catch (error) {
    // For unknown users we still return success to avoid account enumeration.
    if (isUserNotFoundError(error)) {
      return { ok: true, delivery: 'none' as const }
    }

    if (!isRecoverSendFailure(error)) {
      console.error('[auth/password-recovery] supabase recover failed', {
        message: normalizeErrorMessage(error)
      })
      throw createError({
        statusCode: 502,
        statusMessage: 'Password recovery is temporarily unavailable. Please try again.'
      })
    }
  }

  // Fallback path: generate recovery link and send through our mail pipeline.
  let actionLink = ''
  try {
    const generateLinkResponse = await $fetch<{
      action_link?: string
      actionLink?: string
    }>(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      },
      body: {
        type: 'recovery',
        email
      }
    })

    actionLink = String(generateLinkResponse?.action_link ?? generateLinkResponse?.actionLink ?? '').trim()
  } catch (error) {
    if (isUserNotFoundError(error)) {
      return { ok: true, delivery: 'none' as const }
    }
    console.error('[auth/password-recovery] generate_link failed', {
      message: normalizeErrorMessage(error)
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Password recovery is temporarily unavailable. Please try again.'
    })
  }

  if (!actionLink) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Could not generate a password recovery link.'
    })
  }

  let finalRecoveryLink = actionLink
  try {
    const url = new URL(actionLink)
    url.searchParams.set('redirect_to', redirectTo)
    finalRecoveryLink = url.toString()
  } catch {
    finalRecoveryLink = actionLink
  }

  const safeRecoveryLink = escapeHtml(finalRecoveryLink)
  const bodyHtml = [
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">',
    '<h1 style="font-size:24px;margin:0 0 12px;">Reset your FO Studio password</h1>',
    '<p style="margin:0 0 16px;">We received a request to reset the password for your FO Studio account.</p>',
    `<p style="margin:0 0 20px;"><a href="${safeRecoveryLink}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1a1a1a;color:#fff;text-decoration:none;font-weight:700;">Reset password</a></p>`,
    `<p style="margin:0 0 8px;">Or paste this link into your browser:</p><p style="margin:0 0 16px;word-break:break-all;"><a href="${safeRecoveryLink}">${safeRecoveryLink}</a></p>`,
    '<p style="margin:0;color:#555;">If you did not request this, you can safely ignore this email.</p>',
    '</div>'
  ].join('')

  const sendResult = await sendViaFomailer(event, {
    type: 'mailing.memberBroadcast',
    payload: {
      to: email,
      source: 'auth.passwordRecovery',
      skipRegistryCopyOverrides: true,
      subject: 'Reset your FO Studio password',
      preheader: 'Use this secure link to choose a new password.',
      body: bodyHtml,
      bodyHtml,
      bodyHTML: bodyHtml
    }
  })

  if (!sendResult.ok) {
    console.error('[auth/password-recovery] fallback mail send failed', {
      reason: sendResult.reason ?? 'unknown'
    })
    throw createError({
      statusCode: 502,
      statusMessage: 'Password recovery is temporarily unavailable. Please try again.'
    })
  }

  return { ok: true, delivery: 'fomailer_fallback' as const }
})
