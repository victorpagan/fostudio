import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { createAccessIncident } from '~~/server/utils/access/incidents'
import { clearLockUserCode } from '~~/server/utils/access/providers'

const bodySchema = z.object({
  id: z.string().uuid()
})

type PermanentCodeRow = {
  id: string
  slot_number: number
  active: boolean
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))

  const { data: existing, error: readErr } = await db
    .from('lock_permanent_codes')
    .select('id,slot_number,active')
    .eq('id', body.id)
    .maybeSingle()

  if (readErr) throw createError({ statusCode: 500, statusMessage: readErr.message })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Permanent code not found' })

  const codeRow = existing as PermanentCodeRow

  if (codeRow.active) {
    try {
      await clearLockUserCode(event, {
        slotNumber: Number(codeRow.slot_number),
        kind: 'permanent',
        reason: 'permanent_code_deleted'
      })
    } catch (error) {
      const message = (error as Error)?.message ?? String(error)
      await createAccessIncident(event, {
        incidentType: 'permanent_code_sync_failure',
        severity: 'error',
        title: 'Failed to clear permanent code during delete',
        message,
        metadata: {
          permanentCodeId: codeRow.id,
          slotNumber: codeRow.slot_number
        }
      }).catch(() => {})

      throw createError({ statusCode: 502, statusMessage: message })
    }
  }

  const { error: deleteErr } = await db
    .from('lock_permanent_codes')
    .delete()
    .eq('id', body.id)

  if (deleteErr) throw createError({ statusCode: 500, statusMessage: deleteErr.message })

  return {
    ok: true
  }
})
