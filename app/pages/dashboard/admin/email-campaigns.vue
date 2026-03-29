<script setup lang="ts">
import type { Editor as TiptapEditor } from '@tiptap/vue-3'
import { pickImageFromDevice, uploadEditorImage } from '~~/app/utils/editorImageUpload'

definePageMeta({ middleware: ['admin'] })

type CampaignTemplate = {
  id: string
  slug: string
  name: string
  description: string
  eventType: string
  sendgridTemplateId: string
  renderMode: 'editor_html' | 'sendgrid_native'
  subjectTemplate: string
  preheaderTemplate: string
  bodyTemplate: string
  dynamicDataTemplate: Record<string, unknown>
  active: boolean
  updatedAt: string
  createdAt: string
}

type CampaignRecord = {
  id: string
  name: string
  status: 'draft' | 'sent' | 'archived'
  templateId: string | null
  eventType: string
  sendgridTemplateId: string
  renderMode: 'editor_html' | 'sendgrid_native'
  subjectTemplate: string
  preheaderTemplate: string
  bodyTemplate: string
  dynamicData: Record<string, unknown>
  includeMembershipRecipients: boolean
  additionalRecipients: string[]
  lastSendSummary: Record<string, unknown> | null
  lastSentAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

type CampaignsResponse = {
  templates: CampaignTemplate[]
  campaigns: CampaignRecord[]
  availableVariablesByEvent: Record<string, string[]>
}

type CampaignDraft = {
  id: string | null
  name: string
  status: 'draft' | 'sent' | 'archived'
  templateId: string | null
  eventType: string
  sendgridTemplateId: string
  renderMode: 'editor_html' | 'sendgrid_native'
  subjectTemplate: string
  preheaderTemplate: string
  bodyTemplate: string
  dynamicDataJsonText: string
  includeMembershipRecipients: boolean
  additionalRecipientsText: string
}

type CampaignSendResponse = {
  ok: boolean
  testSend?: boolean
  testRecipient?: string | null
  campaignId: string
  campaignName: string
  eventType: string
  templateId: string
  includeMembershipRecipients: boolean
  counts: {
    totalRecipients: number
    memberRecipients: number
    extraRecipients: number
    sent: number
    skipped: number
    failed: number
  }
}

const toast = useToast()
const saving = ref(false)
const sending = ref(false)
const sendingTest = ref(false)
const selectingTemplate = ref(false)
const selectedCampaignId = ref<string | null>(null)
const testRecipient = ref('')
const draft = reactive<CampaignDraft>({
  id: null,
  name: '',
  status: 'draft',
  templateId: null,
  eventType: 'mailing.memberBroadcast',
  sendgridTemplateId: '',
  renderMode: 'editor_html',
  subjectTemplate: '',
  preheaderTemplate: '',
  bodyTemplate: '',
  dynamicDataJsonText: '{}',
  includeMembershipRecipients: true,
  additionalRecipientsText: ''
})

const EDITOR_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_IMAGE_MAX_WIDTH = '640px'
const editorDragHandleOptions = {
  placement: 'left-start',
  offset: {
    mainAxis: -6,
    alignmentAxis: 0
  }
} as const

const { data, pending, refresh } = await useAsyncData('admin:email:campaigns', async () => {
  return await $fetch<CampaignsResponse>('/api/admin/email/campaigns')
})

const templates = computed(() => data.value?.templates ?? [])
const campaigns = computed(() => data.value?.campaigns ?? [])
const availableVariablesByEvent = computed(() => data.value?.availableVariablesByEvent ?? { '*': [] as string[] })

const selectedTemplate = computed(() => {
  if (!draft.templateId) return null
  return templates.value.find(template => template.id === draft.templateId) ?? null
})

const templateSelectValue = computed({
  get: () => draft.templateId ?? '',
  set: (value: string) => {
    draft.templateId = value || null
  }
})

const campaignRows = computed(() => campaigns.value.map(campaign => ({
  ...campaign,
  templateName: templates.value.find(template => template.id === campaign.templateId)?.name ?? 'Custom / none'
})))

const editorVariableTokens = computed(() => {
  const common = availableVariablesByEvent.value['*'] ?? []
  const specific = draft.eventType ? (availableVariablesByEvent.value[draft.eventType] ?? []) : []
  return [...new Set([...common, ...specific])]
})

const isArchivedDraft = computed(() => draft.status === 'archived')

function parseRecipientsInput(input: string) {
  return [...new Set(
    input
      .split(/[\n,]+/)
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  )]
}

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const value = error as { data?: { statusMessage?: string }, message?: string, statusMessage?: string }
  return value.data?.statusMessage ?? value.statusMessage ?? value.message ?? 'Unknown error'
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

function formatIsoDate(value: string | null | undefined) {
  if (!value) return '-'
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return '-'
  return at.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatVariableToken(variableName: string) {
  return `{{ ${variableName} }}`
}

function stringifyDynamicData(value: Record<string, unknown> | null | undefined) {
  return JSON.stringify(value ?? {}, null, 2)
}

function parseDynamicDataJson(text: string) {
  try {
    const parsed = JSON.parse(text || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Campaign dynamic data must be a JSON object.')
    }
    return parsed as Record<string, unknown>
  } catch (error: unknown) {
    throw new Error(error instanceof Error ? error.message : 'Campaign dynamic data is invalid JSON.')
  }
}

function setDynamicDataJson(value: Record<string, unknown>) {
  draft.dynamicDataJsonText = stringifyDynamicData(value)
}

function loadWebsiteLaunchPreset() {
  setDynamicDataJson({
    hero_enabled: true,
    hero_eyebrow: 'FO Studio',
    hero_title: 'New Website Launch',
    hero_copy: 'We\'ve launched a new home for everything studio-related - bookings, memberships, calendar access, and account management.',
    hero_cta_url: 'https://fo.studio',
    hero_cta_label: 'Go to FO Studio',
    intro_enabled: true,
    intro_title: 'Hi - Victor here',
    intro_copy: 'It\'s been an amazing 2 years since FO Studio opened, and we\'re proud to have served you during that time. We\'ve built this new platform to make booking and membership management much easier moving forward.',
    features_enabled: true,
    features_title: 'What\'s new',
    feature_1_enabled: true,
    feature_1_title: 'Book in 30-minute increments',
    feature_1_copy: 'More flexibility for short tests, quick sessions, and tighter scheduling.',
    feature_2_enabled: true,
    feature_2_title: 'Request overnight holds',
    feature_2_copy: 'Leave equipment or setups in place overnight when your plan allows it.',
    feature_3_enabled: true,
    feature_3_title: 'Manage everything in one place',
    feature_3_copy: 'View the calendar, book, reschedule, extend bookings, and export to your own calendar.',
    transition_enabled: true,
    transition_title: 'Important membership transition',
    transition_bullet_1: 'Please cancel your current membership before April 30 and move to the new platform.',
    transition_bullet_2: 'If you cancel sooner, we can add your remaining hours into the new system.',
    transition_bullet_3: 'Membership spots are limited - once filled, new signups move to a waitlist.',
    transition_primary_url: 'https://fo.studio/memberships',
    transition_primary_label: 'View Memberships',
    transition_secondary_url: 'https://fo.studio/faq',
    transition_secondary_label: 'Read FAQ',
    credits_enabled: true,
    credits_title: 'How the new credit system works',
    credits_bullet_1: 'Each plan includes a monthly credit allowance.',
    credits_bullet_2: 'Credits can roll over up to a cap.',
    credits_bullet_3: 'You can buy more credits if you run out.',
    credits_bullet_4: 'Peak times use more credits than off-peak.',
    credits_bullet_5: 'Pro and Studio+ plans get better peak-time efficiency.',
    impact_enabled: true,
    impact_title: 'What this means for current and past members',
    impact_bullet_1: 'More usable time on the same plan, especially during off-peak hours.',
    impact_bullet_2: 'New quarterly and annual options with added benefits.',
    impact_bullet_3: 'Plan changes can happen after each billing cycle.',
    impact_bullet_4: 'Updated waiver and policy flow.',
    impact_bullet_5: 'A small price increase to support studio maintenance and improvements.',
    offer_enabled: true,
    offer_title: 'Launch Offer',
    offer_copy_html: 'Use the code below for <strong>5% off</strong> your new membership through <strong>April 30</strong>.',
    offer_code: 'NEWSITE',
    offer_cta_url: 'https://fo.studio/memberships',
    offer_cta_label: 'Start Membership',
    closing_enabled: true,
    closing_title: 'Thanks for being part of FO Studio',
    closing_copy: 'We\'re working to make FO Studio the best turnkey studio in Los Angeles, and this new site is a big step in that direction.',
    footer_name: 'FO Studio',
    footer_address_1: '3131 N. San Fernando Rd.',
    footer_address_2: 'Los Angeles, CA 90065',
    footer_link_home_url: 'https://fo.studio',
    footer_link_home_label: 'fo.studio',
    footer_link_memberships_url: 'https://fo.studio/memberships',
    footer_link_memberships_label: 'Memberships',
    footer_link_faq_url: 'https://fo.studio/faq',
    footer_link_faq_label: 'FAQ',
    footer_link_contact_url: 'https://fo.studio/contact',
    footer_link_contact_label: 'Contact'
  })
}

function hydrateDraftFromCampaign(campaign: CampaignRecord | null) {
  if (!campaign) {
    draft.id = null
    draft.name = ''
    draft.status = 'draft'
    draft.templateId = templates.value[0]?.id ?? null
    draft.eventType = templates.value[0]?.eventType ?? 'mailing.memberBroadcast'
    draft.sendgridTemplateId = templates.value[0]?.sendgridTemplateId ?? ''
    draft.renderMode = templates.value[0]?.renderMode ?? 'editor_html'
    draft.subjectTemplate = templates.value[0]?.subjectTemplate ?? ''
    draft.preheaderTemplate = templates.value[0]?.preheaderTemplate ?? ''
    draft.bodyTemplate = templates.value[0]?.bodyTemplate ?? ''
    draft.dynamicDataJsonText = stringifyDynamicData(templates.value[0]?.dynamicDataTemplate ?? {})
    draft.includeMembershipRecipients = true
    draft.additionalRecipientsText = ''
    return
  }

  draft.id = campaign.id
  draft.name = campaign.name
  draft.status = campaign.status
  draft.templateId = campaign.templateId
  draft.eventType = campaign.eventType
  draft.sendgridTemplateId = campaign.sendgridTemplateId
  draft.renderMode = campaign.renderMode
  draft.subjectTemplate = campaign.subjectTemplate
  draft.preheaderTemplate = campaign.preheaderTemplate
  draft.bodyTemplate = campaign.bodyTemplate
  draft.dynamicDataJsonText = stringifyDynamicData(campaign.dynamicData)
  draft.includeMembershipRecipients = campaign.includeMembershipRecipients
  draft.additionalRecipientsText = campaign.additionalRecipients.join('\n')
}

function applySelectedTemplateToDraft() {
  const template = selectedTemplate.value
  if (!template) return

  draft.eventType = template.eventType
  draft.sendgridTemplateId = template.sendgridTemplateId ?? ''
  draft.renderMode = template.renderMode ?? 'editor_html'
  draft.subjectTemplate = template.subjectTemplate ?? ''
  draft.preheaderTemplate = template.preheaderTemplate ?? ''
  draft.bodyTemplate = template.bodyTemplate ?? ''
  draft.dynamicDataJsonText = stringifyDynamicData(template.dynamicDataTemplate ?? {})
}

function onTemplateChange() {
  selectingTemplate.value = true
  applySelectedTemplateToDraft()
  selectingTemplate.value = false
}

function selectCampaign(campaignId: string) {
  selectedCampaignId.value = campaignId
  hydrateDraftFromCampaign(campaigns.value.find(item => item.id === campaignId) ?? null)
}

function createCampaignDraft() {
  selectedCampaignId.value = null
  hydrateDraftFromCampaign(null)
  draft.name = `Campaign ${new Date().toLocaleDateString('en-US')}`
}

async function reloadCampaigns(options: { preserveSelection?: boolean } = {}) {
  await refresh()
  if (options.preserveSelection && selectedCampaignId.value) {
    const exists = campaigns.value.some(item => item.id === selectedCampaignId.value)
    if (exists) {
      hydrateDraftFromCampaign(campaigns.value.find(item => item.id === selectedCampaignId.value) ?? null)
      return
    }
  }

  if (!selectedCampaignId.value && campaigns.value.length > 0) {
    selectCampaign(campaigns.value[0]!.id)
  } else if (!selectedCampaignId.value && campaigns.value.length === 0) {
    hydrateDraftFromCampaign(null)
  }
}

async function saveCampaign(options: { silentSuccess?: boolean } = {}) {
  let dynamicData: Record<string, unknown>
  try {
    dynamicData = parseDynamicDataJson(draft.dynamicDataJsonText)
  } catch (error: unknown) {
    toast.add({
      title: 'Dynamic data is invalid',
      description: readErrorMessage(error),
      color: 'error'
    })
    return false
  }

  saving.value = true
  try {
    const result = await $fetch<{ campaign: CampaignRecord }>('/api/admin/email/campaigns.upsert', {
      method: 'POST',
      body: {
        id: draft.id ?? undefined,
        name: draft.name,
        status: draft.status,
        templateId: draft.templateId,
        eventType: draft.eventType,
        sendgridTemplateId: draft.sendgridTemplateId,
        renderMode: draft.renderMode,
        subjectTemplate: draft.subjectTemplate,
        preheaderTemplate: draft.preheaderTemplate,
        bodyTemplate: draft.bodyTemplate,
        dynamicData,
        includeMembershipRecipients: draft.includeMembershipRecipients,
        additionalRecipients: parseRecipientsInput(draft.additionalRecipientsText)
      }
    })

    selectedCampaignId.value = result.campaign.id
    draft.id = result.campaign.id
    if (!options.silentSuccess) {
      toast.add({ title: 'Campaign saved', color: 'success' })
    }
    await reloadCampaigns({ preserveSelection: true })
    return true
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save campaign',
      description: readErrorMessage(error),
      color: 'error'
    })
    return false
  } finally {
    saving.value = false
  }
}

