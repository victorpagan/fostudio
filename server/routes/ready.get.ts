import { setResponseStatus } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = serverSupabaseServiceRole(event)
  const { error } = await supabase
    .from('system_config')
    .select('key')
    .limit(1)

  const checks = [{
    name: 'supabase',
    ok: !error,
    message: error?.message ?? null
  }]
  const ok = checks.every(check => check.ok)

  if (!ok) {
    setResponseStatus(event, 503)
  }

  return {
    ok,
    service: 'fostudio',
    state: ok ? 'ready' : 'down',
    checkedAt: new Date().toISOString(),
    checks
  }
})
