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

function parseInlineStyle(style: string | undefined) {
  const declarations = new Map<string, string>()
  for (const part of String(style ?? '').split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const separatorIndex = trimmed.indexOf(':')
    if (separatorIndex <= 0) continue
    const key = trimmed.slice(0, separatorIndex).trim().toLowerCase()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (!key || !value) continue
    declarations.set(key, value)
  }
  return declarations
}

function stringifyInlineStyle(declarations: Map<string, string>) {
  return [...declarations.entries()]
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
}

function mergeInlineStyle(existingStyle: string | undefined, defaults: Record<string, string>) {
  const declarations = parseInlineStyle(existingStyle)
  for (const [key, value] of Object.entries(defaults)) {
    if (!declarations.has(key)) declarations.set(key, value)
  }
  return stringifyInlineStyle(declarations)
}

function addDefaultInlineStyleToTag(html: string, tagName: string, defaults: Record<string, string>) {
  const tagPattern = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi')
  return html.replace(tagPattern, (_match: string, attributes: string) => {
    const attrs = String(attributes ?? '')
    const styleMatch = attrs.match(/\sstyle=(["'])(.*?)\1/i)
    if (styleMatch) {
      const mergedStyle = mergeInlineStyle(styleMatch[2], defaults)
      const nextAttrs = attrs.replace(/\sstyle=(["'])(.*?)\1/i, ` style="${mergedStyle}"`)
      return `<${tagName}${nextAttrs}>`
    }
    return `<${tagName}${attrs} style="${stringifyInlineStyle(new Map(Object.entries(defaults)))}">`
  })
}

function normalizeEditorHtmlForEmail(html: string) {
  let output = String(html ?? '')
  if (!output.trim()) return output

  output = addDefaultInlineStyleToTag(output, 'p', {
    'margin': '0 0 14px',
    'line-height': '1.6'
  })
  output = addDefaultInlineStyleToTag(output, 'ul', {
    'margin': '0 0 14px',
    'padding-left': '22px',
    'line-height': '1.6'
  })
  output = addDefaultInlineStyleToTag(output, 'ol', {
    'margin': '0 0 14px',
    'padding-left': '22px',
    'line-height': '1.6'
  })
  output = addDefaultInlineStyleToTag(output, 'li', {
    'margin': '0 0 6px',
    'line-height': '1.6'
  })
  output = addDefaultInlineStyleToTag(output, 'blockquote', {
    'margin': '0 0 14px',
    'padding-left': '14px',
    'border-left': '3px solid #d4d4d8',
    'line-height': '1.6'
  })
  output = addDefaultInlineStyleToTag(output, 'h1', {
    'margin': '0 0 14px',
    'font-size': '28px',
    'line-height': '1.2'
  })
  output = addDefaultInlineStyleToTag(output, 'h2', {
    'margin': '18px 0 10px',
    'font-size': '22px',
    'line-height': '1.25'
  })
  output = addDefaultInlineStyleToTag(output, 'h3', {
    'margin': '16px 0 8px',
    'font-size': '18px',
    'line-height': '1.3'
  })
  output = output.replace(/<p\b([^>]*)>\s*<\/p>/gi, '<p$1>&nbsp;</p>')
  output = output.replace(/<p\b([^>]*)>\s*<br\s*\/?>\s*<\/p>/gi, '<p$1>&nbsp;</p>')
  return output
}

export function applyRenderedRegistryCopy(payload: Record<string, unknown>, copy: TemplateCopy) {
  const subject = renderMailTemplateString(copy.subject_template, payload)
  const preheader = renderMailTemplateString(copy.preheader_template, payload)
  const body = normalizeEditorHtmlForEmail(renderMailTemplateString(copy.body_template, payload))

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
