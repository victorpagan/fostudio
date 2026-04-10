import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getKey } from '~~/server/utils/config/secret'

const querySchema = z.object({
  templateId: z.string().trim().min(3).max(255)
})

type SendgridTemplateVersionRaw = {
  id?: string | null
  template_id?: string | null
  active?: number | boolean | null
  name?: string | null
  subject?: string | null
  html_content?: string | null
  plain_content?: string | null
  updated_at?: string | null
  created_at?: string | null
}

type SendgridTemplateRaw = {
  id?: string | null
  name?: string | null
  generation?: string | null
  updated_at?: string | null
  versions?: unknown
}

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

function parseTimeMs(value: string | null | undefined) {
  if (!value) return Number.NaN
  return Date.parse(value)
}

function isActiveVersion(value: SendgridTemplateVersionRaw) {
  return value.active === 1 || value.active === true
}

function selectLatestVersion(versions: SendgridTemplateVersionRaw[]) {
  if (versions.length === 0) return null

  return versions
    .slice()
    .sort((a, b) => {
      const aMs = parseTimeMs(a.updated_at ?? a.created_at ?? null)
      const bMs = parseTimeMs(b.updated_at ?? b.created_at ?? null)
      if (Number.isNaN(aMs) && Number.isNaN(bMs)) return 0
      if (Number.isNaN(aMs)) return 1
      if (Number.isNaN(bMs)) return -1
      return bMs - aMs
    })[0] ?? null
}

function normalizeVersion(value: SendgridTemplateVersionRaw) {
  return {
    id: String(value.id ?? ''),
    name: String(value.name ?? ''),
    active: isActiveVersion(value),
    subject: String(value.subject ?? ''),
    htmlContent: String(value.html_content ?? ''),
    plainContent: String(value.plain_content ?? ''),
    updatedAt: value.updated_at ?? null,
    createdAt: value.created_at ?? null
  }
}

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)

  const { templateId } = querySchema.parse(getQuery(event))
  const normalizedTemplateId = templateId.trim()
  if (!normalizedTemplateId) {
    throw createError({ statusCode: 400, statusMessage: 'templateId is required.' })
  }

  const sendgridApiKey = await getKey(event, 'SENDGRID_API_KEY').catch(() => null)
  if (typeof sendgridApiKey !== 'string' || !sendgridApiKey.trim()) {
    throw createError({ statusCode: 500, statusMessage: 'SENDGRID_API_KEY is not configured.' })
  }

  let template: SendgridTemplateRaw
  try {
    template = await $fetch<SendgridTemplateRaw>(`https://api.sendgrid.com/v3/templates/${encodeURIComponent(normalizedTemplateId)}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${sendgridApiKey.trim()}`
      }
    })
  } catch (error: unknown) {
    const details = readUpstreamErrorDetails(error)
    const upstreamStatus = details?.status ?? 502
    const upstreamMessage = details?.message ?? 'Unexpected SendGrid response.'

    if (upstreamStatus === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: `SendGrid template ${normalizedTemplateId} was not found.`
      })
    }

    if (upstreamStatus === 400) {
      throw createError({
        statusCode: 400,
        statusMessage: `SendGrid rejected template id ${normalizedTemplateId}: ${upstreamMessage}`
      })
    }

    throw createError({
      statusCode: 502,
      statusMessage: details?.payloadText
        ? `Could not load SendGrid template ${normalizedTemplateId}: ${upstreamMessage} | body: ${details.payloadText}`
        : `Could not load SendGrid template ${normalizedTemplateId}: ${upstreamMessage}`
    })
  }

  const versions = Array.isArray(template.versions)
    ? template.versions.filter((item): item is SendgridTemplateVersionRaw => Boolean(item) && typeof item === 'object')
    : []

  const activeVersion = versions.find(version => isActiveVersion(version)) ?? null
  const latestVersion = activeVersion ?? selectLatestVersion(versions)
  const resolvedFrom = activeVersion
    ? 'active'
    : latestVersion
      ? 'latest'
      : 'none'

  return {
    templateId: String(template.id ?? normalizedTemplateId),
    name: String(template.name ?? ''),
    generation: String(template.generation ?? ''),
    updatedAt: template.updated_at ?? null,
    resolvedFrom,
    selectedVersion: latestVersion ? normalizeVersion(latestVersion) : null
  }
})
