import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type AnalyticsSupabase = SupabaseClient

export function createSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NUXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''

  if (!url || !key) return null

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
