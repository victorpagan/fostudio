type TiptapMark = {
  type?: string
  attrs?: Record<string, unknown> | null
}

type TiptapNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown> | null
  marks?: TiptapMark[] | null
  content?: TiptapNode[] | null
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function parseMaybeJson(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function asNodeArray(value: unknown): TiptapNode[] {
  if (!Array.isArray(value)) return []
  return value as TiptapNode[]
}

function renderChildren(nodes: TiptapNode[] | null | undefined): string {
  return asNodeArray(nodes).map(renderNode).join('')
}

function applyMarks(base: string, marks: TiptapMark[] | null | undefined): string {
  let output = base
  for (const mark of marks ?? []) {
    const markType = (mark?.type ?? '').toLowerCase()
    if (markType === 'bold') output = `<strong>${output}</strong>`
    else if (markType === 'italic') output = `<em>${output}</em>`
    else if (markType === 'underline') output = `<u>${output}</u>`
    else if (markType === 'strike') output = `<s>${output}</s>`
    else if (markType === 'code') output = `<code>${output}</code>`
    else if (markType === 'link') {
      const href = typeof mark?.attrs?.href === 'string' ? mark.attrs.href : ''
      const safeHref = href ? escapeAttr(href) : '#'
      output = `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${output}</a>`
    }
  }
  return output
}

function renderNode(node: TiptapNode): string {
  const type = (node?.type ?? '').toLowerCase()
  if (type === 'text') {
    const textValue = typeof node.text === 'string' ? node.text : ''
    return applyMarks(escapeHtml(textValue), node.marks)
  }
  if (type === 'hardbreak') return '<br>'
  if (type === 'paragraph') {
    const content = renderChildren(node.content)
    return `<p>${content || '<br>'}</p>`
  }
  if (type === 'heading') {
    const levelRaw = Number(node.attrs?.level)
    const level = Number.isFinite(levelRaw) ? Math.min(Math.max(levelRaw, 1), 6) : 2
    return `<h${level}>${renderChildren(node.content)}</h${level}>`
  }
  if (type === 'bulletlist') return `<ul>${renderChildren(node.content)}</ul>`
  if (type === 'orderedlist') return `<ol>${renderChildren(node.content)}</ol>`
  if (type === 'listitem') return `<li>${renderChildren(node.content)}</li>`
  if (type === 'blockquote') return `<blockquote>${renderChildren(node.content)}</blockquote>`
  if (type === 'horizontalrule') return '<hr>'
  if (type === 'codeblock') return `<pre><code>${escapeHtml(extractText(node.content))}</code></pre>`
  if (type === 'doc') return renderChildren(node.content)
  return renderChildren(node.content)
}

function extractText(nodes: TiptapNode[] | null | undefined): string {
  return asNodeArray(nodes)
    .map((node) => {
      const type = (node?.type ?? '').toLowerCase()
      if (type === 'text') return typeof node.text === 'string' ? node.text : ''
      if (type === 'hardbreak') return '\n'
      return extractText(node.content)
    })
    .join('')
}

function renderJsonToHtml(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const node = value as TiptapNode
  const type = (node.type ?? '').toLowerCase()
  if (type !== 'doc') return ''
  return renderNode(node)
}

function normalizePlainText(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>')
}

export function toRenderableHtml(input: unknown): string {
  if (typeof input === 'string') {
    const value = input.trim()
    if (!value) return ''
    if (/<\/?[a-z][\s\S]*>/i.test(value)) return input

    const parsed = parseMaybeJson(value)
    const fromJson = parsed ? renderJsonToHtml(parsed) : ''
    if (fromJson) return fromJson

    return normalizePlainText(input)
  }

  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>
    if (typeof record.html === 'string') return toRenderableHtml(record.html)
    if (typeof record.content === 'string') return toRenderableHtml(record.content)

    const fromJson = renderJsonToHtml(record)
    if (fromJson) return fromJson
  }

  return ''
}
