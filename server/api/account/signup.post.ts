import { z } from 'zod'
import { serverSupabaseServiceRole } from '#supabase/server'
import { sendAccountSignupMail } from '~~/server/utils/mail/accountSignup'

const bodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  first_name: z.string().trim().optional(),
  last_name: z.string().trim().optional(),
  phone: z.string().trim().min(1, 'Phone is required.'),
  returnTo: z.string().trim().optional(),
  return_to: z.string().trim().optional()
})

export default defineEventHandler(async (event) => {
  const body = bodySchema.parse(await readBody(event))
  const supabase = serverSupabaseServiceRole(event)

  const email = body.email.trim().toLowerCase()
  const firstName = body.first_name?.trim() || undefined
  const lastName = body.last_name?.trim() || undefined
  const phone = body.phone.trim()

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      phone
    }
  })

  if (createErr) {
    const msg = createErr.message ?? 'Could not create account'
    if (/already registered/i.test(msg) || /already exists/i.test(msg) || /already been registered/i.test(msg)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This email already has an account. Log in to continue.'
      })
    }
    throw createError({ statusCode: 500, statusMessage: msg })
  }

  if (!created?.user?.id) {
    throw createError({ statusCode: 500, statusMessage: 'Account creation returned no user.' })
  }

  const signupMail = await sendAccountSignupMail(event, {
    userId: created.user.id,
    email,
    firstName,
    lastName,
    phone,
    returnTo: body.returnTo ?? body.return_to ?? null
  })

  return {
    ok: true,
    email,
    userId: created.user.id,
    mailQueued: signupMail.ok
  }
})
