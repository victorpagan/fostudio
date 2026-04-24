import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  userId: z.string().uuid(),
  workshopBookingEnabled: z.boolean()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))
  const customersTable = 'customers' as never

  const { data: existingCustomerRaw, error: existingErr } = await supabase
    .from(customersTable)
    .select('id,user_id')
    .eq('user_id', body.userId)
    .maybeSingle()
  const existingCustomer = existingCustomerRaw as unknown as { id?: string | null } | null

  if (existingErr) throw createError({ statusCode: 500, statusMessage: existingErr.message })

  if (existingCustomer?.id) {
    const { error: updateErr } = await supabase
      .from(customersTable)
      .update({
        workshop_booking_enabled: body.workshopBookingEnabled
      } as never)
      .eq('id', existingCustomer.id)
    if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })
  } else {
    const { error: insertErr } = await supabase
      .from(customersTable)
      .insert({
        user_id: body.userId,
        workshop_booking_enabled: body.workshopBookingEnabled
      } as never)
    if (insertErr) throw createError({ statusCode: 500, statusMessage: insertErr.message })
  }

  return { ok: true }
})