async function sendCampaign() {
  if (!draft.sendgridTemplateId.trim()) {
    toast.add({
      title: 'Template id required',
      description: 'Set a SendGrid template id before sending.',
      color: 'warning'
    })
    return
  }

  const saved = await saveCampaign({ silentSuccess: true })
  if (!saved || !draft.id) return

  sending.value = true
  try {
    const response = await $fetch<CampaignSendResponse>('/api/admin/email/campaigns.send', {
      method: 'POST',
      body: {
        campaignId: draft.id
      }
    })

    toast.add({
      title: 'Campaign send complete',
      description: `Sent ${response.counts.sent}/${response.counts.totalRecipients} (${response.counts.skipped} skipped, ${response.counts.failed} failed).`,
      color: response.counts.failed > 0 ? 'warning' : 'success'
    })

    await reloadCampaigns({ preserveSelection: true })
  } catch (error: unknown) {
    toast.add({
      title: 'Could not send campaign',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    sending.value = false
  }
}

async function sendCampaignTest() {
  if (!draft.sendgridTemplateId.trim()) {
    toast.add({
      title: 'Template id required',
      description: 'Set a SendGrid template id before sending a test.',
      color: 'warning'
    })
    return
  }

  const saved = await saveCampaign({ silentSuccess: true })
  if (!saved || !draft.id) return

  sendingTest.value = true
  try {
    const response = await $fetch<CampaignSendResponse>('/api/admin/email/campaigns.send', {
      method: 'POST',
      body: {
        campaignId: draft.id,
        markSent: false,
        testSend: true,
        testRecipient: testRecipient.value.trim() || undefined
      }
    })

    const recipientLabel = response.testRecipient ?? (testRecipient.value.trim() || 'your admin email')
    toast.add({
      title: 'Test email sent',
      description: `Test campaign sent to ${recipientLabel}.`,
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

const editorSuggestionItems = computed(() => buildSuggestionItems(editorVariableTokens.value))

const editorHandlers = {
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

const editorToolbarItems = [[{
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
  kind: 'horizontalRule',
  icon: 'i-lucide-separator-horizontal',
  tooltip: { text: 'Horizontal rule' }
}, {
  kind: 'clearFormatting',
  icon: 'i-lucide-eraser',
  tooltip: { text: 'Clear formatting' }
}]]

const editorBubbleToolbarItems = [[{
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

watch([templates, campaigns], () => {
  if (selectedCampaignId.value) return
  if (campaigns.value.length > 0) {
    selectCampaign(campaigns.value[0]!.id)
  } else {
    hydrateDraftFromCampaign(null)
  }
}, { immediate: true })

watch(() => draft.templateId, () => {
  if (selectingTemplate.value) return
  if (draft.id) return
  applySelectedTemplateToDraft()
})
</script>

<template>
  <UDashboardPanel id="admin-email-campaigns">
    <template #header>
      <UDashboardNavbar
        title="Email Campaigns"
        :ui="{ right: 'gap-2' }"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="() => reloadCampaigns({ preserveSelection: true })"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <UAlert
          color="info"
          variant="soft"
          icon="i-lucide-megaphone"
          title="Campaign workflow"
          description="Campaigns are separate from the mail template registry. Build drafts, pick a campaign template, and send when ready."
        />

        <div class="grid gap-4 lg:grid-cols-[1.05fr_1.4fr]">
          <UCard>
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-medium">
                Campaigns
              </div>
              <UButton
                size="xs"
                icon="i-lucide-plus"
                color="neutral"
                variant="soft"
                @click="createCampaignDraft"
              >
                New Draft
              </UButton>
            </div>

            <div class="mt-3 overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="border-b border-default text-xs uppercase tracking-wide text-dimmed">
                    <th class="px-2 py-2">
                      Name
                    </th>
                    <th class="px-2 py-2">
                      Status
                    </th>
                    <th class="px-2 py-2">
                      Template
                    </th>
                    <th class="px-2 py-2 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="campaign in campaignRows"
                    :key="campaign.id"
                    class="border-b border-default/60 last:border-b-0"
                  >
                    <td class="px-2 py-2.5 align-top">
                      <div class="font-medium text-highlighted">
                        {{ campaign.name }}
                      </div>
                      <div class="text-xs text-dimmed">
                        Updated {{ formatIsoDate(campaign.updatedAt) }}
                      </div>
                      <div class="text-xs text-dimmed">
                        Sent {{ formatIsoDate(campaign.lastSentAt) }}
                      </div>
                    </td>
                    <td class="px-2 py-2.5 align-top">
                      <UBadge
                        :color="campaign.status === 'draft' ? 'warning' : campaign.status === 'sent' ? 'success' : 'neutral'"
                        variant="soft"
                        size="sm"
                      >
                        {{ campaign.status }}
                      </UBadge>
                    </td>
                    <td class="px-2 py-2.5 align-top text-xs text-dimmed">
                      {{ campaign.templateName }}
                    </td>
                    <td class="px-2 py-2.5 align-top">
                      <div class="flex justify-end gap-1">
                        <UButton
                          size="xs"
                          color="neutral"
                          variant="soft"
                          icon="i-lucide-pencil"
                          @click="selectCampaign(campaign.id)"
                        />
                      </div>
                    </td>
                  </tr>

                  <tr v-if="campaignRows.length === 0">
                    <td
                      colspan="4"
                      class="px-2 py-3 text-sm text-dimmed"
                    >
                      No campaigns yet. Create your first draft.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="text-sm font-medium">
                  Compose campaign
                </div>
                <div class="text-xs text-dimmed mt-0.5">
                  Draft copy, audience, and template mapping before send.
                </div>
              </div>
              <UBadge
                :color="draft.status === 'draft' ? 'warning' : draft.status === 'sent' ? 'success' : 'neutral'"
                variant="soft"
              >
                {{ draft.status }}
              </UBadge>
            </div>

            <div class="mt-4 space-y-4">
              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Campaign name">
                  <UInput
                    v-model="draft.name"
                    class="w-full"
                    placeholder="April studio update"
                  />
                </UFormField>

                <UFormField label="Status">
                  <select
                    v-model="draft.status"
                    class="w-full rounded-md border border-default bg-elevated px-2.5 py-2 text-sm"
                  >
                    <option value="draft">
                      draft
                    </option>
                    <option value="sent">
                      sent
                    </option>
                    <option value="archived">
                      archived
                    </option>
                  </select>
                </UFormField>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <UFormField
                  label="Campaign template"
                  description="Select a reusable template preset."
                >
                  <select
                    v-model="templateSelectValue"
                    class="w-full rounded-md border border-default bg-elevated px-2.5 py-2 text-sm"
                    @change="onTemplateChange"
                  >
                    <option value="">
                      Custom (none)
                    </option>
                    <option
                      v-for="template in templates"
                      :key="template.id"
                      :value="template.id"
                    >
                      {{ template.name }}{{ template.active ? '' : ' (inactive)' }}
                    </option>
                  </select>
                </UFormField>

                <div class="flex items-end">
                  <UButton
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-copy-plus"
                    @click="applySelectedTemplateToDraft"
                  >
                    Apply template content
                  </UButton>
                </div>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Mail event type">
                  <UInput
                    v-model="draft.eventType"
                    class="w-full"
                    placeholder="mailing.memberBroadcast"
                  />
                </UFormField>

                <UFormField label="SendGrid template id">
                  <UInput
                    v-model="draft.sendgridTemplateId"
                    class="w-full"
                    placeholder="d-xxxxxxxxxxxxxxxxxxxx"
                  />
                </UFormField>
              </div>

              <UFormField
                label="Render mode"
                description="Editor HTML mode renders bodyHTML server-side. SendGrid native mode uses dynamic data JSON for section toggles and content."
              >
                <select
                  v-model="draft.renderMode"
                  class="w-full rounded-md border border-default bg-elevated px-2.5 py-2 text-sm"
                >
                  <option value="editor_html">
                    Editor HTML (bodyHTML)
                  </option>
                  <option value="sendgrid_native">
                    SendGrid native (dynamic data JSON)
                  </option>
                </select>
              </UFormField>

              <div class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2">
                <div>
                  <div class="text-sm font-medium">
                    Include membership recipients
                  </div>
                  <div class="text-xs text-dimmed">
                    Pull unique member emails from memberships/customers.
                  </div>
                </div>
                <USwitch v-model="draft.includeMembershipRecipients" />
              </div>

              <UFormField
                label="Additional recipients"
                description="One email per line or comma-separated."
              >
                <UTextarea
                  v-model="draft.additionalRecipientsText"
                  :rows="4"
                  class="w-full"
                  placeholder="agency@example.com&#10;collab@example.com"
                />
              </UFormField>

              <UFormField
                label="Test recipient"
                description="Optional. Leave blank to send to your admin account email."
              >
                <UInput
                  v-model="testRecipient"
                  class="w-full"
                  placeholder="you@example.com"
                />
              </UFormField>

              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Subject template">
                  <UInput
                    v-model="draft.subjectTemplate"
                    class="w-full"
                    placeholder="FO Studio update for {{ customerName }}"
                  />
                </UFormField>
                <UFormField label="Preheader template">
                  <UInput
                    v-model="draft.preheaderTemplate"
                    class="w-full"
                    placeholder="Short preview text for inbox list view."
                  />
                </UFormField>
              </div>

              <UFormField
                v-if="draft.renderMode === 'editor_html'"
                label="Body template (HTML)"
              >
                <template #description>
                  Use <code v-pre>{{ variableName }}</code> tokens only.
                </template>
                <UEditor
                  v-slot="{ editor }"
                  v-model="draft.bodyTemplate"
                  content-type="html"
                  :handlers="editorHandlers"
                  :image="{ allowBase64: false }"
                  :ui="{ base: 'px-4 py-4 md:px-5 md:py-5' }"
                  class="campaign-editor-shell w-full rounded-md border border-default bg-default overflow-visible"
                  :placeholder="editorPlaceholder(draft.bodyTemplate, 'Write campaign body HTML...')"
                >
                  <UEditorToolbar
                    :editor="editor"
                    :items="editorToolbarItems"
                    class="border-b border-default sticky top-0 inset-x-0 p-1.5 z-10 bg-default/95 backdrop-blur overflow-x-auto"
                  />
                  <UEditorToolbar
                    :editor="editor"
                    :items="editorBubbleToolbarItems"
                    layout="bubble"
                  />
                  <UEditorSuggestionMenu
                    :editor="editor"
                    :items="editorSuggestionItems"
                  />
                  <UEditorDragHandle
                    v-slot="{ ui }"
                    :editor="editor"
                    :options="editorDragHandleOptions"
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

              <UFormField
                v-else
                label="SendGrid dynamic data (JSON)"
              >
                <template #description>
                  Section toggles and content for your SendGrid template. String values can use <code v-pre>{{ variableName }}</code> tokens.
                </template>
                <div class="space-y-2">
                  <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-default p-2">
                    <div class="text-xs text-dimmed">
                      Use your modular SendGrid layout keys like <code>hero_enabled</code>, <code>feature_1_title</code>, <code>offer_code</code>.
                    </div>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="soft"
                      icon="i-lucide-wand-sparkles"
                      @click="loadWebsiteLaunchPreset"
                    >
                      Load website launch preset
                    </UButton>
                  </div>
                  <UTextarea
                    v-model="draft.dynamicDataJsonText"
                    :rows="20"
                    class="w-full font-mono text-xs"
                    placeholder="{&#10;  &quot;hero_enabled&quot;: true&#10;}"
                  />
                </div>
              </UFormField>

              <div class="text-xs text-dimmed rounded-md border border-primary/20 bg-primary/5 p-2.5">
                <div class="font-medium text-highlighted mb-1.5">
                  Available recipient/context variables
                </div>
                <div class="leading-relaxed break-words">
                  <span
                    v-for="variableName in editorVariableTokens"
                    :key="`campaign-${variableName}`"
                    class="inline-block mr-2 mb-1 rounded bg-default/90 px-1.5 py-0.5 ring-1 ring-primary/20"
                  >
                    <code>{{ formatVariableToken(variableName) }}</code>
                  </span>
                </div>
              </div>
            </div>

            <template #footer>
              <div class="flex items-center justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-plus"
                  @click="createCampaignDraft"
                >
                  New draft
                </UButton>
                <UButton
                  color="neutral"
                  variant="soft"
                  :loading="saving"
                  :disabled="isArchivedDraft"
                  @click="() => { void saveCampaign() }"
                >
                  Save draft
                </UButton>
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-flask-conical"
                  :loading="sendingTest"
                  :disabled="isArchivedDraft || !draft.sendgridTemplateId.trim()"
                  @click="sendCampaignTest"
                >
                  Send test
                </UButton>
                <UButton
                  icon="i-lucide-send"
                  :loading="sending"
                  :disabled="isArchivedDraft || !draft.sendgridTemplateId.trim() || (!draft.includeMembershipRecipients && parseRecipientsInput(draft.additionalRecipientsText).length === 0)"
                  @click="sendCampaign"
                >
                  Send campaign
                </UButton>
              </div>
            </template>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.campaign-editor-shell :deep(.tiptap.ProseMirror),
.campaign-editor-shell :deep(.ProseMirror) {
  min-height: 22rem;
  max-height: 38rem;
  overflow-y: auto;
  padding: 0.95rem 1rem 0.95rem 2rem;
  line-height: 1.55;
}

.campaign-editor-shell :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
