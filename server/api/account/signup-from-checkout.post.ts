import { z } from 'zod'
import { serverSupabaseServiceRole } from '#supabase/server'

const bodySchema = z.object({
  token: z.string().uuid(),
  password: z.string().min(8),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional()
})

type CheckoutSessionRow = {
  id: string
  token: string
  guest_email: string | null
  status: string
  claimed_by_user_id: string | null
}

export default defineEventHandler(async (event) => {
  const body = bodySchema.parse(await readBody(event))
  const supabase = serverSupabaseServiceRole(event)

  const { data: sessionRaw, error: sessionErr } = await supabase
    .from('membership_checkout_sessions')
    .select('id,token,guest_email,status,claimed_by_user_id')
    .eq('token', body.token)
    .maybeSingle()

  if (sessionErr) throw createError({ statusCode: 500, statusMessage: sessionErr.message })
  if (!sessionRaw) throw createError({ statusCode: 404, statusMessage: 'Checkout session not found.' })

  const session = sessionRaw as CheckoutSessionRow
  if (!session.guest_email) {
    throw createError({ statusCode: 400, statusMessage: 'Checkout session has no guest email.' })
  }
  if (session.claimed_by_user_id) {
    throw createError({ statusCode: 409, statusMessage: 'This checkout session is already claimed.' })
  }
  if (session.status !== 'pending') {
    throw createError({ statusCode: 409, statusMessage: 'This checkout session is no longer pending.' })
  }

  const email = session.guest_email.trim().toLowerCase()
  const firstName = (body.first_name ?? '').trim() || undefined
  const lastName = (body.last_name ?? '').trim() || undefined
  const phone = (body.phone ?? '').trim() || undefined

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      phone: phone ?? null
    }
  })

  if (createErr) {
    const msg = createErr.message ?? 'Could not create account'
    if (/already registered/i.test(msg) || /already exists/i.test(msg)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This email already has an account. Log in to finish membership activation.'
      })
    }
    throw createError({ statusCode: 500, statusMessage: msg })
  }

  if (!created?.user?.id) {
    throw createError({ statusCode: 500, statusMessage: 'Account creation returned no user.' })
  }

  return {
    ok: true,
    email,
    userId: created.user.id
  }
})

