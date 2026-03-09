import { randomInt } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

const DOOR_CODE_REGEX = /^\d{6}$/
const MAX_DOOR_CODE_ATTEMPTS = 40

type CustomerDoorCodeRow = {
  id: string
  user_id: string | null
  email: string | null
  door_code: string | null
}

function normalizeEmail(email?: string | null) {
  const value = (email ?? '').trim().toLowerCase()
  return value || null
}

function createDoorCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

function isUniqueViolation(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code
  return code === '23505'
}

export function assertDoorCodeFormat(doorCode: string) {
  if (!DOOR_CODE_REGEX.test(doorCode)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Door code must be exactly 6 digits.'
    })
  }
}

async function ensureCustomerRow(event: H3Event, params: { userId: string, email?: string | null }) {
  const supabase = serverSupabaseServiceRole(event)
  const normalizedEmail = normalizeEmail(params.email)

  const { data: existingByUser, error: existingByUserErr } = await supabase
    .from('customers')
    .select('id,user_id,email,door_code')
    .eq('user_id', params.userId)
    .maybeSingle()

  if (existingByUserErr) {
    throw createError({ statusCode: 500, statusMessage: existingByUserErr.message })
  }
  if (existingByUser) return existingByUser as CustomerDoorCodeRow

  const { data: inserted, error: insertErr } = await supabase
    .from('customers')
    .insert({
      user_id: params.userId,
      email: normalizedEmail
    })
    .select('id,user_id,email,door_code')
    .single()

  if (!insertErr && inserted) return inserted as CustomerDoorCodeRow

  if (!isUniqueViolation(insertErr)) {
    throw createError({ statusCode: 500, statusMessage: insertErr?.message ?? 'Failed to create customer row' })
  }

  const { data: retried, error: retriedErr } = await supabase
    .from('customers')
    .select('id,user_id,email,door_code')
    .eq('user_id', params.userId)
    .maybeSingle()

  if (retriedErr) throw createError({ statusCode: 500, statusMessage: retriedErr.message })
  if (!retried) throw createError({ statusCode: 500, statusMessage: 'Failed to load customer row' })
  return retried as CustomerDoorCodeRow
}

export async function ensureDoorCodeForUser(event: H3Event, params: { userId: string, email?: string | null }) {
  const supabase = serverSupabaseServiceRole(event)
  const customer = await ensureCustomerRow(event, params)
  const existingDoorCode = (customer.door_code ?? '').trim()
  if (DOOR_CODE_REGEX.test(existingDoorCode)) {
    return { customerId: customer.id, doorCode: existingDoorCode }
  }

  for (let attempt = 0; attempt < MAX_DOOR_CODE_ATTEMPTS; attempt += 1) {
    const nextDoorCode = createDoorCode()
    const { data: updated, error: updateErr } = await supabase
      .from('customers')
      .update({
        door_code: nextDoorCode,
        door_code_updated_at: new Date().toISOString()
      })
      .eq('id', customer.id)
      .select('id,door_code')
      .single()

    if (!updateErr && updated?.door_code) {
      return {
        customerId: updated.id,
        doorCode: String(updated.door_code)
      }
    }

    if (isUniqueViolation(updateErr)) continue
    throw createError({ statusCode: 500, statusMessage: updateErr?.message ?? 'Failed to assign door code' })
  }

  throw createError({
    statusCode: 500,
    statusMessage: 'Could not allocate a unique door code. Try again.'
  })
}

export async function setDoorCodeForUser(event: H3Event, params: {
  userId: string
  doorCode: string
  email?: string | null
}) {
  assertDoorCodeFormat(params.doorCode)
  const supabase = serverSupabaseServiceRole(event)
  const customer = await ensureCustomerRow(event, { userId: params.userId, email: params.email })

  const { data: updated, error: updateErr } = await supabase
    .from('customers')
    .update({
      door_code: params.doorCode,
      door_code_updated_at: new Date().toISOString()
    })
    .eq('id', customer.id)
    .select('id,door_code')
    .single()

  if (updateErr) {
    if (isUniqueViolation(updateErr)) {
      throw createError({ statusCode: 409, statusMessage: 'Door code is already assigned to another member.' })
    }
    throw createError({ statusCode: 500, statusMessage: updateErr.message })
  }

  return {
    customerId: updated.id,
    doorCode: String(updated.door_code ?? '')
  }
}
