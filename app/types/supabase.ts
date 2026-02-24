// Re-export alias so `import type { Database } from '~/types/supabase'` keeps working.
// The real source is database.types.ts (generated + manually extended).
export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from './database.types'
