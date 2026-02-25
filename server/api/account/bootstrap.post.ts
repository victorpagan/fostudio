// File: server/api/account/bootstrap.post.ts
import { z } from 'zod'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'

const schema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  address: z.any().optional() // jsonb (optional; only set if you have it)
})

function normEmail(email?: string | null) {
  const e = (email ?? '').trim().toLowerCase()
  return e.length ? e : null
}

function normPhone(phone?: string | null) {
  const p = (phone ?? '').trim()
  return p.length ? p : null
}

async function searchSquareCustomerId(event: H3Event, email: string | null, phone: string | null) {
  const square = await useSquareClient(event)

  // Prefer email search
  if (email) {
    const res = await square.customers.search({
      query: { filter: { emailAddress: { exact: email } } },
      limit: 1
    } as any)
    const found = (res as any)?.customers?.[0]
    if (found?.id) return found.id as string
  }

  // Fallback phone search
  if (phone) {
    const res = await square.customers.search({
      query: { filter: { phoneNumber: { exact: phone } } },
      limit: 1
    } as any)
    const found = (res as any)?.customers?.[0]
    if (found?.id) return found.id as string
  }

  return null
}

async function retrieveSquareCustomer(event: H3Event, squareCustomerId: string) {
  const square = await useSquareClient(event)
  const res = await square.customers.get({ customerId: squareCustomerId } as any)
  return (res as any)?.customer ?? null
}

