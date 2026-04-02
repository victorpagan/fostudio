import { requireServerAdmin } from '~~/server/utils/auth'

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)

  const { data, error } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', ['PERMANENT_CODES_DISARM_ABODE_OUTSIDE_LAB_HOURS'])

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  const map = new Map((data ?? []).map(row => [row.key, row.value] as const))

  return {
    settings: {
      permanentCodesDisarmAbodeOutsideLabHours: asBoolean(
        map.get('PERMANENT_CODES_DISARM_ABODE_OUTSIDE_LAB_HOURS'),
        false
      )
    }
  }
})
