import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { createAccessIncident } from '~~/server/utils/access/incidents'
import { clearLockUserCode, setLockUserCode } from '~~/server/utils/access/providers'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(80),
  slotNumber: z.number().int().min(1).max(99),
  code: z.string().regex(/^\d{6}$/, 'Code must be exactly 6 digits.'),
  active: z.boolean().optional()
})

type PermanentCodeRow = {
  id: string
  label: string
  slot_number: number
  code: string
  active: boolean
  last_synced_at: string | null
  last_sync_status: 'ok' | 'error' | null
  last_sync_error: string | null
}

function isUniqueViolation(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code
  return code === '23505'
}

async function fetchPermanentCodeById(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  id: string
) {
  const { data, error } = await db
    .from('lock_permanent_codes')
    .select('id,label,slot_number,code,active,last_synced_at,last_sync_status,last_sync_error')
    .eq('id', id)
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return (data as PermanentCodeRow | null) ?? null
}

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireServerAdmin(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))
  const nowIso = new Date().toISOString()
  const targetActive = body.active ?? true

  const existing = body.id ? await fetchPermanentCodeById(db, body.id) : null
  if (body.id && !existing) {
    throw createError({ statusCode: 404, statusMessage: 'Permanent code not found' })
  }

  if (targetActive) {
    const { data: activeAssignment, error: activeAssignmentErr } = await db
      .from('lock_slot_assignments')
      .select('id,slot_number,slot_kind')
      .eq('slot_number', body.slotNumber)
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    if (activeAssignmentErr) throw createError({ statusCode: 500, statusMessage: activeAssignmentErr.message })
    if (activeAssignment?.id) {
      throw createError({
        statusCode: 409,
        statusMessage: `Slot ${body.slotNumber} is currently used by an active ${activeAssignment.slot_kind} assignment.`
      })
    }
  }

  let saved: PermanentCodeRow | null = null

  if (existing) {
    const { data, error } = await db
      .from('lock_permanent_codes')
      .update({
        label: body.label.trim(),
        slot_number: body.slotNumber,
        code: body.code,
        active: targetActive,
        updated_by: user.sub,
        updated_at: nowIso
      })
      .eq('id', existing.id)
      .select('id,label,slot_number,code,active,last_synced_at,last_sync_status,last_sync_error')
      .single()

    if (error) {
      if (isUniqueViolation(error)) {
        throw createError({ statusCode: 409, statusMessage: `Slot ${body.slotNumber} is already assigned to another permanent code.` })
      }
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    saved = data as PermanentCodeRow
  } else {
    const { data, error } = await db
      .from('lock_permanent_codes')
      .insert({
        label: body.label.trim(),
        slot_number: body.slotNumber,
        code: body.code,
        active: targetActive,
        created_by: user.sub,
        updated_by: user.sub,
        created_at: nowIso,
        updated_at: nowIso
      })
      .select('id,label,slot_number,code,active,last_synced_at,last_sync_status,last_sync_error')
      .single()

    if (error) {
      if (isUniqueViolation(error)) {
        throw createError({ statusCode: 409, statusMessage: `Slot ${body.slotNumber} is already assigned to another permanent code.` })
      }
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    saved = data as PermanentCodeRow
  }

  if (!saved) throw createError({ statusCode: 500, statusMessage: 'Failed to save permanent code' })

  let syncError: string | null = null

  if (existing?.active && (existing.slot_number !== saved.slot_number || !saved.active)) {
    try {
      await clearLockUserCode(event, {
        slotNumber: Number(existing.slot_number),
        kind: 'permanent',
        reason: 'permanent_code_updated'
      })
    } catch (error) {
      syncError = (error as Error)?.message ?? String(error)
    }
  }

  if (!syncError && saved.active) {
    try {
      await setLockUserCode(event, {
        slotNumber: Number(saved.slot_number),
        code: String(saved.code),
        kind: 'permanent'
      })
    } catch (error) {
      syncError = (error as Error)?.message ?? String(error)
    }
  }

  if (syncError) {
    await createAccessIncident(event, {
      incidentType: 'permanent_code_sync_failure',
      severity: 'error',
      title: 'Permanent code sync failed',
      message: syncError,
      metadata: {
        permanentCodeId: saved.id,
        slotNumber: saved.slot_number
      }
    }).catch(() => {})
  }

  const { data: updated, error: markErr } = await db
    .from('lock_permanent_codes')
    .update({
      last_synced_at: nowIso,
      last_sync_status: syncError ? 'error' : 'ok',
      last_sync_error: syncError,
      updated_at: nowIso,
      updated_by: user.sub
    })
    .eq('id', saved.id)
    .select('id,label,slot_number,code,active,last_synced_at,last_sync_status,last_sync_error')
    .single()

  if (markErr) throw createError({ statusCode: 500, statusMessage: markErr.message })

  return {
    code: updated as PermanentCodeRow,
    syncOk: !syncError,
    syncError
  }
})
