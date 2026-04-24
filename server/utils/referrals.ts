import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const REFERRAL_CODE_MIN_LENGTH = 6
const REFERRAL_CODE_MAX_LENGTH = 16
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomReferralCode(length = 8) {
  const size = Math.max(REFERRAL_CODE_MIN_LENGTH, Math.min(12, Math.floor(length)))
  const bytes = randomBytes(size)
  let out = ''
  for (let index = 0; index < size; index += 1) {
    out += REFERRAL_CODE_ALPHABET[bytes[index]! % REFERRAL_CODE_ALPHABET.length]
  }
  return out
}

export function normalizeReferralCode(raw: unknown) {
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toUpperCase()
  if (!normalized) return null
  if (normalized.length < REFERRAL_CODE_MIN_LENGTH || normalized.length > REFERRAL_CODE_MAX_LENGTH) return null
  if (!/^[A-Z0-9]+$/.test(normalized)) return null
  return normalized
}

export function defaultReferralCredits(tierId: string | null | undefined, cadence: string | null | undefined) {
  const tier = String(tierId ?? '').trim().toLowerCase()
  const cycle = String(cadence ?? '').trim().toLowerCase()
  if (cycle === 'quarterly' || cycle === 'annual') return 3
  if (tier === 'pro' || tier === 'studio_plus') return 3
  return 1
}

export async function resolveReferralCredits(
  supabase: SupabaseClient,
  tierId: string | null | undefined,
  cadence: string | null | undefined
) {
  const tier = String(tierId ?? '').trim()
  const cycle = String(cadence ?? '').trim().toLowerCase()
  if (!tier || !cycle) {
    const fallback = defaultReferralCredits(tierId, cadence)
    return { referrerCredits: fallback, referredCredits: fallback }
  }

  const { data, error } = await supabase
    .from('referral_credit_rules')
    .select('referrer_credits,referred_credits')
    .eq('tier_id', tier)
    .eq('cadence', cycle)
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) {
    const fallback = defaultReferralCredits(tierId, cadence)
    return { referrerCredits: fallback, referredCredits: fallback }
  }

  const referrerCredits = Number(data.referrer_credits ?? 0)
  const referredCredits = Number(data.referred_credits ?? 0)
  return {
    referrerCredits: Number.isFinite(referrerCredits) ? Math.max(0, referrerCredits) : 0,
    referredCredits: Number.isFinite(referredCredits) ? Math.max(0, referredCredits) : 0
  }
}

export async function ensureMemberReferralCode(supabase: SupabaseClient, userId: string) {
  const { data: existing, error: existingErr } = await supabase
    .from('member_referral_codes')
    .select('id,user_id,code,active')
    .eq('user_id', userId)
    .maybeSingle()

  if (existingErr) throw createError({ statusCode: 500, statusMessage: existingErr.message })
  if (existing?.code && existing.active) return existing

  const maxAttempts = 12
  let lastErrorMessage = 'Unable to create referral code.'

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidateCode = randomReferralCode(8)
    const { data: saved, error } = await supabase
      .from('member_referral_codes')
      .upsert({
        user_id: userId,
        code: candidateCode,
        active: true
      }, {
        onConflict: 'user_id'
      })
      .select('id,user_id,code,active')
      .single()

    if (!error && saved?.code) return saved

    const rawMessage = String(error?.message ?? '')
    if (rawMessage.toLowerCase().includes('duplicate key')) {
      lastErrorMessage = rawMessage
      continue
    }

    throw createError({ statusCode: 500, statusMessage: rawMessage || 'Failed to save referral code.' })
  }

  throw createError({ statusCode: 500, statusMessage: lastErrorMessage })
}
