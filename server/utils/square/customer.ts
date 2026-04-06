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

function sanitizeName(name?: string | null, email?: string | null) {
  const value = normName(name)
  if (!value) return null
  if (value.includes('@')) return null
  if (email && value.toLowerCase() === email.toLowerCase()) return null
  return value
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

async function updateSquareCustomerIfNeeded(event: H3Event, squareCustomerId: string, input: {
  firstName: string | null
  lastName: string | null
  phone: string | null
  email: string | null
}) {
  if (!input.firstName && !input.lastName && !input.phone) return
  try {
    const existing = await fetchSquareCustomer(event, squareCustomerId)
    if (!existing) return

    const givenName = sanitizeName(
      typeof existing.givenName === 'string' ? existing.givenName : (typeof existing.given_name === 'string' ? existing.given_name : null),
      input.email
    )
    const familyName = sanitizeName(
      typeof existing.familyName === 'string' ? existing.familyName : (typeof existing.family_name === 'string' ? existing.family_name : null),
      input.email
    )
    const phoneNumber = typeof existing.phoneNumber === 'string' ? existing.phoneNumber.trim() : (typeof existing.phone_number === 'string' ? existing.phone_number.trim() : '')
    const version = existing.version

    const patch: Record<string, unknown> = {}
    if (!givenName && input.firstName) patch.givenName = input.firstName
    if (!familyName && input.lastName) patch.familyName = input.lastName
    if (!phoneNumber && input.phone) patch.phoneNumber = input.phone

    if (!Object.keys(patch).length) return

    const square = await useSquareClient(event)
    await square.customers.update({
      customerId: squareCustomerId,
      ...patch,
      ...(version != null ? { version } : {})
    } as never)
  } catch (error) {
    console.warn('[square/customer] failed to update customer name/phone', {
      squareCustomerId,
      message: error instanceof Error ? error.message : 'unknown'
    })
  }
}

export async function ensureSquareCustomerForUser(event: H3Event, params: {
  userId: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
}) {
  const supabase = serverSupabaseServiceRole(event)
  const email = normEmail(params.email)
  const firstName = sanitizeName(params.firstName, email)
  const lastName = sanitizeName(params.lastName, email)
  const phone = normPhone(params.phone)

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
        email,
        first_name: firstName,
        last_name: lastName,
        phone
      })
      .select('id,user_id,email,phone,first_name,last_name,square_customer_id,square_customer_json')
      .single()

    if (insertErr || !inserted) {
      throw new Error(insertErr?.message ?? 'Failed to create customer row')
    }
    customerRow = inserted
  }
  if (!customerRow) throw new Error('Failed to resolve customer row')

  // Backfill name/phone on existing customer rows that are missing them
  if (customerRow && (firstName || lastName || phone)) {
    const customerRowEmail = normEmail(customerRow.email) ?? email
    const customerRowFirstName = sanitizeName(customerRow.first_name, customerRowEmail)
    const customerRowLastName = sanitizeName(customerRow.last_name, customerRowEmail)
    const patch: Record<string, string> = {}
    if (!customerRowFirstName && firstName) patch.first_name = firstName
    if (!customerRowLastName && lastName) patch.last_name = lastName
    if (!customerRow.phone && phone) patch.phone = phone
    if (Object.keys(patch).length) {
      await supabase.from('customers').update(patch).eq('id', customerRow.id)
      if (patch.first_name) customerRow.first_name = patch.first_name
      if (patch.last_name) customerRow.last_name = patch.last_name
      if (patch.phone) customerRow.phone = patch.phone
    }
  }

  let squareCustomerId = (customerRow.square_customer_id ?? '').trim() || null
  const customerRowEmail = normEmail(customerRow.email) ?? email
  const customerRowFirstName = sanitizeName(customerRow.first_name, customerRowEmail)
  const customerRowLastName = sanitizeName(customerRow.last_name, customerRowEmail)
  const customerRowPhone = normPhone(customerRow.phone) ?? phone

  if (!squareCustomerId) {
    squareCustomerId = await searchSquareCustomerId(
      event,
      customerRowEmail,
      customerRowPhone
    )
  }

  let squareCustomerJson: Record<string, unknown> | null = null
  if (squareCustomerId) {
    squareCustomerJson = await fetchSquareCustomer(event, squareCustomerId)
  } else {
    const created = await createSquareCustomer(event, {
      email: customerRowEmail,
      phone: customerRowPhone,
      firstName: customerRowFirstName ?? firstName,
      lastName: customerRowLastName ?? lastName
    })

    squareCustomerId = typeof created?.id === 'string' ? created.id : null
    squareCustomerJson = created
  }

  if (!squareCustomerId) return null

  await supabase
    .from('customers')
    .update({
      user_id: params.userId,
      email: customerRowEmail,
      square_customer_id: squareCustomerId,
      square_customer_json: sanitizeForJSON(squareCustomerJson)
    })
    .eq('id', customerRow.id)

  // Backfill name/phone on the Square customer if they were missing at creation time
  await updateSquareCustomerIfNeeded(event, squareCustomerId, {
    firstName: customerRowFirstName ?? firstName,
    lastName: customerRowLastName ?? lastName,
    phone: customerRowPhone,
    email: customerRowEmail
  })

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
  const firstName = sanitizeName(params.firstName, email)
  const lastName = sanitizeName(params.lastName, email)
  const phone = normPhone(params.phone)

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
        phone,
        first_name: firstName,
        last_name: lastName
      })
      .select('id,email,phone,first_name,last_name,square_customer_id,square_customer_json')
      .single()

    if (insertErr || !inserted) {
      throw new Error(insertErr?.message ?? 'Failed to create guest customer row')
    }
    customerRow = inserted
  }

  if (customerRow && (firstName || lastName || phone)) {
    const customerRowFirstName = sanitizeName(customerRow.first_name, email)
    const customerRowLastName = sanitizeName(customerRow.last_name, email)
    const customerRowPhone = normPhone(customerRow.phone)
    const patch: Record<string, string> = {}
    if (!customerRowFirstName && firstName) patch.first_name = firstName
    if (!customerRowLastName && lastName) patch.last_name = lastName
    if (!customerRowPhone && phone) patch.phone = phone
    if (Object.keys(patch).length) {
      await supabase.from('customers').update(patch).eq('id', customerRow.id)
      if (patch.first_name) customerRow.first_name = patch.first_name
      if (patch.last_name) customerRow.last_name = patch.last_name
      if (patch.phone) customerRow.phone = patch.phone
    }
  }

  const customerRowFirstName = sanitizeName(customerRow.first_name, email)
  const customerRowLastName = sanitizeName(customerRow.last_name, email)
  const customerRowPhone = normPhone(customerRow.phone) ?? phone

  let squareCustomerId = (customerRow.square_customer_id ?? '').trim() || null
  if (!squareCustomerId) {
    squareCustomerId = await searchSquareCustomerId(
      event,
      normEmail(customerRow.email) ?? email,
      customerRowPhone
    )
  }

  let squareCustomerJson: Record<string, unknown> | null = null
  if (squareCustomerId) {
    squareCustomerJson = await fetchSquareCustomer(event, squareCustomerId)
  } else {
    const created = await createSquareCustomer(event, {
      email: normEmail(customerRow.email) ?? email,
      phone: customerRowPhone,
      firstName: customerRowFirstName ?? firstName,
      lastName: customerRowLastName ?? lastName
    })
    squareCustomerId = typeof created?.id === 'string' ? created.id : null
    squareCustomerJson = created
  }

  if (!squareCustomerId) return null

  await supabase
    .from('customers')
    .update({
      email: normEmail(customerRow.email) ?? email,
      phone: customerRowPhone,
      first_name: customerRowFirstName ?? firstName,
      last_name: customerRowLastName ?? lastName,
      square_customer_id: squareCustomerId,
      square_customer_json: sanitizeForJSON(squareCustomerJson)
    })
    .eq('id', customerRow.id)

  await updateSquareCustomerIfNeeded(event, squareCustomerId, {
    firstName: customerRowFirstName ?? firstName,
    lastName: customerRowLastName ?? lastName,
    phone: customerRowPhone,
    email
  })

  return squareCustomerId
}
