import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { sanitizeForJSON } from '~~/server/utils/sanitize'

export type PrimaryCustomerRow = {
  id: string
  user_id?: string | null
  email: string | null
  phone: string | null
  first_name: string | null
  last_name: string | null
  square_customer_id: string | null
  square_customer_json: unknown
  default_square_card_id?: string | null
}

function normEmail(email?: string | null) {
  const value = (email ?? '').trim().toLowerCase()
  return value || null
}

function normPhone(phone?: string | null) {
  const value = (phone ?? '').trim()
  return value || null
}

function normName(name?: string | null) {
  const value = (name ?? '').trim()
  return value || null
}

async function searchSquareCustomerId(event: H3Event, email: string | null, phone: string | null) {
  const square = await useSquareClient(event)

  if (email) {
    const res = await square.customers.search({
      query: { filter: { emailAddress: { exact: email } } },
      limit: 1n
    } as never)
    const found = (res as { customers?: Array<{ id?: string | null }> | null })?.customers?.[0]
    if (found?.id) return found.id
  }

  if (phone) {
    const res = await square.customers.search({
      query: { filter: { phoneNumber: { exact: phone } } },
      limit: 1n
    } as never)
    const found = (res as { customers?: Array<{ id?: string | null }> | null })?.customers?.[0]
    if (found?.id) return found.id
  }

  return null
}

async function createSquareCustomer(event: H3Event, input: {
  email: string | null
  phone: string | null
  firstName: string | null
  lastName: string | null
}) {
  const square = await useSquareClient(event)
  const res = await square.customers.create({
    emailAddress: input.email ?? undefined,
    phoneNumber: input.phone ?? undefined,
    givenName: input.firstName ?? undefined,
    familyName: input.lastName ?? undefined
  } as never)
  return (res as { customer?: Record<string, unknown> | null }).customer ?? null
}

async function fetchSquareCustomer(event: H3Event, customerId: string) {
  const square = await useSquareClient(event)
  const res = await square.customers.get({ customerId } as never)
  return (res as { customer?: Record<string, unknown> | null }).customer ?? null
}

export async function getPrimaryCustomerRowForUser(event: H3Event, userId: string) {
  const supabase = serverSupabaseServiceRole(event)
  const { data: rows } = await supabase
    .from('customers')
    .select('id,user_id,email,phone,first_name,last_name,square_customer_id,square_customer_json,default_square_card_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)

  return Array.isArray(rows) ? ((rows[0] as PrimaryCustomerRow | undefined) ?? null) : null
}

export async function ensureSquareCustomerForUser(event: H3Event, params: {
  userId: string
  email?: string | null
}) {
  const supabase = serverSupabaseServiceRole(event)
  const email = normEmail(params.email)

  // Multiple rows can exist for a single user due to legacy data/backfills.
  // Always pick one deterministic primary row so card add/list stays stable.
  const existingByUser = await getPrimaryCustomerRowForUser(event, params.userId)

  let customerRow = existingByUser

  if (!customerRow && email) {
    const { data: byEmail } = await supabase
      .from('customers')
      .select('id,user_id,email,phone,first_name,last_name,square_customer_id,square_customer_json')
      .ilike('email', email)
      .is('user_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (byEmail?.id) {
      await supabase.from('customers').update({ user_id: params.userId }).eq('id', byEmail.id)
      customerRow = {
        ...byEmail,
        user_id: params.userId
      } as PrimaryCustomerRow
    }
  }

  if (!customerRow) {
    const { data: inserted, error: insertErr } = await supabase
      .from('customers')
      .insert({
        user_id: params.userId,
        email
      })
      .select('id,user_id,email,phone,first_name,last_name,square_customer_id,square_customer_json')
      .single()

    if (insertErr || !inserted) {
      throw new Error(insertErr?.message ?? 'Failed to create customer row')
    }
    customerRow = inserted
  }
  if (!customerRow) throw new Error('Failed to resolve customer row')

  let squareCustomerId = (customerRow.square_customer_id ?? '').trim() || null
  if (!squareCustomerId) {
    squareCustomerId = await searchSquareCustomerId(
      event,
      normEmail(customerRow.email) ?? email,
      normPhone(customerRow.phone)
    )
  }

  let squareCustomerJson: Record<string, unknown> | null = null
  if (squareCustomerId) {
    squareCustomerJson = await fetchSquareCustomer(event, squareCustomerId)
  } else {
    const created = await createSquareCustomer(event, {
      email: normEmail(customerRow.email) ?? email,
      phone: normPhone(customerRow.phone),
      firstName: normName(customerRow.first_name),
      lastName: normName(customerRow.last_name)
    })

    squareCustomerId = typeof created?.id === 'string' ? created.id : null
    squareCustomerJson = created
  }

  if (!squareCustomerId) return null

  await supabase
    .from('customers')
    .update({
      user_id: params.userId,
      email: normEmail(customerRow.email) ?? email,
      square_customer_id: squareCustomerId,
      square_customer_json: sanitizeForJSON(squareCustomerJson)
    })
    .eq('id', customerRow.id)

  return squareCustomerId
}

export async function ensureSquareCustomerForGuest(event: H3Event, params: {
  email: string
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
}) {
  const supabase = serverSupabaseServiceRole(event)
  const email = normEmail(params.email)
  if (!email) return null

  const { data: existingByEmail } = await supabase
    .from('customers')
    .select('id,email,phone,first_name,last_name,square_customer_id,square_customer_json')
    .ilike('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let customerRow = existingByEmail
  if (!customerRow) {
    const { data: inserted, error: insertErr } = await supabase
      .from('customers')
      .insert({
        email,
        phone: normPhone(params.phone),
        first_name: normName(params.firstName),
        last_name: normName(params.lastName)
      })
      .select('id,email,phone,first_name,last_name,square_customer_id,square_customer_json')
      .single()

    if (insertErr || !inserted) {
      throw new Error(insertErr?.message ?? 'Failed to create guest customer row')
    }
    customerRow = inserted
  }

  let squareCustomerId = (customerRow.square_customer_id ?? '').trim() || null
  if (!squareCustomerId) {
    squareCustomerId = await searchSquareCustomerId(
      event,
      normEmail(customerRow.email) ?? email,
      normPhone(customerRow.phone) ?? normPhone(params.phone)
    )
  }

  let squareCustomerJson: Record<string, unknown> | null = null
  if (squareCustomerId) {
    squareCustomerJson = await fetchSquareCustomer(event, squareCustomerId)
  } else {
    const created = await createSquareCustomer(event, {
      email: normEmail(customerRow.email) ?? email,
      phone: normPhone(customerRow.phone) ?? normPhone(params.phone),
      firstName: normName(customerRow.first_name) ?? normName(params.firstName),
      lastName: normName(customerRow.last_name) ?? normName(params.lastName)
    })
    squareCustomerId = typeof created?.id === 'string' ? created.id : null
    squareCustomerJson = created
  }

  if (!squareCustomerId) return null

  await supabase
    .from('customers')
    .update({
      email: normEmail(customerRow.email) ?? email,
      phone: normPhone(customerRow.phone) ?? normPhone(params.phone),
      first_name: normName(customerRow.first_name) ?? normName(params.firstName),
      last_name: normName(customerRow.last_name) ?? normName(params.lastName),
      square_customer_id: squareCustomerId,
      square_customer_json: sanitizeForJSON(squareCustomerJson)
    })
    .eq('id', customerRow.id)

  return squareCustomerId
}
