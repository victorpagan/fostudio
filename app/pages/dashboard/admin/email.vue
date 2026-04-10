<script setup lang="ts">
import type { Editor as TiptapEditor } from '@tiptap/vue-3'
import { pickImageFromDevice, uploadEditorImage } from '~~/app/utils/editorImageUpload'

definePageMeta({ middleware: ['admin'] })

type MailTemplateCategory = 'critical' | 'non_critical'

type AdminMailTemplate = {
  eventType: string
  sendgridTemplateId: string
  category: MailTemplateCategory
  active: boolean
  description: string
  subjectTemplate: string
  preheaderTemplate: string
  bodyTemplate: string
}

type AdminEmailSettingsResponse = {
  adminCopies: {
    criticalEnabled: boolean
    nonCriticalEnabled: boolean
    recipients: string[]
  }
  templates: AdminMailTemplate[]
  availableVariablesByEvent: Record<string, string[]>
}

const BROADCAST_EVENT_TYPE = 'mailing.memberBroadcast'
const FULL_HTML_DOCUMENT_PATTERN = /<html[\s>]|<body[\s>]|<!doctype/i

const REGISTRY_BASE_PREVIEW_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { margin:0; padding:24px 0; background:#f5f5f5; font-family:Arial,Helvetica,sans-serif; color:#111; }
    .main { width:100%; max-width:640px; margin:0 auto; background:#fff; border:1px solid #ececec; border-radius:14px; overflow:hidden; }
    .header { background:#111; color:#fff; padding:22px 24px; }
    .header h1 { margin:0; font-size:20px; line-height:1.3; }
    .header p { margin:8px 0 0; font-size:13px; color:#d7d7d7; }
    .body { padding:22px 24px; line-height:1.6; font-size:14px; color:#222; }
    img { max-width:100%; height:auto; display:block; }
  </style>
</head>
<body>
  <div class="main">
    <div class="header">
      <h1>{{subject}}</h1>
      <p>{{preheader}}</p>
    </div>
    <div class="body">{{{bodyHTML}}}</div>
  </div>
</body>
</html>`

const toast = useToast()
const saving = ref(false)
const sendingTest = ref(false)
const pending = ref(false)
const recipientsInput = ref('')
const testRecipient = ref('')
const templates = ref<AdminMailTemplate[]>([])
const availableVariablesByEvent = ref<Record<string, string[]>>({ '*': [] })
const selectedTemplateIndex = ref(0)
const templateDraft = ref<AdminMailTemplate | null>(null)

const adminCopies = reactive({
  criticalEnabled: true,
  nonCriticalEnabled: false
})

function applySettings(res: AdminEmailSettingsResponse) {
  adminCopies.criticalEnabled = Boolean(res.adminCopies.criticalEnabled)
  adminCopies.nonCriticalEnabled = Boolean(res.adminCopies.nonCriticalEnabled)
  recipientsInput.value = (res.adminCopies.recipients ?? []).join('\n')
  templates.value = (res.templates ?? []).map(template => ({
    eventType: template.eventType,
    sendgridTemplateId: template.sendgridTemplateId,
    category: template.category,
    active: Boolean(template.active),
    description: template.description ?? '',
    subjectTemplate: template.subjectTemplate ?? '',
    preheaderTemplate: template.preheaderTemplate ?? '',
    bodyTemplate: template.bodyTemplate ?? ''
  }))
  availableVariablesByEvent.value = res.availableVariablesByEvent ?? { '*': [] }

  if (templates.value.length === 0) {
    selectedTemplateIndex.value = 0
    templateDraft.value = null
    return
  }

  if (selectedTemplateIndex.value >= templates.value.length) {
    selectedTemplateIndex.value = 0
  }

  templateDraft.value = { ...templates.value[selectedTemplateIndex.value]! }
}

async function loadSettings(options: { silent?: boolean } = {}) {
  pending.value = true
  try {
    const res = await $fetch<AdminEmailSettingsResponse>('/api/admin/email/settings')
    applySettings(res)
  } catch (error: unknown) {
    if (!options.silent) {
      toast.add({
        title: 'Could not load email settings',
        description: readErrorMessage(error),
        color: 'error'
      })
    }
  } finally {
    pending.value = false
  }
}

onMounted(() => {
  void loadSettings({ silent: true })
})

const selectedTemplateVariables = computed(() => {
  const draft = templateDraft.value
  if (!draft) return [] as string[]

  const common = availableVariablesByEvent.value['*'] ?? []
  const specific = draft.eventType ? (availableVariablesByEvent.value[draft.eventType] ?? []) : []
  return [...new Set([...common, ...specific])]
})

const templateCategoryItems: Array<{ label: string, value: MailTemplateCategory }> = [
  { label: 'critical', value: 'critical' },
  { label: 'non_critical', value: 'non_critical' }
]

const broadcastTemplateIndex = computed(() => {
  return templates.value.findIndex(template => template.eventType === BROADCAST_EVENT_TYPE)
})

const broadcastTemplate = computed<AdminMailTemplate | null>(() => {
  const index = broadcastTemplateIndex.value
  if (index < 0) return null
  return templates.value[index] ?? null
})

const emailMentionItems = [
  {
    id: 'ops',
    label: 'Ops',
    description: 'Studio operations note',
    icon: 'i-lucide-cog'
  },
  {
    id: 'support',
    label: 'Support',
    description: 'hello@lafilmlab.com',
    icon: 'i-lucide-mail'
  },
  {
    id: 'bookings',
    label: 'Bookings',
    description: 'Scheduling and access context',
    icon: 'i-lucide-calendar-check-2'
  }
]

const emailEmojiItems = [
  { name: 'Sparkles', emoji: '✨', shortcodes: ['sparkles'], tags: ['highlight'] },
  { name: 'Camera', emoji: '📷', shortcodes: ['camera'], tags: ['photo'] },
  { name: 'Studio Light', emoji: '💡', shortcodes: ['light_bulb'], tags: ['lighting'] },
  { name: 'Calendar', emoji: '📅', shortcodes: ['calendar'], tags: ['booking'] },
  { name: 'Memo', emoji: '📝', shortcodes: ['memo'], tags: ['note'] },
  { name: 'Warning', emoji: '⚠️', shortcodes: ['warning'], tags: ['important'] },
  { name: 'Rocket', emoji: '🚀', shortcodes: ['rocket'], tags: ['launch'] },
  { name: 'Waving Hand', emoji: '👋', shortcodes: ['wave'], tags: ['greeting'] }
]

const EDITOR_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_IMAGE_MAX_WIDTH = '640px'
const emailEditorDragHandleOptions = {
  placement: 'left-start',
  offset: {
    mainAxis: -6,
    alignmentAxis: 0
  }
} as const

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

function buildEditorImageStyle(existingStyle: string | undefined, maxWidth: string) {
  const declarations = parseInlineStyle(existingStyle)
  declarations.delete('width')
  declarations.set('max-width', maxWidth)
  declarations.set('height', 'auto')
  if (!declarations.has('display')) declarations.set('display', 'block')
  return stringifyInlineStyle(declarations)
}

function updateSelectedImageStyle(editor: TiptapEditor, maxWidth: string) {
  if (!editor.isActive('image')) return editor.chain()
  const attrs = editor.getAttributes('image') as { style?: string }
  return editor
    .chain()
    .focus()
    .updateAttributes('image', {
      style: buildEditorImageStyle(attrs.style, maxWidth)
    })
}

const emailEditorHandlers = {
  insertToken: {
    canExecute: () => true,
    execute: (editor: TiptapEditor, cmd?: { token?: string }) => {
      const token = String(cmd?.token ?? '').trim()
      if (!token) return editor.chain()
      return editor.chain().focus().insertContent(`{{ ${token} }}`)
    },
    isActive: () => false
  },
  image: {
    canExecute: (editor: TiptapEditor) => editor.can().setImage({ src: 'https://fo.studio/images/logo.png' }),
    execute: (editor: TiptapEditor) => {
      void (async () => {
        try {
          const image = await pickImageFromDevice({ maxBytes: EDITOR_IMAGE_MAX_BYTES })
          if (!image) return
          const uploaded = await uploadEditorImage(image.file)

          editor
            .chain()
            .focus()
            .setImage({
              src: uploaded.url,
              alt: image.file.name,
              title: image.file.name,
              style: buildEditorImageStyle('', DEFAULT_IMAGE_MAX_WIDTH)
            })
            .run()
        } catch (error: unknown) {
          toast.add({
            title: 'Could not insert image',
            description: readErrorMessage(error),
            color: 'error'
          })
        }
      })()

      return editor.chain()
    },
    isActive: (editor: TiptapEditor) => editor.isActive('image'),
    isDisabled: (editor: TiptapEditor) => !editor.can().setImage({ src: 'https://fo.studio/images/logo.png' })
  },
  imageSizeSmall: {
    canExecute: (editor: TiptapEditor) => editor.isActive('image'),
    execute: (editor: TiptapEditor) => updateSelectedImageStyle(editor, '320px'),
    isActive: (editor: TiptapEditor) => editor.isActive('image'),
    isDisabled: (editor: TiptapEditor) => !editor.isActive('image')
  },
  imageSizeMedium: {
    canExecute: (editor: TiptapEditor) => editor.isActive('image'),
    execute: (editor: TiptapEditor) => updateSelectedImageStyle(editor, '480px'),
    isActive: (editor: TiptapEditor) => editor.isActive('image'),
    isDisabled: (editor: TiptapEditor) => !editor.isActive('image')
  },
  imageSizeLarge: {
    canExecute: (editor: TiptapEditor) => editor.isActive('image'),
    execute: (editor: TiptapEditor) => updateSelectedImageStyle(editor, '640px'),
    isActive: (editor: TiptapEditor) => editor.isActive('image'),
    isDisabled: (editor: TiptapEditor) => !editor.isActive('image')
  },
  imageSizeFull: {
    canExecute: (editor: TiptapEditor) => editor.isActive('image'),
    execute: (editor: TiptapEditor) => updateSelectedImageStyle(editor, '100%'),
    isActive: (editor: TiptapEditor) => editor.isActive('image'),
    isDisabled: (editor: TiptapEditor) => !editor.isActive('image')
  }
}

function buildSuggestionItems(tokens: string[]) {
  const tokenItems = tokens
    .filter(Boolean)
    .slice(0, 50)
    .map(token => ({
      label: `Insert {{ ${token} }}`,
      description: 'Template variable',
      icon: 'i-lucide-braces',
      kind: 'insertToken',
      token
    }))

  return [[
    {
      label: 'Paragraph',
      description: 'Start with plain text',
      icon: 'i-lucide-pilcrow',
      kind: 'paragraph'
    },
    {
      label: 'Heading 2',
      description: 'Section heading',
      icon: 'i-lucide-heading-2',
      kind: 'heading',
      level: 2
    },
    {
      label: 'Bullet List',
      description: 'Add list items',
      icon: 'i-lucide-list',
      kind: 'bulletList'
    },
    {
      label: 'Numbered List',
      description: 'Add ordered steps',
      icon: 'i-lucide-list-ordered',
      kind: 'orderedList'
    },
    {
      label: 'Quote',
      description: 'Insert blockquote',
      icon: 'i-lucide-text-quote',
      kind: 'blockquote'
    },
    {
      label: 'Divider',
      description: 'Insert horizontal rule',
      icon: 'i-lucide-separator-horizontal',
      kind: 'horizontalRule'
    },
    {
      label: 'Image Upload',
      description: 'Upload and insert image',
      icon: 'i-lucide-image',
      kind: 'image'
    }
  ], tokenItems.length
    ? [{
        type: 'label',
        label: 'Template Variables'
      }, ...tokenItems]
    : []]
}

const selectedEditorSuggestionItems = computed(() => buildSuggestionItems(selectedTemplateVariables.value))

const emailEditorToolbarItems = [[{
  kind: 'undo',
  icon: 'i-lucide-undo',
  tooltip: { text: 'Undo' }
}, {
  kind: 'redo',
  icon: 'i-lucide-redo',
  tooltip: { text: 'Redo' }
}], [{
  icon: 'i-lucide-heading',
  tooltip: { text: 'Headings' },
  content: { align: 'start' },
  items: [{
    kind: 'paragraph',
    label: 'Paragraph',
    icon: 'i-lucide-pilcrow'
  }, {
    kind: 'heading',
    level: 1,
    icon: 'i-lucide-heading-1',
    label: 'Heading 1'
  }, {
    kind: 'heading',
    level: 2,
    icon: 'i-lucide-heading-2',
    label: 'Heading 2'
  }, {
    kind: 'heading',
    level: 3,
    icon: 'i-lucide-heading-3',
    label: 'Heading 3'
  }, {
    kind: 'heading',
    level: 4,
    icon: 'i-lucide-heading-4',
    label: 'Heading 4'
  }]
}, {
  icon: 'i-lucide-list',
  tooltip: { text: 'Lists' },
  content: { align: 'start' },
  items: [{
    kind: 'bulletList',
    icon: 'i-lucide-list',
    label: 'Bullet list'
  }, {
    kind: 'orderedList',
    icon: 'i-lucide-list-ordered',
    label: 'Ordered list'
  }]
}, {
  kind: 'blockquote',
  icon: 'i-lucide-text-quote',
  tooltip: { text: 'Blockquote' }
}, {
  kind: 'codeBlock',
  icon: 'i-lucide-square-code',
  tooltip: { text: 'Code block' }
}], [{
  kind: 'mark',
  mark: 'bold',
  icon: 'i-lucide-bold',
  tooltip: { text: 'Bold' }
}, {
  kind: 'mark',
  mark: 'italic',
  icon: 'i-lucide-italic',
  tooltip: { text: 'Italic' }
}, {
  kind: 'mark',
  mark: 'underline',
  icon: 'i-lucide-underline',
  tooltip: { text: 'Underline' }
}, {
  kind: 'mark',
  mark: 'strike',
  icon: 'i-lucide-strikethrough',
  tooltip: { text: 'Strikethrough' }
}, {
  kind: 'mark',
  mark: 'code',
  icon: 'i-lucide-code',
  tooltip: { text: 'Inline code' }
}], [{
  kind: 'link',
  icon: 'i-lucide-link',
  tooltip: { text: 'Link' }
}, {
  kind: 'image',
  icon: 'i-lucide-image',
  tooltip: { text: 'Upload image' }
}, {
  icon: 'i-lucide-scaling',
  tooltip: { text: 'Image size' },
  content: { align: 'start' },
  items: [{
    kind: 'imageSizeSmall',
    icon: 'i-lucide-image',
    label: 'Image width 320px'
  }, {
    kind: 'imageSizeMedium',
    icon: 'i-lucide-image',
    label: 'Image width 480px'
  }, {
    kind: 'imageSizeLarge',
    icon: 'i-lucide-image',
    label: 'Image width 640px'
  }, {
    kind: 'imageSizeFull',
    icon: 'i-lucide-expand',
    label: 'Image full width'
  }]
}, {
  kind: 'mention',
  icon: 'i-lucide-at-sign',
  tooltip: { text: 'Mention menu' }
}, {
  kind: 'emoji',
  icon: 'i-lucide-smile',
  tooltip: { text: 'Emoji menu' }
}, {
  kind: 'horizontalRule',
  icon: 'i-lucide-separator-horizontal',
  tooltip: { text: 'Horizontal rule' }
}, {
  icon: 'i-lucide-align-justify',
  tooltip: { text: 'Text align' },
  content: { align: 'end' },
  items: [{
    kind: 'textAlign',
    align: 'left',
    icon: 'i-lucide-align-left',
    label: 'Align left'
  }, {
    kind: 'textAlign',
    align: 'center',
    icon: 'i-lucide-align-center',
    label: 'Align center'
  }, {
    kind: 'textAlign',
    align: 'right',
    icon: 'i-lucide-align-right',
    label: 'Align right'
  }, {
    kind: 'textAlign',
    align: 'justify',
    icon: 'i-lucide-align-justify',
    label: 'Align justify'
  }]
}, {
  kind: 'clearFormatting',
  icon: 'i-lucide-eraser',
  tooltip: { text: 'Clear formatting' }
}]]

const emailEditorBubbleToolbarItems = [[{
  kind: 'mark',
  mark: 'bold',
  icon: 'i-lucide-bold',
  tooltip: { text: 'Bold' }
}, {
  kind: 'mark',
  mark: 'italic',
  icon: 'i-lucide-italic',
  tooltip: { text: 'Italic' }
}, {
  kind: 'mark',
  mark: 'underline',
  icon: 'i-lucide-underline',
  tooltip: { text: 'Underline' }
}, {
  kind: 'mark',
  mark: 'strike',
  icon: 'i-lucide-strikethrough',
  tooltip: { text: 'Strikethrough' }
}, {
  kind: 'mark',
  mark: 'code',
  icon: 'i-lucide-code',
  tooltip: { text: 'Inline code' }
}], [{
  kind: 'link',
  icon: 'i-lucide-link',
  tooltip: { text: 'Link' }
}, {
  kind: 'image',
  icon: 'i-lucide-image',
  tooltip: { text: 'Upload image' }
}, {
  icon: 'i-lucide-scaling',
  tooltip: { text: 'Image size' },
  content: { align: 'start' },
  items: [{
    kind: 'imageSizeSmall',
    icon: 'i-lucide-image',
    label: 'Image width 320px'
  }, {
    kind: 'imageSizeMedium',
    icon: 'i-lucide-image',
    label: 'Image width 480px'
  }, {
    kind: 'imageSizeLarge',
    icon: 'i-lucide-image',
    label: 'Image width 640px'
  }, {
    kind: 'imageSizeFull',
    icon: 'i-lucide-expand',
    label: 'Image full width'
  }]
}, {
  kind: 'clearFormatting',
  icon: 'i-lucide-eraser',
  tooltip: { text: 'Clear formatting' }
}]]

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

function parseRecipients(input: string) {
  return [...new Set(
    input
      .split(/[\n,]+/)
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  )]
}

function formatVariableToken(variableName: string) {
  return `{{ ${variableName} }}`
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

function assignPathValue(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split('.').filter(Boolean)
  if (!segments.length) return

  let cursor: Record<string, unknown> = target
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!
    const current = cursor[segment]
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      cursor[segment] = {}
    }
    cursor = cursor[segment] as Record<string, unknown>
  }

  cursor[segments.at(-1)!] = value
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function renderTokenTemplate(template: string, context: Record<string, unknown>) {
  return template.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, tokenPath: string) => {
    const value = resolvePathValue(context, tokenPath)
    if (value == null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
    return ''
  })
}

function isTruthyTemplateValue(value: unknown) {
  if (value == null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  return true
}

function renderHandlebarsLikeTemplate(template: string, context: Record<string, unknown>): string {
  let output = template
  const ifPattern = /{{#if\s+([A-Za-z0-9_.-]+)}}([\s\S]*?){{\/if}}/g

  for (let i = 0; i < 20; i += 1) {
    let replaced = false
    output = output.replace(ifPattern, (_match, tokenPath: string, inner: string) => {
      replaced = true
      const value = resolvePathValue(context, tokenPath)
      return isTruthyTemplateValue(value) ? inner : ''
    })
    if (!replaced) break
  }

  output = output.replace(/{{{\s*([A-Za-z0-9_.-]+)\s*}}}/g, (_match, tokenPath: string) => {
    const value = resolvePathValue(context, tokenPath)
    if (value == null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
    return ''
  })

  output = output.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, tokenPath: string) => {
    const value = resolvePathValue(context, tokenPath)
    if (value == null) return ''
    if (typeof value === 'string') return escapeHtml(value)
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return escapeHtml(String(value))
    }
    return ''
  })

  return output
}

function sampleValueForToken(tokenPath: string) {
  const leaf = tokenPath.split('.').at(-1)?.toLowerCase() ?? tokenPath.toLowerCase()

  if (leaf.includes('email')) return 'member@example.com'
  if (leaf.includes('name')) return 'FO Studio Member'
  if (leaf.includes('code')) return '2468'
  if (leaf.includes('phone')) return '(323) 555-0186'
  if (leaf.includes('url') || leaf.includes('link')) return 'https://fo.studio'
  if (leaf.includes('city')) return 'Los Angeles'
  if (leaf.includes('state')) return 'CA'
  if (leaf.includes('zip')) return '90065'
  if (leaf.includes('start') || leaf.includes('end') || leaf.includes('date') || leaf.includes('time')) {
    return 'Apr 2, 2026 6:00 PM'
  }
  if (leaf.includes('tier') || leaf.includes('plan')) return 'Pro'
  if (leaf.includes('cadence')) return 'Monthly'
  if (leaf.includes('credit') || leaf.includes('count')) return 12
  if (leaf.includes('amount') || leaf.includes('price') || leaf.includes('cost') || leaf.includes('dollar')) return '$45.00'
  if (leaf.includes('active') || leaf.startsWith('is_') || leaf.startsWith('has_')) return true

  return `Sample ${leaf.replaceAll('_', ' ')}`
}

function hasEditorContent(value: string | null | undefined) {
  const source = String(value ?? '')
  if (!source.trim()) return false
  if (/<img\b/i.test(source)) return true

  const plainText = source
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return plainText.length > 0
}

function editorPlaceholder(value: string | null | undefined, fallback: string) {
  return hasEditorContent(value) ? undefined : fallback
}

function hasTemplateId(template: AdminMailTemplate) {
  return template.sendgridTemplateId.trim().length > 0
}

const previewViewport = ref<'desktop' | 'mobile'>('desktop')
const registryPreviewFrameSandbox = import.meta.dev ? 'allow-same-origin allow-scripts' : 'allow-same-origin'

const registryPreviewContext = computed(() => {
  const draft = templateDraft.value
  const context: Record<string, unknown> = {}

  for (const token of selectedTemplateVariables.value) {
    assignPathValue(context, token, sampleValueForToken(token))
  }

  const subjectSource = String(draft?.subjectTemplate ?? '').trim()
  const preheaderSource = String(draft?.preheaderTemplate ?? '').trim()
  const bodySource = String(draft?.bodyTemplate ?? '').trim()

  const subject = subjectSource
    ? renderTokenTemplate(subjectSource, context).trim()
    : 'FO Studio account update'

  const preheader = preheaderSource
    ? renderTokenTemplate(preheaderSource, { ...context, subject }).trim()
    : 'Preview generated from current registry draft.'

  const bodyHTML = bodySource
    ? renderHandlebarsLikeTemplate(bodySource, { ...context, subject, preheader }).trim()
    : '<p>Template body preview will appear here.</p>'

  return {
    ...context,
    subject,
    preheader,
    bodyHTML
  }
})

const registryPreviewShell = computed<'base' | 'document'>(() => {
  const draft = templateDraft.value
  const body = String(draft?.bodyTemplate ?? '')
  if (FULL_HTML_DOCUMENT_PATTERN.test(body)) return 'document'

  // Registry rows map to specific SendGrid template IDs. For standard base templates,
  // we wrap bodyHTML into the expected subject/preheader/body shell.
  if (draft?.sendgridTemplateId?.trim()) return 'base'
  return 'base'
})

const registryPreviewHtml = computed(() => {
  const context = registryPreviewContext.value
  if (registryPreviewShell.value === 'document') {
    return renderHandlebarsLikeTemplate(String(templateDraft.value?.bodyTemplate ?? ''), context)
  }
  return renderHandlebarsLikeTemplate(REGISTRY_BASE_PREVIEW_TEMPLATE, context)
})

function selectTemplate(index: number) {
  const selected = templates.value[index]
  if (!selected) return
  selectedTemplateIndex.value = index
  templateDraft.value = { ...selected }
  const fallbackRecipient = parseRecipients(recipientsInput.value)[0] ?? ''
  testRecipient.value = fallbackRecipient
}

async function saveSettings(options: { silentSuccessToast?: boolean } = {}): Promise<boolean> {
  saving.value = true
  try {
    const payload = {
      adminCopies: {
        criticalEnabled: adminCopies.criticalEnabled,
        nonCriticalEnabled: adminCopies.nonCriticalEnabled,
        recipients: parseRecipients(recipientsInput.value)
      },
      templates: templates.value
        .map(template => ({
          eventType: template.eventType.trim(),
          sendgridTemplateId: template.sendgridTemplateId.trim(),
          category: template.category,
          active: Boolean(template.active),
          description: template.description.trim(),
          subjectTemplate: template.subjectTemplate,
          preheaderTemplate: template.preheaderTemplate,
          bodyTemplate: template.bodyTemplate
        }))
        .filter(template => template.eventType && template.sendgridTemplateId)
    }

    await $fetch('/api/admin/email/settings.upsert', {
      method: 'POST',
      body: payload
    })

    if (!options.silentSuccessToast) {
      toast.add({ title: 'Email settings saved', color: 'success' })
    }
    await loadSettings({ silent: true })
    return true
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save email settings',
      description: readErrorMessage(error),
      color: 'error'
    })
    return false
  } finally {
    saving.value = false
  }
}

async function saveSelectedTemplate() {
  const index = selectedTemplateIndex.value
  const draft = templateDraft.value
  if (!draft) return
  templates.value[index] = { ...draft }
  await saveSettings({ silentSuccessToast: false })
}

async function sendTemplateTest() {
  const draft = templateDraft.value
  if (!draft) return

  sendingTest.value = true
  try {
    const res = await $fetch<{
      recipient: string
      mailer?: { skipped_reason?: string }
      isActive: boolean
    }>('/api/admin/email/test', {
      method: 'POST',
      body: {
        eventType: draft.eventType,
        recipient: testRecipient.value.trim() || undefined
      }
    })

    const skippedReason = res.mailer?.skipped_reason
    if (skippedReason) {
      toast.add({
        title: 'Test send skipped',
        description: `Reason: ${skippedReason}. ${res.isActive ? '' : 'This registry event is inactive.'}`.trim(),
        color: 'warning'
      })
      return
    }

    toast.add({
      title: 'Test email sent',
      description: `Sent to ${res.recipient} using sample dynamic data.`,
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({
      title: 'Could not send test email',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    sendingTest.value = false
  }
}

watch(templates, (nextTemplates) => {
  if (nextTemplates.length === 0) {
    templateDraft.value = null
    selectedTemplateIndex.value = 0
    return
  }

  if (selectedTemplateIndex.value >= nextTemplates.length) {
    selectedTemplateIndex.value = 0
  }

  if (!templateDraft.value) {
    templateDraft.value = { ...nextTemplates[selectedTemplateIndex.value]! }
  }
}, { immediate: true })
</script>

<template>
  <div class="contents">
    <DashboardPageScaffold
      panel-id="admin-email-settings"
      title="Email Settings"
    >
      <template #right>
        <DashboardActionGroup
          :secondary="[
            {
              label: 'Refresh',
              icon: 'i-lucide-refresh-cw',
              color: 'neutral',
              variant: 'soft',
              loading: pending,
              onSelect: () => loadSettings()
            }
          ]"
        />
      </template>
      <div class="rounded-lg border border-info/30 bg-info/10 p-3 sm:p-4">
        <div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="space-y-1">
            <div class="text-sm font-medium text-highlighted">
              Centralized mail controls
            </div>
            <div class="text-xs text-dimmed">
              Configure admin copies and SendGrid template mapping by event type. Supports
              <code>{{ formatVariableToken('variableName') }}</code> interpolation for subject, preheader, and body.
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-dimmed">
              <span>Member broadcast now uses dedicated campaigns.</span>
              <code class="rounded bg-elevated px-2 py-0.5 break-all">{{ BROADCAST_EVENT_TYPE }}</code>
              <UBadge
                :color="broadcastTemplate && hasTemplateId(broadcastTemplate) ? 'success' : 'warning'"
                variant="soft"
                size="sm"
              >
                {{ broadcastTemplate && hasTemplateId(broadcastTemplate) ? 'template id set' : 'template id needed' }}
              </UBadge>
            </div>
          </div>
          <UButton
            icon="i-lucide-megaphone"
            class="w-full sm:w-auto"
            to="/dashboard/admin/email-campaigns"
          >
            Open email campaigns
          </UButton>
        </div>
      </div>

      <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="space-y-4">
          <UCard v-if="templateDraft">
            <div class="space-y-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-medium">
                    Compose registry event
                  </div>
                  <div class="text-xs text-dimmed mt-0.5">
                    Edit SendGrid mapping and copy for the selected event type.
                  </div>
                </div>
                <UBadge
                  :color="templateDraft.active ? 'success' : 'neutral'"
                  variant="soft"
                  size="sm"
                >
                  {{ templateDraft.active ? 'active' : 'inactive' }}
                </UBadge>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Event type">
                  <UInput
                    :model-value="templateDraft.eventType"
                    class="w-full"
                    disabled
                    readonly
                  />
                </UFormField>
                <UFormField label="SendGrid template id">
                  <UInput
                    v-model="templateDraft.sendgridTemplateId"
                    class="w-full"
                    placeholder="d-xxxxxxxxxxxxxxxxxxxx"
                  />
                </UFormField>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Category">
                  <USelect
                    v-model="templateDraft.category"
                    :items="templateCategoryItems"
                    class="w-full"
                  />
                </UFormField>

                <UFormField label="Description">
                  <UInput
                    v-model="templateDraft.description"
                    class="w-full"
                    placeholder="Optional"
                  />
                </UFormField>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Subject template">
                  <UInput
                    v-model="templateDraft.subjectTemplate"
                    class="w-full"
                    placeholder="FO Studio: {{ tierName }} membership update"
                  />
                </UFormField>

                <UFormField label="Preheader template">
                  <UInput
                    v-model="templateDraft.preheaderTemplate"
                    class="w-full"
                    placeholder="{{ cadenceLabel }} plan update and next steps"
                  />
                </UFormField>
              </div>

              <UFormField
                label="Test recipient"
                description="Optional. If blank, this sends to your admin account email."
              >
                <UInput
                  v-model="testRecipient"
                  class="w-full"
                  placeholder="name@example.com"
                />
              </UFormField>

              <UFormField label="Body template (HTML)">
                <template #description>
                  Use <code v-pre>{{ variableName }}</code> tokens only. No <code v-pre>{{#if}}</code> or <code v-pre>{{/if}}</code> blocks.
                </template>
                <UEditor
                  v-slot="{ editor }"
                  v-model="templateDraft.bodyTemplate"
                  content-type="html"
                  :handlers="emailEditorHandlers"
                  :image="{ allowBase64: false }"
                  :mention="{ HTMLAttributes: { class: 'mention' } }"
                  :ui="{ base: 'px-4 py-4 md:px-5 md:py-5' }"
                  class="email-editor-shell w-full rounded-md border border-default bg-default overflow-visible"
                  :placeholder="editorPlaceholder(templateDraft.bodyTemplate, 'Write HTML body content. Example: <p>Your {{ tierName }} membership is active.</p>')"
                >
                  <UEditorToolbar
                    :editor="editor"
                    :items="emailEditorToolbarItems"
                    class="border-b border-default sticky top-0 inset-x-0 p-1.5 z-10 bg-default/95 backdrop-blur overflow-x-auto"
                  />
                  <UEditorToolbar
                    :editor="editor"
                    :items="emailEditorBubbleToolbarItems"
                    layout="bubble"
                  />
                  <UEditorSuggestionMenu
                    :editor="editor"
                    :items="selectedEditorSuggestionItems"
                  />
                  <UEditorMentionMenu
                    :editor="editor"
                    :items="emailMentionItems"
                  />
                  <UEditorEmojiMenu
                    :editor="editor"
                    :items="emailEmojiItems"
                  />
                  <UEditorDragHandle
                    v-slot="{ ui }"
                    :editor="editor"
                    :options="emailEditorDragHandleOptions"
                    :ui="{ handle: 'translate-x-1 rounded border border-default bg-default/90' }"
                  >
                    <UButton
                      icon="i-lucide-grip-vertical"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :class="ui.handle()"
                    />
                  </UEditorDragHandle>
                </UEditor>
              </UFormField>

              <section class="rounded-lg border border-default/80 bg-default/40 p-3 space-y-3">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    High-fidelity preview
                  </div>
                  <div class="flex items-center gap-1">
                    <UButton
                      size="xs"
                      color="neutral"
                      :variant="previewViewport === 'desktop' ? 'soft' : 'ghost'"
                      icon="i-lucide-monitor"
                      @click="previewViewport = 'desktop'"
                    >
                      Desktop
                    </UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      :variant="previewViewport === 'mobile' ? 'soft' : 'ghost'"
                      icon="i-lucide-smartphone"
                      @click="previewViewport = 'mobile'"
                    >
                      Mobile
                    </UButton>
                  </div>
                </div>

                <div class="rounded-md border border-default bg-default p-2">
                  <div
                    class="mx-auto transition-all duration-150"
                    :class="previewViewport === 'mobile' ? 'max-w-[390px]' : 'max-w-full'"
                  >
                    <iframe
                      :srcdoc="registryPreviewHtml"
                      class="w-full min-h-[560px] md:min-h-[760px] rounded-md border border-default/70 bg-white"
                      :sandbox="registryPreviewFrameSandbox"
                      title="Registry template preview"
                    />
                  </div>
                </div>

                <p class="text-xs text-dimmed">
                  Preview shell inferred from template ID
                  <code>{{ templateDraft.sendgridTemplateId || '(not set)' }}</code>:
                  {{ registryPreviewShell === 'document' ? 'full HTML document' : 'base subject/preheader/bodyHTML shell' }}.
                </p>
              </section>

              <div class="text-xs text-dimmed rounded-md border border-primary/25 bg-primary/8 p-2.5">
                <div class="font-medium text-highlighted mb-1.5">
                  Available variables
                </div>
                <div class="leading-relaxed break-words">
                  <span
                    v-for="variableName in selectedTemplateVariables"
                    :key="`${templateDraft.eventType}-${variableName}`"
                    class="inline-block mr-2 mb-1 rounded bg-default/90 px-1.5 py-0.5 ring-1 ring-primary/20"
                  >
                    <code>{{ formatVariableToken(variableName) }}</code>
                  </span>
                </div>
              </div>

              <div>
                <UCheckbox
                  v-model="templateDraft.active"
                  label="Active"
                />
              </div>
            </div>

            <template #footer>
              <div class="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                <UButton
                  color="info"
                  variant="soft"
                  icon="i-lucide-send"
                  class="w-full sm:w-auto"
                  :loading="sendingTest"
                  :disabled="!hasTemplateId(templateDraft)"
                  @click="sendTemplateTest"
                >
                  Send test email
                </UButton>
                <UButton
                  class="w-full sm:w-auto"
                  :loading="saving"
                  @click="saveSelectedTemplate"
                >
                  Save template settings
                </UButton>
              </div>
            </template>
          </UCard>
        </div>

        <aside class="w-full self-start space-y-4 xl:sticky xl:top-4">
          <UCard>
            <div class="space-y-4">
              <div class="text-sm font-medium">
                Admin copy preferences
              </div>

              <div class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2">
                <div>
                  <div class="text-sm font-medium">
                    Critical email copies
                  </div>
                  <div class="text-xs text-dimmed">
                    Forward a copy of critical notifications to admin inboxes.
                  </div>
                </div>
                <USwitch v-model="adminCopies.criticalEnabled" />
              </div>

              <div class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2">
                <div>
                  <div class="text-sm font-medium">
                    Non-critical email copies
                  </div>
                  <div class="text-xs text-dimmed">
                    Keep disabled by default to reduce noise.
                  </div>
                </div>
                <USwitch v-model="adminCopies.nonCriticalEnabled" />
              </div>

              <UFormField
                label="Admin copy recipients"
                description="One email per line or comma-separated."
              >
                <UTextarea
                  v-model="recipientsInput"
                  :rows="4"
                  class="w-full"
                  placeholder="ops@fostudio.com&#10;support@fostudio.com"
                />
              </UFormField>

              <div class="flex justify-end">
                <UButton
                  class="w-full sm:w-auto"
                  :loading="saving"
                  @click="saveSettings()"
                >
                  Save admin copy settings
                </UButton>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between gap-3">
              <div class="text-sm font-medium">
                Registry events
              </div>
              <UBadge
                color="neutral"
                variant="soft"
                size="sm"
              >
                {{ templates.length }}
              </UBadge>
            </div>

            <div class="mt-3 max-h-[52vh] md:max-h-[70vh] overflow-y-auto space-y-2 pr-1">
              <button
                v-for="(template, index) in templates"
                :key="`${template.eventType}-${index}`"
                type="button"
                class="w-full rounded-md border p-2.5 text-left transition-colors"
                :class="index === selectedTemplateIndex
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-default/80 bg-default/40 hover:bg-default/70'"
                @click="selectTemplate(index)"
              >
                <div class="flex flex-wrap items-center gap-1.5">
                  <code class="rounded bg-elevated px-1.5 py-0.5 text-[11px] break-all">
                    {{ template.eventType }}
                  </code>
                  <UBadge
                    :color="template.category === 'critical' ? 'error' : 'neutral'"
                    variant="soft"
                    size="sm"
                  >
                    {{ template.category }}
                  </UBadge>
                  <UBadge
                    :color="template.active ? 'success' : 'neutral'"
                    variant="soft"
                    size="sm"
                  >
                    {{ template.active ? 'active' : 'inactive' }}
                  </UBadge>
                </div>
                <div class="mt-1 text-xs text-dimmed leading-tight">
                  {{ template.description || 'No description provided.' }}
                </div>
                <div class="mt-1 text-[11px] text-dimmed break-all">
                  {{ template.sendgridTemplateId || 'Template ID not configured' }}
                </div>
              </button>

              <div
                v-if="templates.length === 0"
                class="rounded-md border border-dashed border-default px-3 py-4 text-sm text-dimmed text-center"
              >
                No event mappings available.
              </div>
            </div>
          </UCard>
        </aside>
      </div>
    </DashboardPageScaffold>
  </div>
</template>

<style scoped>
.email-editor-shell :deep(.tiptap.ProseMirror),
.email-editor-shell :deep(.ProseMirror) {
  min-height: 24rem;
  max-height: 36rem;
  overflow-y: auto;
  padding: 0.95rem 1rem 0.95rem 2rem;
  line-height: 1.55;
}

.email-editor-shell :deep(p) {
  margin: 0 0 0.75rem;
}

.email-editor-shell :deep(p:last-child) {
  margin-bottom: 0;
}

.email-editor-shell :deep(ul) {
  list-style: disc;
  margin: 0 0 0.9rem;
  padding-left: 1.25rem;
}

.email-editor-shell :deep(ol) {
  list-style: decimal;
  margin: 0 0 0.9rem;
  padding-left: 1.25rem;
}

.email-editor-shell :deep(li) {
  margin: 0.2rem 0;
}

.email-editor-shell :deep(img) {
  max-width: 100%;
  height: auto;
}

.email-editor-shell :deep(h1),
.email-editor-shell :deep(h2),
.email-editor-shell :deep(h3),
.email-editor-shell :deep(h4) {
  font-weight: 600;
  line-height: 1.25;
  margin: 1rem 0 0.55rem;
}

.email-editor-shell :deep(h1) {
  font-size: 1.45rem;
}

.email-editor-shell :deep(h2) {
  font-size: 1.2rem;
}

.email-editor-shell :deep(h3) {
  font-size: 1.05rem;
}

.email-editor-shell :deep(h4) {
  font-size: 0.95rem;
}

.email-editor-shell :deep(blockquote) {
  border-left: 3px solid var(--ui-border-muted);
  margin: 0 0 0.9rem;
  padding-left: 0.85rem;
  color: var(--ui-text-muted);
}

.email-editor-shell :deep(pre) {
  overflow-x: auto;
  border-radius: 0.375rem;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  padding: 0.75rem;
  margin: 0 0 0.9rem;
}

.email-editor-shell :deep(hr) {
  border: 0;
  border-top: 1px solid var(--ui-border);
  margin: 0.9rem 0;
}

@media (max-width: 767.98px) {
  .email-editor-shell :deep(.tiptap.ProseMirror),
  .email-editor-shell :deep(.ProseMirror) {
    min-height: 16rem;
    max-height: 24rem;
    padding: 0.8rem 0.8rem 0.8rem 1.2rem;
  }
}
</style>
