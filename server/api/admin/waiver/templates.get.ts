import { requireServerAdmin } from '~~/server/utils/auth'

type WaiverTemplateRow = {
  id: string
  version: number
  title: string
  body: string
  metadata: Record<string, unknown> | null
  is_active: boolean
  published_at: string | null
  created_at: string
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)

  const { data, error } = await supabase
    .from('waiver_templates')
    .select('id,version,title,body,metadata,is_active,published_at,created_at')
    .order('version', { ascending: false })
    .limit(100)

  if (error) throw createError({ statusCode: 500, statusMessage: `Failed to load waiver templates: ${error.message}` })

  const templates = (data ?? []) as WaiverTemplateRow[]
  const activeTemplate = templates.find(template => template.is_active) ?? null

  return { templates, activeTemplate }
})
