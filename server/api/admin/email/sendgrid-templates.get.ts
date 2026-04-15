import { createError } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getKey } from '~~/server/utils/config/secret'

type SendgridTemplateRaw = {
  id?: string | null
  name?: string | null
  generation?: string | null
  updated_at?: string | null
}

type SendgridTemplateListResponseRaw = {
  result?: unknown
  result_metadata?: {
    next_page_token?: string | null
    next_cursor?: string | null
    count?: number | null
  } | null
  _metadata?: {
    next_page_token?: string | null
    next_cursor?: string | null
    count?: number | null
  } | null
  templates?: unknown
}

const PAGE_SIZE = 200
const GENERATION_STRATEGIES = ['dynamic,legacy', 'dynamic', 'legacy', ''] as const

function readUpstreamErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const value = error as {
    statusCode?: number
    statusMessage?: string
    data?: unknown
    response?: { status?: number, _data?: unknown }
    message?: string
  }

  const status = value.statusCode ?? value.response?.status ?? null
  const payload = value.data ?? value.response?._data ?? null
  const payloadText = payload == null
    ? null
    : (typeof payload === 'string' ? payload : JSON.stringify(payload))

  return {
    status,
    message: value.statusMessage ?? value.message ?? null,
    payloadText
  }
}

function normalizeTemplate(raw: SendgridTemplateRaw) {
  return {
    templateId: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    generation: String(raw.generation ?? ''),
    updatedAt: raw.updated_at ?? null
  }
}

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)

  const sendgridApiKey = await getKey(event, 'SENDGRID_API_KEY').catch(() => null)
  if (typeof sendgridApiKey !== 'string' || !sendgridApiKey.trim()) {
    throw createError({ statusCode: 500, statusMessage: 'SENDGRID_API_KEY is not configured.' })
  }

  const templatesMap = new Map<string, ReturnType<typeof normalizeTemplate>>()

  for (const generationMode of GENERATION_STRATEGIES) {
    let nextPageToken: string | null = null
    let loops = 0
    let strategyAddedTemplates = 0

    while (loops < 20) {
      loops += 1

      const query: Record<string, string | number | undefined> = {
        page_size: PAGE_SIZE
      }
      if (generationMode) {
        query.generations = generationMode
      }
      if (nextPageToken) {
        query.page_token = nextPageToken
      }

      let response: SendgridTemplateListResponseRaw
      try {
        response = await $fetch<SendgridTemplateListResponseRaw>('https://api.sendgrid.com/v3/templates', {
          method: 'GET',
          query,
          headers: {
            authorization: `Bearer ${sendgridApiKey.trim()}`
          }
        })
      } catch (error: unknown) {
        const details = readUpstreamErrorDetails(error)
        const upstreamStatus = details?.status ?? 502
        const upstreamMessage = details?.message ?? 'Unexpected SendGrid response.'

        if (upstreamStatus === 401 || upstreamStatus === 403) {
          throw createError({
            statusCode: upstreamStatus,
            statusMessage: `SendGrid authentication failed: ${upstreamMessage}`
          })
        }

        if (upstreamStatus === 400 && generationMode) {
          break
        }

        throw createError({
          statusCode: 502,
          statusMessage: details?.payloadText
            ? `Could not load SendGrid templates: ${upstreamMessage} | body: ${details.payloadText}`
            : `Could not load SendGrid templates: ${upstreamMessage}`
        })
      }

      const responseTemplates = Array.isArray(response.result)
        ? response.result
        : Array.isArray(response.templates)
          ? response.templates
          : []

      const pageTemplates = responseTemplates.filter((item): item is SendgridTemplateRaw => Boolean(item) && typeof item === 'object')
      for (const item of pageTemplates) {
        const normalized = normalizeTemplate(item)
        if (!normalized.templateId || templatesMap.has(normalized.templateId)) {
          continue
        }

        templatesMap.set(normalized.templateId, normalized)
        strategyAddedTemplates += 1
      }

      const metadata = response.result_metadata ?? response._metadata
      const nextToken = metadata?.next_page_token ?? metadata?.next_cursor ?? null
      if (!nextToken || pageTemplates.length < PAGE_SIZE) {
        break
      }
      nextPageToken = nextToken
    }

    if (generationMode && strategyAddedTemplates > 0) {
      break
    }
  }

  const templates = Array.from(templatesMap.values())
  templates.sort((a, b) => {
    const aName = a.name || a.templateId
    const bName = b.name || b.templateId
    return aName.localeCompare(bName)
  })

  return { templates }
})
