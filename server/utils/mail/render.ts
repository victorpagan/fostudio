type TemplateCopy = {
  subject_template?: string | null
  preheader_template?: string | null
  body_template?: string | null
}

function resolvePathValue(source: unknown, path: string): unknown {
  if (!path) return undefined
  const segments = path.split('.').filter(Boolean)
  let cursor: unknown = source
  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object' || !(segment in cursor)) {
      return undefined
    }
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

export function renderMailTemplateString(template: string | null | undefined, context: Record<string, unknown>) {
  return String(template ?? '').replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, token: string) => {
    const value = resolvePathValue(context, token)
    if (value == null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return ''
  }).trim()
}

export function applyRenderedRegistryCopy(payload: Record<string, unknown>, copy: TemplateCopy) {
  const subject = renderMailTemplateString(copy.subject_template, payload)
  const preheader = renderMailTemplateString(copy.preheader_template, payload)
  const body = renderMailTemplateString(copy.body_template, payload)

  if (subject) payload.subject = subject
  if (preheader) payload.preheader = preheader
  if (body) {
    payload.body = body
    payload.bodyHtml = body
    payload.bodyHTML = body
  }

  if (subject || preheader || body) {
    payload.skipRegistryCopyOverrides = true
  }

  return payload
}