async function createSquareCustomer(event: H3Event, input: {
  email: string | null
  phone: string | null
  first_name: string | null
  last_name: string | null
}) {
  const square = await useSquareClient(event)
  const res = await square.customers.create({
    emailAddress: input.email ?? undefined,
    phoneNumber: input.phone ?? undefined,
    givenName: input.first_name ?? undefined,
    familyName: input.last_name ?? undefined
  } as any)
  return (res as any)?.customer ?? null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user?.sub || !UUID_RE.test(user.sub)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = schema.parse(await readBody(event))
  const supa = serverSupabaseServiceRole(event)

  const email = normEmail(body.email ?? user.email ?? null)
  const phone = normPhone(body.phone ?? null)
  const first_name = (body.first_name ?? '').trim() || null
  const last_name = (body.last_name ?? '').trim() || null
  const address = body.address ?? null

  // 1) If already linked to this auth user, update+sync and return
  const { data: linked, error: linkedErr } = await supa
    .from('customers')
    .select('*')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (linkedErr) {
    throw createError({ statusCode: 500, statusMessage: `Customer lookup failed: ${linkedErr.message}` })
  }

  let customerRow = linked

  // 2) If not linked: try to find an existing customer row by email/phone (and link it)
  if (!customerRow) {
    // Email match preferred
    if (email) {
      const { data: rows, error } = await supa
        .from('customers')
        .select('*')
        .ilike('email', email)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) throw createError({ statusCode: 500, statusMessage: `Customer search failed: ${error.message}` })

      // Pick the newest row. If it is linked to someone else, block.
      const candidate = rows?.[0]
      if (candidate) {
        if (candidate.user_id && candidate.user_id !== user.sub) {
          throw createError({ statusCode: 409, statusMessage: 'This email is already linked to another account.' })
        }
        customerRow = candidate
      }
    }

    // Phone match fallback
    if (!customerRow && phone) {
      const { data: rows, error } = await supa
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) throw createError({ statusCode: 500, statusMessage: `Customer phone search failed: ${error.message}` })

      const candidate = rows?.[0]
      if (candidate) {
        if (candidate.user_id && candidate.user_id !== user.sub) {
          throw createError({ statusCode: 409, statusMessage: 'This phone is already linked to another account.' })
        }
        customerRow = candidate
      }
    }
  }

  // 3) Create row if none
  if (!customerRow) {
    const { data: inserted, error: insErr } = await supa
      .from('customers')
      .insert({
        user_id: user.sub,
        email,
        phone,
        first_name,
        last_name,
        address
      })
      .select('*')
      .single()

    if (insErr || !inserted) throw createError({ statusCode: 500, statusMessage: `Failed to create customer row: ${insErr?.message ?? 'No data returned'}` })
    customerRow = inserted
  } else {
    // 4) Ensure user_id is linked
    if (!customerRow.user_id) {
      const { error: linkErr } = await supa
        .from('customers')
        .update({ user_id: user.sub })
        .eq('id', customerRow.id)

      if (linkErr) throw createError({ statusCode: 500, statusMessage: `Failed to link customer row: ${linkErr.message}` })
      customerRow.user_id = user.sub
    }

    // 5) Fill missing basic fields from signup form (don’t overwrite existing)
    const patch: any = {}
    if (!customerRow.email && email) patch.email = email
    if (!customerRow.phone && phone) patch.phone = phone
    if (!customerRow.first_name && first_name) patch.first_name = first_name
    if (!customerRow.last_name && last_name) patch.last_name = last_name
    if (!customerRow.address && address) patch.address = address

    if (Object.keys(patch).length) {
      const { error: updErr } = await supa.from('customers').update(patch).eq('id', customerRow.id)
      if (updErr) throw createError({ statusCode: 500, statusMessage: `Failed to update customer row: ${updErr.message}` })
      customerRow = { ...customerRow, ...patch }
    }
  }

  // At this point customerRow is guaranteed non-null (we threw above if insert failed)
  const row = customerRow!

  // 6) Square sync: ensure we have square_customer_id + json
  let squareCustomerId: string | null = row.square_customer_id ?? null
  let squareCustomerJson: any | null = row.square_customer_json ?? null

  // If we have an id but no json, refresh it
  if (squareCustomerId && !squareCustomerJson) {
    const sq = await retrieveSquareCustomer(event, squareCustomerId)
    if (sq) {
      squareCustomerJson = sq
      await supa
        .from('customers')
        .update({ square_customer_json: sq })
        .eq('id', row.id)
    }
    return { ok: true, customer_id: row.id, square_customer_id: squareCustomerId }
  }

  // If no Square id, try to find existing in Square
  if (!squareCustomerId) {
    squareCustomerId = await searchSquareCustomerId(event, row.email ?? email, row.phone ?? phone)
  }

  // If found in Square, fetch & store
  if (squareCustomerId) {
    const sq = await retrieveSquareCustomer(event, squareCustomerId)
    const patch: any = {
      square_customer_id: squareCustomerId,
      square_customer_json: sq
    }

    // Backfill missing local fields from Square
    if (!row.email && sq?.emailAddress) patch.email = sq.emailAddress
    if (!row.phone && sq?.phoneNumber) patch.phone = sq.phoneNumber
    if (!row.first_name && sq?.givenName) patch.first_name = sq.givenName
    if (!row.last_name && sq?.familyName) patch.last_name = sq.familyName

    const { error: updErr } = await supa.from('customers').update(patch).eq('id', row.id)
    if (updErr) throw createError({ statusCode: 500, statusMessage: `Failed to store Square customer: ${updErr.message}` })

    return { ok: true, customer_id: row.id, square_customer_id: squareCustomerId }
  }

  // Otherwise, create Square customer
  const created = await createSquareCustomer(event, {
    email: row.email ?? email,
    phone: row.phone ?? phone,
    first_name: row.first_name ?? first_name,
    last_name: row.last_name ?? last_name
  })

  if (!created?.id) throw createError({ statusCode: 500, statusMessage: 'Failed to create Square customer' })

  const { error: finalErr } = await supa
    .from('customers')
    .update({
      square_customer_id: created.id,
      square_customer_json: created
    })
    .eq('id', row.id)

  if (finalErr) throw createError({ statusCode: 500, statusMessage: `Failed to persist Square customer: ${finalErr.message}` })

  return { ok: true, customer_id: row.id, square_customer_id: created.id }
})
