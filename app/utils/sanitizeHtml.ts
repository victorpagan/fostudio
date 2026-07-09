import { parseFragment, serialize } from 'parse5'

type HtmlAttribute = {
  name: string
  value: string
}

type HtmlNode = {
  nodeName: string
  tagName?: string
  attrs?: HtmlAttribute[]
  childNodes?: HtmlNode[]
  parentNode?: HtmlNode | null
}

const allowedTags = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strike',
  'strong',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul'
])

const dropWithContents = new Set([
  'applet',
  'audio',
  'embed',
  'iframe',
  'math',
  'noscript',
  'object',
  'script',
  'style',
  'svg',
  'template',
  'video'
])

function isSafeHref(value: string) {
  const normalized = Array.from(value.trim())
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 0x1f && codePoint !== 0x7f && !/\s/u.test(character)
    })
    .join('')
  if (!normalized) return false
  if (/^(https?:|mailto:|tel:|#)/i.test(normalized)) return true
  return /^(\/(?!\/)|\.\.?\/)/.test(normalized)
}

function sanitizeAttributes(node: HtmlNode, tagName: string) {
  const safeAttributes: HtmlAttribute[] = []

  for (const attribute of node.attrs ?? []) {
    const name = attribute.name.toLowerCase()
    const value = attribute.value.trim()

    if (tagName === 'a' && name === 'href' && isSafeHref(value)) {
      safeAttributes.push({ name: 'href', value })
      continue
    }

    if (tagName === 'a' && name === 'title' && value) {
      safeAttributes.push({ name: 'title', value })
      continue
    }

    if (tagName === 'a' && name === 'target' && ['_blank', '_self'].includes(value.toLowerCase())) {
      safeAttributes.push({ name: 'target', value: value.toLowerCase() })
      continue
    }

    if (['td', 'th'].includes(tagName) && ['colspan', 'rowspan'].includes(name) && /^\d{1,2}$/.test(value)) {
      safeAttributes.push({ name, value })
    }
  }

  if (tagName === 'a' && safeAttributes.some(attribute => attribute.name === 'target' && attribute.value === '_blank')) {
    safeAttributes.push({ name: 'rel', value: 'noopener noreferrer' })
  }

  node.attrs = safeAttributes
}

function sanitizeChildren(parent: HtmlNode) {
  const safeChildren: HtmlNode[] = []

  for (const node of parent.childNodes ?? []) {
    if (node.nodeName === '#text') {
      safeChildren.push(node)
      continue
    }

    const tagName = (node.tagName ?? node.nodeName).toLowerCase()
    if (dropWithContents.has(tagName)) continue

    sanitizeChildren(node)

    if (!allowedTags.has(tagName)) {
      for (const child of node.childNodes ?? []) {
        child.parentNode = parent
        safeChildren.push(child)
      }
      continue
    }

    sanitizeAttributes(node, tagName)
    node.parentNode = parent
    safeChildren.push(node)
  }

  parent.childNodes = safeChildren
}

export function sanitizeRichHtml(value: string) {
  if (!value.trim()) return ''

  const fragment = parseFragment(value)
  sanitizeChildren(fragment as unknown as HtmlNode)
  return serialize(fragment)
}
