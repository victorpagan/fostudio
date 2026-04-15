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
  templateIdHistory: Array<{
    templateId: string
    savedBy: string | null
    savedAt: string
  }>
}

type EventTypeOption = {
  eventType: string
  category: 'critical' | 'non_critical'
  description: string
}

type EventTypeRegistryEntry = {
  eventType: string
  sendgridTemplateId: string
  category: 'critical' | 'non_critical'
  active: boolean
  updatedAt: string | null
}

type CampaignsResponse = {
  templates: CampaignTemplate[]
  campaigns: CampaignRecord[]
  eventTypeOptions: EventTypeOption[]
  eventTypeRegistry: EventTypeRegistryEntry[]
  availableVariablesByEvent: Record<string, string[]>
}

type SendgridTemplateLookupResponse = {
  templateId: string
  name: string
  generation: string
  updatedAt: string | null
  resolvedFrom: 'active' | 'latest' | 'none'
  selectedVersion: {
    id: string
    name: string
    active: boolean
    subject: string
    htmlContent: string
    plainContent: string
    updatedAt: string | null
    createdAt: string | null
  } | null
}

type SendgridTemplateCatalogItem = {
  templateId: string
  name: string
  generation: string
  updatedAt: string | null
}

type SendgridTemplateSelectItem = {
  label: string
  value: string
  description: string
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

type CampaignImageSlot = {
  id: 'features' | 'transition' | 'impact' | 'offer'
  label: string
  urlKey: string
  altKey: string
}

const CAMPAIGN_IMAGE_SLOTS: CampaignImageSlot[] = [
  {
    id: 'features',
    label: 'Features section',
    urlKey: 'features_image_url',
    altKey: 'features_image_alt'
  },
  {
    id: 'transition',
    label: 'Transition section',
    urlKey: 'transition_image_url',
    altKey: 'transition_image_alt'
  },
  {
    id: 'impact',
    label: 'Impact section',
    urlKey: 'impact_image_url',
    altKey: 'impact_image_alt'
  },
  {
    id: 'offer',
    label: 'Offer section',
    urlKey: 'offer_image_url',
    altKey: 'offer_image_alt'
  }
]

const SENDGRID_NATIVE_PREVIEW_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { margin:0; padding:24px 0; background:#f5f5f5; font-family:Arial,Helvetica,sans-serif; color:#111; }
    .wrap { width:100%; }
    .main { width:100%; max-width:640px; margin:0 auto; background:#fff; border:1px solid #ececec; border-radius:16px; overflow:hidden; }
    .hero { background:#111; color:#fff; padding:32px; }
    .hero h1 { margin:0 0 12px; font-size:32px; line-height:1.1; }
    .hero p { margin:0 0 18px; font-size:15px; line-height:1.6; color:#e8e8e8; }
    .eyebrow { margin:0 0 12px; font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:#cfcfcf; }
    .section { padding:28px 28px 24px; }
    .section h2 { margin:0 0 10px; font-size:22px; line-height:1.2; color:#111; }
    .section p { margin:0; font-size:14px; line-height:1.7; color:#444; }
    .divider { height:1px; background:#ececec; }
    .feature { background:#fafafa; border:1px solid #ececec; border-radius:12px; padding:16px; }
    .feature + .feature { margin-top:10px; }
    .feature strong { display:block; margin-bottom:6px; font-size:15px; color:#111; }
    .bullets { margin:0; padding-left:18px; }
    .bullets li { margin:0 0 8px; font-size:14px; line-height:1.6; color:#444; }
    .cta { display:inline-block; padding:12px 18px; border-radius:999px; font-size:13px; font-weight:700; text-decoration:none; }
    .cta-dark { background:#111; color:#fff !important; }
    .cta-soft { background:#f2f2f2; border:1px solid #e5e5e5; color:#111 !important; }
    .promo { background:#f7f7f7; border:1px solid #ececec; border-radius:14px; padding:22px; text-align:center; }
    .promo-code { display:inline-block; margin-top:12px; padding:9px 14px; border-radius:999px; background:#111; color:#fff; font-weight:700; letter-spacing:1px; }
    .callout { margin:0 28px 28px; background:#111; border-radius:14px; color:#fff; padding:22px; }
    .callout h2 { margin:0 0 8px; color:#fff; }
    .callout p { margin:0; color:#e8e8e8; }
    .footer { padding:24px 28px 30px; text-align:center; color:#777; font-size:13px; line-height:1.7; }
    .footer a { color:#111; font-weight:700; text-decoration:none; }
    img { display:block; width:100%; height:auto; border:0; border-radius:10px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="main">
      {{#if hero_enabled}}
      <div class="hero">
        <p class="eyebrow">{{hero_eyebrow}}</p>
        <h1>{{hero_title}}</h1>
        <p>{{hero_copy}}</p>
        {{#if hero_cta_url}}<a class="cta cta-soft" href="{{hero_cta_url}}">{{hero_cta_label}}</a>{{/if}}
      </div>
      <div class="divider"></div>
      {{/if}}
      {{#if intro_enabled}}
      <div class="section">
        <h2>{{intro_title}}</h2>
        <p>{{intro_copy}}</p>
      </div>
      <div class="divider"></div>
      {{/if}}
      {{#if features_enabled}}
      <div class="section">
        <h2>{{features_title}}</h2>
        {{#if features_image_url}}<div style="margin-bottom:14px;"><img src="{{features_image_url}}" alt="{{features_image_alt}}" /></div>{{/if}}
        {{#if feature_1_enabled}}<div class="feature"><strong>{{feature_1_title}}</strong><p>{{feature_1_copy}}</p></div>{{/if}}
        {{#if feature_2_enabled}}<div class="feature"><strong>{{feature_2_title}}</strong><p>{{feature_2_copy}}</p></div>{{/if}}
        {{#if feature_3_enabled}}<div class="feature"><strong>{{feature_3_title}}</strong><p>{{feature_3_copy}}</p></div>{{/if}}
      </div>
      <div class="divider"></div>
      {{/if}}
      {{#if transition_enabled}}
      <div class="section">
        <h2>{{transition_title}}</h2>
        {{#if transition_image_url}}<div style="margin-bottom:14px;"><img src="{{transition_image_url}}" alt="{{transition_image_alt}}" /></div>{{/if}}
        <ul class="bullets">
          <li>{{transition_bullet_1}}</li>
          <li>{{transition_bullet_2}}</li>
          <li>{{transition_bullet_3}}</li>
        </ul>
        <div style="margin-top:16px;">
          {{#if transition_primary_url}}<a class="cta cta-dark" href="{{transition_primary_url}}">{{transition_primary_label}}</a>{{/if}}
          {{#if transition_secondary_url}}<a class="cta cta-soft" style="margin-left:8px;" href="{{transition_secondary_url}}">{{transition_secondary_label}}</a>{{/if}}
        </div>
      </div>
      <div class="divider"></div>
      {{/if}}
      {{#if credits_enabled}}
      <div class="section">
        <h2>{{credits_title}}</h2>
        <ul class="bullets">
          <li>{{credits_bullet_1}}</li>
          <li>{{credits_bullet_2}}</li>
          <li>{{credits_bullet_3}}</li>
          <li>{{credits_bullet_4}}</li>
          <li>{{credits_bullet_5}}</li>
        </ul>
      </div>
      <div class="divider"></div>
      {{/if}}
      {{#if impact_enabled}}
      <div class="section">
        <h2>{{impact_title}}</h2>
        {{#if impact_image_url}}<div style="margin-bottom:14px;"><img src="{{impact_image_url}}" alt="{{impact_image_alt}}" /></div>{{/if}}
        <ul class="bullets">
          <li>{{impact_bullet_1}}</li>
          <li>{{impact_bullet_2}}</li>
          <li>{{impact_bullet_3}}</li>
          <li>{{impact_bullet_4}}</li>
          <li>{{impact_bullet_5}}</li>
        </ul>
      </div>
      <div class="divider"></div>
      {{/if}}
      {{#if offer_enabled}}
      <div class="section">
        <div class="promo">
          <h2 style="margin-top:0;">{{offer_title}}</h2>
          <p>{{{offer_copy_html}}}</p>
          {{#if offer_image_url}}<div style="margin-top:12px;"><img src="{{offer_image_url}}" alt="{{offer_image_alt}}" /></div>{{/if}}
          <div class="promo-code">{{offer_code}}</div>
          <div style="margin-top:16px;">{{#if offer_cta_url}}<a class="cta cta-dark" href="{{offer_cta_url}}">{{offer_cta_label}}</a>{{/if}}</div>
        </div>
      </div>
      <div class="divider"></div>
      {{/if}}
      {{#if closing_enabled}}
      <div class="callout">
        <h2>{{closing_title}}</h2>
        <p>{{closing_copy}}</p>
      </div>
      {{/if}}
      <div class="footer">
        {{footer_name}}<br />
        {{footer_address_1}}<br />
        {{footer_address_2}}<br /><br />
        <a href="{{footer_link_home_url}}">{{footer_link_home_label}}</a> |
        <a href="{{footer_link_memberships_url}}">{{footer_link_memberships_label}}</a> |
        <a href="{{footer_link_faq_url}}">{{footer_link_faq_label}}</a> |
        <a href="{{footer_link_contact_url}}">{{footer_link_contact_label}}</a>
      </div>
    </div>
  </div>
</body>
</html>`

const EDITOR_HTML_PREVIEW_TEMPLATE = `<!doctype html>
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

const route = useRoute()
const router = useRouter()
const toast = useToast()
const saving = ref(false)
const sending = ref(false)
const sendingTest = ref(false)
const syncingCampaignQuery = ref(false)
const selectedCampaignId = ref<string | null>(null)
const testRecipient = ref('')
const sendgridLookupPending = ref(false)
const sendgridLookupError = ref<string | null>(null)
const sendgridLookup = ref<SendgridTemplateLookupResponse | null>(null)
const { data: sendgridTemplateCatalogData } = await useAsyncData('admin:email-campaigns:sendgrid-templates', async () => {
  return await $fetch<{ templates: SendgridTemplateCatalogItem[] }>('/api/admin/email/sendgrid-templates')
})
const sendgridTemplateCatalog = computed(() => sendgridTemplateCatalogData.value?.templates ?? [])
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
const SENDGRID_LOOKUP_DEBOUNCE_MS = 450
const editorDragHandleOptions = {
  placement: 'left-start',
  offset: {
    mainAxis: -6,
    alignmentAxis: 0
  }
} as const
const campaignImageUploadPending = reactive<Record<CampaignImageSlot['id'], boolean>>({
  features: false,
  transition: false,
  impact: false,
  offer: false
})

const { data, pending, refresh } = await useAsyncData('admin:email:campaigns', async () => {
  return await $fetch<CampaignsResponse>('/api/admin/email/campaigns')
})

let sendgridLookupTimer: ReturnType<typeof setTimeout> | null = null
let sendgridLookupSequence = 0

const templates = computed(() => data.value?.templates ?? [])
const campaigns = computed(() => data.value?.campaigns ?? [])
const eventTypeOptions = computed(() => data.value?.eventTypeOptions ?? [])
const eventTypeRegistry = computed(() => data.value?.eventTypeRegistry ?? [])
const availableVariablesByEvent = computed(() => data.value?.availableVariablesByEvent ?? { '*': [] as string[] })
const knownEventTypeSet = computed(() => new Set(eventTypeOptions.value.map(option => option.eventType)))
const eventTypeRegistryByEvent = computed(() => {
  const map = new Map<string, EventTypeRegistryEntry>()
  for (const entry of eventTypeRegistry.value) {
    map.set(entry.eventType, entry)
  }
  return map
})

const selectedTemplate = computed(() => {
  if (!draft.templateId) return null
  return templates.value.find(template => template.id === draft.templateId) ?? null
})

function normalizeTemplateId(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value).trim()
  if (typeof value === 'object') {
    if ('value' in value && typeof value.value === 'string') {
      return value.value.trim()
    }
    if ('sendgridTemplateId' in value && typeof value.sendgridTemplateId === 'string') {
      return value.sendgridTemplateId.trim()
    }
  }
  return String(value).trim()
}

const draftSendgridTemplateId = computed(() => normalizeTemplateId(draft.sendgridTemplateId))

const draftTemplateIdModel = computed({
  get: () => draftSendgridTemplateId.value,
  set: (value: unknown) => {
    draft.sendgridTemplateId = normalizeTemplateId(value)
  }
})

const CUSTOM_TEMPLATE_VALUE = '__custom__'
const NO_CAMPAIGN_SELECTED_VALUE = '__none__'
const LEGACY_EVENT_LABEL_PREFIX = 'Legacy (unregistered): '

const templateSelectValue = computed({
  get: () => draft.templateId ?? CUSTOM_TEMPLATE_VALUE,
  set: (value: string) => {
    const normalized = String(value ?? '')
    draft.templateId = normalized && normalized !== CUSTOM_TEMPLATE_VALUE ? normalized : null
  }
})

const eventTypeSelectValue = computed({
  get: () => draft.eventType,
  set: (value: string) => {
    const normalized = String(value ?? '').trim()
    if (!normalized || normalized === draft.eventType) return
    onEventTypeSelected(normalized)
  }
})

const eventTypeSelectItems = computed(() => {
  const base = eventTypeOptions.value.map(option => ({
    label: option.eventType,
    value: option.eventType,
    description: option.description
  }))

  if (!draft.eventType) return base
  if (knownEventTypeSet.value.has(draft.eventType)) return base

  return [{
    label: `${LEGACY_EVENT_LABEL_PREFIX}${draft.eventType}`,
    value: draft.eventType,
    description: 'Select a registered event type before saving this campaign.'
  }, ...base]
})

const isDraftEventTypeRegistered = computed(() => knownEventTypeSet.value.has(draft.eventType))
const selectedEventTypeOption = computed(() => {
  return eventTypeOptions.value.find(option => option.eventType === draft.eventType) ?? null
})
const selectedEventTypeRegistryEntry = computed(() => {
  return eventTypeRegistryByEvent.value.get(draft.eventType) ?? null
})
const registryTemplateIdForDraftEvent = computed(() => {
  return String(selectedEventTypeRegistryEntry.value?.sendgridTemplateId ?? '').trim()
})
const isDraftTemplateIdSyncedWithRegistry = computed(() => {
  const draftTemplateId = draftSendgridTemplateId.value
  const registryTemplateId = registryTemplateIdForDraftEvent.value
  if (!draftTemplateId || !registryTemplateId) return false
  return draftTemplateId === registryTemplateId
})

const campaignStatusItems: Array<{ label: string, value: CampaignDraft['status'] }> = [
  { label: 'draft', value: 'draft' },
  { label: 'sent', value: 'sent' },
  { label: 'archived', value: 'archived' }
]

const renderModeItems: Array<{ label: string, value: CampaignDraft['renderMode'] }> = [
  { label: 'Editor HTML (bodyHTML)', value: 'editor_html' },
  { label: 'SendGrid native (dynamic data JSON)', value: 'sendgrid_native' }
]

const templateSelectItems = computed(() => {
  const mapped = templates.value
    .map((template) => {
      const id = String(template.id ?? '').trim()
      if (!id) return null
      const name = String(template.name ?? '').trim() || 'Untitled template'
      return {
        label: `${name}${template.active ? '' : ' (inactive)'}`,
        value: id
      }
    })
    .filter((item): item is { label: string, value: string } => Boolean(item))

  return [
    { label: 'Custom (none)', value: CUSTOM_TEMPLATE_VALUE },
    ...mapped
  ]
})

const sendgridTemplateIdSelectItems = computed(() => {
  const labelById = new Map<string, string>()

  for (const template of sendgridTemplateCatalog.value) {
    const templateId = String(template.templateId ?? '').trim()
    if (!templateId) continue
    const name = String(template.name ?? '').trim()
    labelById.set(templateId, name)
  }

  for (const template of templates.value) {
    const templateId = String(template.sendgridTemplateId ?? '').trim()
    if (templateId && !labelById.has(templateId)) {
      labelById.set(templateId, '')
    }
  }

  for (const entry of eventTypeRegistry.value) {
    const templateId = String(entry.sendgridTemplateId ?? '').trim()
    if (templateId && !labelById.has(templateId)) {
      labelById.set(templateId, '')
    }
  }

  const draftTemplateId = draftSendgridTemplateId.value
  if (draftTemplateId && !labelById.has(draftTemplateId)) {
    labelById.set(draftTemplateId, '')
  }

  const values: SendgridTemplateSelectItem[] = []
  for (const [templateId, name] of labelById.entries()) {
    const safeName = name.trim()
    const label = safeName.length > 0 && safeName !== templateId ? safeName : templateId
    const description = `Template ID: ${templateId}`
    values.push({ label, value: templateId, description })
  }

  return values.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
})

function onCampaignTemplateIdCreate(value: unknown) {
  const normalized = normalizeTemplateId(value)
  if (!normalized) return
  draft.sendgridTemplateId = normalized
}

const campaignRows = computed(() => campaigns.value.map(campaign => ({
  ...campaign,
  templateName: templates.value.find(template => template.id === campaign.templateId)?.name ?? 'Custom / none'
})))
const selectedCampaignRow = computed(() => {
  if (!selectedCampaignId.value) return null
  return campaignRows.value.find(campaign => campaign.id === selectedCampaignId.value) ?? null
})
const currentCampaignTemplateHistory = computed(() => selectedCampaignRow.value?.templateIdHistory ?? [])

const campaignSelectItems = computed(() => {
  if (campaignRows.value.length === 0) {
    return [{ label: 'No campaigns available', value: NO_CAMPAIGN_SELECTED_VALUE, disabled: true }]
  }

  return campaignRows.value.map(campaign => ({
    label: campaign.name,
    value: campaign.id
  }))
})

const campaignNavigatorValue = computed({
  get: () => selectedCampaignId.value ?? NO_CAMPAIGN_SELECTED_VALUE,
  set: (value: string) => {
    const nextId = String(value ?? '')
    if (!nextId || nextId === NO_CAMPAIGN_SELECTED_VALUE) {
      void createCampaignDraft()
      return
    }
    void selectCampaign(nextId)
  }
})

const selectedCampaignIndex = computed(() => {
  if (!selectedCampaignId.value) return -1
  return campaignRows.value.findIndex(campaign => campaign.id === selectedCampaignId.value)
})

const canSelectPreviousCampaign = computed(() => selectedCampaignIndex.value > 0)
const canSelectNextCampaign = computed(() => {
  if (selectedCampaignIndex.value < 0) return false
  return selectedCampaignIndex.value < campaignRows.value.length - 1
})

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

const previewViewport = ref<'desktop' | 'mobile'>('desktop')
const previewFrameSandbox = 'allow-scripts'

function clearSendgridLookupTimer() {
  if (sendgridLookupTimer) {
    clearTimeout(sendgridLookupTimer)
    sendgridLookupTimer = null
  }
}

async function fetchLatestSendgridTemplate(templateId: string) {
  const normalizedTemplateId = String(templateId ?? '').trim()
  if (!normalizedTemplateId) {
    sendgridLookup.value = null
    sendgridLookupError.value = null
    sendgridLookupPending.value = false
    return
  }

  const requestId = sendgridLookupSequence + 1
  sendgridLookupSequence = requestId
  sendgridLookupPending.value = true
  sendgridLookupError.value = null

  try {
    const response = await $fetch<SendgridTemplateLookupResponse>('/api/admin/email/sendgrid-template', {
      query: {
        templateId: normalizedTemplateId
      }
    })

    if (requestId !== sendgridLookupSequence) return
    sendgridLookup.value = response
  } catch (error: unknown) {
    if (requestId !== sendgridLookupSequence) return
    sendgridLookup.value = null
    sendgridLookupError.value = readErrorMessage(error)
  } finally {
    if (requestId === sendgridLookupSequence) {
      sendgridLookupPending.value = false
    }
  }
}

function queueSendgridTemplateLookup(templateId: string) {
  const normalizedTemplateId = String(templateId ?? '').trim()
  clearSendgridLookupTimer()
  if (!normalizedTemplateId) {
    sendgridLookup.value = null
    sendgridLookupError.value = null
    sendgridLookupPending.value = false
    return
  }

  sendgridLookupTimer = setTimeout(() => {
    sendgridLookupTimer = null
    void fetchLatestSendgridTemplate(normalizedTemplateId)
  }, SENDGRID_LOOKUP_DEBOUNCE_MS)
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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function renderTokenTemplate(template: string, context: Record<string, unknown>) {
  return template.replace(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g, (_match, token: string) => {
    const value = resolvePathValue(context, token)
    if (value == null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value)
    }
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

  // Resolve nested/flat if blocks in a bounded loop.
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
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value)
    }
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

const previewContext = computed(() => {
  const dynamicData = parsedDynamicData.value ?? {}
  const baseContext = {
    ...dynamicData,
    eventType: draft.eventType,
    customerName: String((dynamicData.customerName ?? 'FO Studio Member') || 'FO Studio Member'),
    customerEmail: String((dynamicData.customerEmail ?? 'member@example.com') || 'member@example.com'),
    membershipPlanName: String((dynamicData.membershipPlanName ?? 'Pro') || 'Pro'),
    cadenceLabel: String((dynamicData.cadenceLabel ?? 'Monthly') || 'Monthly')
  } satisfies Record<string, unknown>

  const subjectSource = String(draft.subjectTemplate || dynamicData.subject || '').trim()
  const preheaderSource = String(draft.preheaderTemplate || dynamicData.preheader || '').trim()
  const bodySource = String(draft.bodyTemplate || dynamicData.bodyHTML || dynamicData.bodyHtml || dynamicData.body || '').trim()

  const subject = subjectSource
    ? renderTokenTemplate(subjectSource, baseContext).trim()
    : 'FO Studio campaign update'
  const preheader = preheaderSource
    ? renderTokenTemplate(preheaderSource, { ...baseContext, subject }).trim()
    : 'Preview generated from current draft values.'
  const bodyHTML = bodySource
    ? renderTokenTemplate(bodySource, { ...baseContext, subject, preheader }).trim()
    : '<p>Draft content preview will appear here.</p>'

  return {
    ...baseContext,
    subject,
    preheader,
    body: bodyHTML,
    bodyHtml: bodyHTML,
    bodyHTML
  }
})

const sendgridPreviewHtmlContent = computed(() => {
  return String(sendgridLookup.value?.selectedVersion?.htmlContent ?? '').trim()
})
const isUsingFetchedSendgridPreview = computed(() => {
  return draft.renderMode === 'sendgrid_native' && sendgridPreviewHtmlContent.value.length > 0
})
const previewHtml = computed(() => {
  const template = draft.renderMode === 'sendgrid_native'
    ? (sendgridPreviewHtmlContent.value || SENDGRID_NATIVE_PREVIEW_TEMPLATE)
    : EDITOR_HTML_PREVIEW_TEMPLATE
  return renderHandlebarsLikeTemplate(template, previewContext.value)
})

const parsedDynamicData = computed<Record<string, unknown> | null>(() => {
  try {
    return parseDynamicDataJson(draft.dynamicDataJsonText)
  } catch {
    return null
  }
})

function parseDynamicDataOrNotify() {
  try {
    return parseDynamicDataJson(draft.dynamicDataJsonText)
  } catch (error: unknown) {
    toast.add({
      title: 'Dynamic data is invalid',
      description: readErrorMessage(error),
      color: 'error'
    })
    return null
  }
}

function readDynamicDataString(key: string) {
  const value = parsedDynamicData.value?.[key]
  if (value == null) return ''
  if (typeof value === 'string') return value
  return String(value)
}

function updateDynamicDataString(key: string, value: string) {
  const dynamicData = parseDynamicDataOrNotify()
  if (!dynamicData) return

  const normalized = String(value ?? '').trim()
  if (normalized) {
    setDynamicDataJson({
      ...dynamicData,
      [key]: normalized
    })
    return
  }

  const nextDynamicData = Object.fromEntries(
    Object.entries(dynamicData).filter(([entryKey]) => entryKey !== key)
  )
  setDynamicDataJson(nextDynamicData)
}

async function uploadCampaignImage(slot: CampaignImageSlot) {
  if (campaignImageUploadPending[slot.id]) return

  campaignImageUploadPending[slot.id] = true
  try {
    const image = await pickImageFromDevice({ maxBytes: EDITOR_IMAGE_MAX_BYTES })
    if (!image) return
    const uploaded = await uploadEditorImage(image.file)

    const dynamicData = parseDynamicDataOrNotify()
    if (!dynamicData) return

    dynamicData[slot.urlKey] = uploaded.url
    if (!String(dynamicData[slot.altKey] ?? '').trim()) {
      dynamicData[slot.altKey] = `${slot.label} image`
    }

    setDynamicDataJson(dynamicData)
    toast.add({
      title: `${slot.label} image uploaded`,
      description: 'Image URL inserted into campaign JSON.',
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({
      title: `Could not upload ${slot.label.toLowerCase()} image`,
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    campaignImageUploadPending[slot.id] = false
  }
}

function clearCampaignImage(slot: CampaignImageSlot) {
  const dynamicData = parseDynamicDataOrNotify()
  if (!dynamicData) return

  const nextDynamicData = Object.fromEntries(
    Object.entries(dynamicData).filter(([entryKey]) => {
      return entryKey !== slot.urlKey && entryKey !== slot.altKey
    })
  )
  setDynamicDataJson(nextDynamicData)
}

function setDynamicDataJson(value: Record<string, unknown>) {
  draft.dynamicDataJsonText = stringifyDynamicData(value)
}

function loadWebsiteLaunchPreset() {
  setDynamicDataJson({
    hero_enabled: true,
    hero_eyebrow: '',
    hero_title: '',
    hero_copy: '',
    hero_cta_url: '',
    hero_cta_label: '',
    intro_enabled: true,
    intro_title: '',
    intro_copy: '',
    features_enabled: true,
    features_title: '',
    feature_1_enabled: true,
    feature_1_title: '',
    feature_1_copy: '',
    feature_2_enabled: true,
    feature_2_title: '',
    feature_2_copy: '',
    feature_3_enabled: true,
    feature_3_title: '',
    feature_3_copy: '',
    features_image_url: '',
    features_image_alt: '',
    transition_enabled: true,
    transition_title: '',
    transition_bullet_1: '',
    transition_bullet_2: '',
    transition_bullet_3: '',
    transition_primary_url: '',
    transition_primary_label: '',
    transition_secondary_url: '',
    transition_secondary_label: '',
    transition_image_url: '',
    transition_image_alt: '',
    credits_enabled: true,
    credits_title: '',
    credits_bullet_1: '',
    credits_bullet_2: '',
    credits_bullet_3: '',
    credits_bullet_4: '',
    credits_bullet_5: '',
    impact_enabled: true,
    impact_title: '',
    impact_bullet_1: '',
    impact_bullet_2: '',
    impact_bullet_3: '',
    impact_bullet_4: '',
    impact_bullet_5: '',
    impact_image_url: '',
    impact_image_alt: '',
    offer_enabled: true,
    offer_title: '',
    offer_copy_html: '',
    offer_code: '',
    offer_cta_url: '',
    offer_cta_label: '',
    offer_image_url: '',
    offer_image_alt: '',
    closing_enabled: true,
    closing_title: '',
    closing_copy: '',
    footer_name: '',
    footer_address_1: '',
    footer_address_2: '',
    footer_link_home_url: '',
    footer_link_home_label: '',
    footer_link_memberships_url: '',
    footer_link_memberships_label: '',
    footer_link_faq_url: '',
    footer_link_faq_label: '',
    footer_link_contact_url: '',
    footer_link_contact_label: ''
  })
}

function resolveDefaultEventType() {
  const preferred = eventTypeOptions.value.find(option => option.eventType === 'mailing.memberBroadcast')
  if (preferred) return preferred.eventType
  return eventTypeOptions.value[0]?.eventType ?? 'mailing.memberBroadcast'
}

function resolveRegistryTemplateId(eventType: string) {
  return String(eventTypeRegistryByEvent.value.get(eventType)?.sendgridTemplateId ?? '').trim()
}

function syncTemplateIdFromRegistry(options: { silent?: boolean } = {}) {
  const registryTemplateId = resolveRegistryTemplateId(draft.eventType)
  if (!registryTemplateId) {
    if (knownEventTypeSet.value.has(draft.eventType)) {
      draft.sendgridTemplateId = ''
    }

    if (!options.silent) {
      if (knownEventTypeSet.value.has(draft.eventType)) {
        toast.add({
          title: 'Registry template is missing',
          description: 'No template id is currently mapped for this event type in the mail registry.',
          color: 'warning'
        })
      } else {
        toast.add({
          title: 'Legacy event selected',
          description: 'This campaign event is not in the registry; keeping the current SendGrid template id.',
          color: 'neutral'
        })
      }
    }
    return
  }

  draft.sendgridTemplateId = registryTemplateId
  if (!options.silent) {
    toast.add({
      title: 'Template id synced',
      description: `Using registry template id ${registryTemplateId}.`,
      color: 'success'
    })
  }
}

function onEventTypeSelected(eventType: string) {
  draft.eventType = eventType
  syncTemplateIdFromRegistry({ silent: true })
}

function hydrateDraftFromCampaign(campaign: CampaignRecord | null) {
  if (!campaign) {
    const defaultEventType = resolveDefaultEventType()
    draft.id = null
    draft.name = ''
    draft.status = 'draft'
    draft.templateId = null
    draft.eventType = defaultEventType
    draft.sendgridTemplateId = resolveRegistryTemplateId(defaultEventType)
    draft.renderMode = 'editor_html'
    draft.subjectTemplate = ''
    draft.preheaderTemplate = ''
    draft.bodyTemplate = ''
    draft.dynamicDataJsonText = '{}'
    draft.includeMembershipRecipients = true
    draft.additionalRecipientsText = ''
    return
  }

  draft.id = campaign.id
  draft.name = campaign.name
  draft.status = campaign.status
  draft.templateId = campaign.templateId
  draft.eventType = campaign.eventType
  draft.sendgridTemplateId = normalizeTemplateId(campaign.sendgridTemplateId)
  draft.renderMode = campaign.renderMode
  draft.subjectTemplate = campaign.subjectTemplate
  draft.preheaderTemplate = campaign.preheaderTemplate
  draft.bodyTemplate = campaign.bodyTemplate
  draft.dynamicDataJsonText = stringifyDynamicData(campaign.dynamicData)
  draft.includeMembershipRecipients = campaign.includeMembershipRecipients
  draft.additionalRecipientsText = campaign.additionalRecipients.join('\n')
}

function applySelectedTemplateRoutingToDraft() {
  const template = selectedTemplate.value
  if (!template) return

  draft.eventType = template.eventType
  draft.sendgridTemplateId = normalizeTemplateId(template.sendgridTemplateId)
  draft.renderMode = template.renderMode ?? 'editor_html'
}

function applySelectedTemplateContentToDraft() {
  const template = selectedTemplate.value
  if (!template) return

  draft.subjectTemplate = template.subjectTemplate ?? ''
  draft.preheaderTemplate = template.preheaderTemplate ?? ''
  draft.bodyTemplate = template.bodyTemplate ?? ''
  draft.dynamicDataJsonText = stringifyDynamicData(template.dynamicDataTemplate ?? {})
}

function readCampaignIdFromQuery() {
  const value = route.query.campaign
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' && item.trim())
    if (typeof first === 'string' && first.trim()) return first.trim()
  }
  return null
}

async function syncCampaignQuery(campaignId: string | null) {
  if (import.meta.server) return
  const currentCampaignId = readCampaignIdFromQuery()
  if (campaignId === currentCampaignId) return

  const nextQuery = { ...route.query }
  if (campaignId) nextQuery.campaign = campaignId
  else delete nextQuery.campaign

  syncingCampaignQuery.value = true
  try {
    await router.replace({ query: nextQuery })
  } finally {
    syncingCampaignQuery.value = false
  }
}

async function selectCampaign(campaignId: string, options: { syncQuery?: boolean } = {}) {
  const selected = campaigns.value.find(item => item.id === campaignId) ?? null
  if (!selected) return
  selectedCampaignId.value = campaignId
  hydrateDraftFromCampaign(selected)
  if (options.syncQuery !== false) {
    await syncCampaignQuery(campaignId)
  }
}

async function createCampaignDraft(options: { syncQuery?: boolean } = {}) {
  selectedCampaignId.value = null
  hydrateDraftFromCampaign(null)
  draft.name = `Campaign ${new Date().toLocaleDateString('en-US')}`
  if (options.syncQuery !== false) {
    await syncCampaignQuery(null)
  }
}

function selectAdjacentCampaign(direction: 'prev' | 'next') {
  const currentIndex = selectedCampaignIndex.value
  if (currentIndex < 0) return
  const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
  const target = campaignRows.value[targetIndex]
  if (!target) return
  void selectCampaign(target.id)
}

async function reloadCampaigns(options: { preserveSelection?: boolean } = {}) {
  await refresh()
  const selectedFromQuery = readCampaignIdFromQuery()
  const preferredCampaignId = selectedFromQuery ?? (options.preserveSelection ? selectedCampaignId.value : null)
  if (preferredCampaignId) {
    const exists = campaigns.value.some(item => item.id === preferredCampaignId)
    if (exists) {
      await selectCampaign(preferredCampaignId)
      return
    }
  }

  if (campaigns.value.length > 0) {
    await selectCampaign(campaigns.value[0]!.id)
    return
  }

  await createCampaignDraft()
}

async function saveCampaign(options: { silentSuccess?: boolean } = {}) {
  if (!isDraftEventTypeRegistered.value) {
    toast.add({
      title: 'Event type is not registered',
      description: 'Select a registered mail event type before saving this campaign.',
      color: 'warning'
    })
    return false
  }

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
    const result = await $fetch<{ campaign: { id: string } }>('/api/admin/email/campaigns.upsert', {
      method: 'POST',
      body: {
        id: draft.id ?? undefined,
        name: draft.name,
        status: draft.status,
        templateId: draft.templateId,
        eventType: draft.eventType,
        sendgridTemplateId: draftSendgridTemplateId.value,
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
  if (!draftSendgridTemplateId.value) {
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
  if (!draftSendgridTemplateId.value) {
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
  ], tokenItems]
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
  const selectedFromQuery = readCampaignIdFromQuery()
  if (selectedFromQuery) {
    const fromQuery = campaigns.value.find(item => item.id === selectedFromQuery)
    if (fromQuery) {
      selectedCampaignId.value = fromQuery.id
      hydrateDraftFromCampaign(fromQuery)
      return
    }
  }

  if (selectedCampaignId.value) {
    const selected = campaigns.value.find(item => item.id === selectedCampaignId.value)
    if (selected) {
      hydrateDraftFromCampaign(selected)
      return
    }
  }

  if (campaigns.value.length > 0) {
    void selectCampaign(campaigns.value[0]!.id)
    return
  }

  void createCampaignDraft()
}, { immediate: true })

watch(() => route.query.campaign, () => {
  if (syncingCampaignQuery.value) return

  const selectedFromQuery = readCampaignIdFromQuery()
  if (!selectedFromQuery) return
  if (selectedFromQuery === selectedCampaignId.value) return

  const fromQuery = campaigns.value.find(item => item.id === selectedFromQuery)
  if (fromQuery) {
    selectedCampaignId.value = fromQuery.id
    hydrateDraftFromCampaign(fromQuery)
  }
})

watch(() => draft.sendgridTemplateId, () => {
  queueSendgridTemplateLookup(draftSendgridTemplateId.value)
}, { immediate: true })

onBeforeUnmount(() => {
  clearSendgridLookupTimer()
})
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-email-campaigns"
    title="Email Campaigns"
  >
    <template #right>
      <DashboardActionGroup
        :primary="{
          label: 'New draft',
          icon: 'i-lucide-plus',
          color: 'neutral',
          variant: 'soft',
          onSelect: () => { void createCampaignDraft() }
        }"
        :secondary="[
          {
            label: 'Refresh',
            icon: 'i-lucide-refresh-cw',
            color: 'neutral',
            variant: 'soft',
            loading: pending,
            onSelect: () => reloadCampaigns({ preserveSelection: true })
          }
        ]"
      />
    </template>
    <UAlert
      color="info"
      variant="soft"
      icon="i-lucide-megaphone"
      title="Campaign workflow"
      description="Campaigns are separate from the mail template registry. Build drafts, pick a campaign template, and send when ready."
    />

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <UCard class="order-last xl:order-first">
        <div class="flex items-center justify-between gap-2">
          <div>
            <div class="text-sm font-medium">
              Compose campaign
            </div>
            <div class="text-xs text-dimmed mt-0.5">
              Draft copy, audience, and template mapping before send.
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UBadge
              :color="draft.status === 'draft' ? 'warning' : draft.status === 'sent' ? 'success' : 'neutral'"
              variant="soft"
            >
              {{ draft.status }}
            </UBadge>
            <UBadge
              v-if="selectedCampaignRow"
              color="neutral"
              variant="subtle"
            >
              {{ selectedCampaignRow.name }}
            </UBadge>
          </div>
        </div>

        <div class="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <UFormField
            label="Quick campaign switcher"
            description="Switch between drafts without scrolling to the campaign list."
          >
            <USelect
              v-model="campaignNavigatorValue"
              class="w-full"
              :items="campaignSelectItems"
              placeholder="Select campaign"
              :disabled="campaignRows.length === 0"
            />
          </UFormField>

          <div class="flex items-end">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-arrow-left"
              :disabled="!canSelectPreviousCampaign"
              @click="selectAdjacentCampaign('prev')"
            >
              Previous
            </UButton>
          </div>

          <div class="flex items-end">
            <UButton
              color="neutral"
              variant="soft"
              trailing-icon="i-lucide-arrow-right"
              :disabled="!canSelectNextCampaign"
              @click="selectAdjacentCampaign('next')"
            >
              Next
            </UButton>
          </div>
        </div>

        <div class="mt-4 space-y-4">
          <section class="rounded-lg border border-default/80 bg-default/40 p-3 space-y-3">
            <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
              Campaign setup
            </div>
            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Campaign name">
                <UInput
                  v-model="draft.name"
                  class="w-full"
                  placeholder="April studio update"
                />
              </UFormField>

              <UFormField label="Status">
                <USelect
                  v-model="draft.status"
                  class="w-full"
                  :items="campaignStatusItems"
                />
              </UFormField>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField
                label="Campaign template"
                description="Select a reusable template preset."
              >
                <USelect
                  v-model="templateSelectValue"
                  class="w-full"
                  :items="templateSelectItems"
                />
              </UFormField>

              <div class="flex flex-wrap items-end gap-2">
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-route"
                  :disabled="!selectedTemplate"
                  @click="applySelectedTemplateRoutingToDraft"
                >
                  Apply preset routing
                </UButton>
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-copy-plus"
                  :disabled="!selectedTemplate"
                  @click="applySelectedTemplateContentToDraft"
                >
                  Apply preset content
                </UButton>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-default/80 bg-default/40 p-3 space-y-3">
            <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
              Delivery and rendering
            </div>
            <div class="rounded-md border border-default/80 bg-default/60 p-3 space-y-3">
              <div class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                Routing
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Mail event type">
                  <USelect
                    v-model="eventTypeSelectValue"
                    class="w-full"
                    :items="eventTypeSelectItems"
                    placeholder="Choose event type"
                  />
                </UFormField>

                <UFormField label="SendGrid template id">
                  <USelectMenu
                    v-model="draftTemplateIdModel"
                    class="w-full"
                    :items="sendgridTemplateIdSelectItems"
                    create-item="always"
                    search-input
                    :ui="{
                      item: 'items-start',
                      itemLabel: '!overflow-visible !whitespace-normal !break-words',
                      itemDescription: '!overflow-visible !whitespace-normal !break-words',
                      value: '!overflow-visible !whitespace-normal !break-words'
                    }"
                    placeholder="Search or enter template id"
                    @create="(item: unknown) => { onCampaignTemplateIdCreate(item) }"
                  >
                    <template #item-label="{ item }">
                      {{ (item as SendgridTemplateSelectItem).label }}
                    </template>
                    <template #item-description="{ item }">
                      {{ (item as SendgridTemplateSelectItem).description }}
                    </template>
                  </USelectMenu>
                </UFormField>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :color="isDraftEventTypeRegistered ? 'neutral' : 'warning'"
                  variant="soft"
                >
                  {{ isDraftEventTypeRegistered ? 'registered event' : 'legacy event' }}
                </UBadge>
                <UBadge
                  v-if="registryTemplateIdForDraftEvent"
                  :color="isDraftTemplateIdSyncedWithRegistry ? 'success' : 'warning'"
                  variant="soft"
                >
                  {{ isDraftTemplateIdSyncedWithRegistry ? 'registry synced' : 'manual template id override' }}
                </UBadge>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-refresh-cw"
                  :disabled="!registryTemplateIdForDraftEvent"
                  @click="syncTemplateIdFromRegistry()"
                >
                  Sync template id from registry
                </UButton>
              </div>

              <div
                v-if="selectedEventTypeOption"
                class="text-xs text-dimmed"
              >
                {{ selectedEventTypeOption.description }}
              </div>
              <div class="text-xs text-dimmed">
                Registry template:
                <code>{{ registryTemplateIdForDraftEvent || '(none configured)' }}</code>
                <template v-if="selectedEventTypeRegistryEntry?.updatedAt">
                  · updated {{ formatIsoDate(selectedEventTypeRegistryEntry.updatedAt) }}
                </template>
              </div>
            </div>

            <div class="rounded-md border border-default/80 bg-default/60 p-3 space-y-3">
              <div class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                Render mode
              </div>
              <UFormField
                label="Render mode"
                description="Editor HTML mode renders bodyHTML server-side. SendGrid native mode uses dynamic data JSON for section toggles and content."
              >
                <USelect
                  v-model="draft.renderMode"
                  class="w-full"
                  :items="renderModeItems"
                />
              </UFormField>
            </div>

            <div class="rounded-md border border-default/80 bg-default/60 p-3 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <div class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                  Live SendGrid template lookup
                </div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-refresh-cw"
                  :loading="sendgridLookupPending"
                  :disabled="!draftSendgridTemplateId"
                  @click="() => { void fetchLatestSendgridTemplate(draftSendgridTemplateId) }"
                >
                  Refresh now
                </UButton>
              </div>
              <div
                v-if="sendgridLookupError"
                class="text-xs text-error"
              >
                {{ sendgridLookupError }}
              </div>
              <div
                v-else-if="sendgridLookupPending"
                class="text-xs text-dimmed"
              >
                Fetching latest SendGrid template version...
              </div>
              <div
                v-else-if="sendgridLookup"
                class="space-y-1 text-xs text-dimmed"
              >
                <div>
                  Template: <code>{{ sendgridLookup.templateId }}</code>
                  <template v-if="sendgridLookup.name">
                    · {{ sendgridLookup.name }}
                  </template>
                </div>
                <div>
                  Version source: <strong>{{ sendgridLookup.resolvedFrom }}</strong>
                  <template v-if="sendgridLookup.selectedVersion?.id">
                    · version <code>{{ sendgridLookup.selectedVersion.id }}</code>
                  </template>
                </div>
                <div>
                  Subject: {{ sendgridLookup.selectedVersion?.subject || '(empty)' }}
                </div>
                <div v-if="sendgridLookup.selectedVersion?.updatedAt">
                  Version updated {{ formatIsoDate(sendgridLookup.selectedVersion?.updatedAt ?? null) }}
                </div>
              </div>
              <div
                v-else
                class="text-xs text-dimmed"
              >
                Set a SendGrid template id to fetch active/latest version details.
              </div>
            </div>

            <div class="rounded-md border border-default/80 bg-default/60 p-3 space-y-3">
              <div class="text-[11px] font-semibold uppercase tracking-wide text-dimmed">
                Template id history
              </div>
              <div
                v-if="currentCampaignTemplateHistory.length === 0"
                class="text-xs text-dimmed"
              >
                No template-id history yet for this campaign.
              </div>
              <div
                v-else
                class="space-y-1.5"
              >
                <div
                  v-for="historyEntry in currentCampaignTemplateHistory"
                  :key="`${historyEntry.templateId}-${historyEntry.savedAt}`"
                  class="rounded border border-default/70 bg-default px-2 py-1.5 text-xs text-dimmed"
                >
                  <div>
                    <code>{{ historyEntry.templateId }}</code>
                  </div>
                  <div>
                    Saved {{ formatIsoDate(historyEntry.savedAt) }}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-default/80 bg-default/40 p-3 space-y-3">
            <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
              Audience
            </div>
            <div class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2 bg-default">
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
          </section>

          <section class="rounded-lg border border-default/80 bg-default/40 p-3 space-y-3">
            <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
              Message copy
            </div>
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
          </section>

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
              class="campaign-editor-shell w-full rounded-md border border-zinc-200/80 bg-white overflow-visible dark:border-zinc-700/80 dark:bg-zinc-900"
              :placeholder="editorPlaceholder(draft.bodyTemplate, 'Write campaign body HTML...')"
            >
              <UEditorToolbar
                :editor="editor"
                :items="editorToolbarItems"
                class="border-b border-zinc-200/80 dark:border-zinc-700/80 sticky top-0 inset-x-0 p-1.5 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur overflow-x-auto"
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
                :ui="{ handle: '-translate-x-2 rounded border border-zinc-200/80 dark:border-zinc-700/80 bg-white dark:bg-zinc-900/95' }"
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
              <div class="rounded-md border border-default p-2.5 space-y-2">
                <div class="text-xs font-medium text-highlighted">
                  Campaign images (writes directly into JSON)
                </div>
                <div class="grid gap-2 md:grid-cols-2">
                  <div
                    v-for="slot in CAMPAIGN_IMAGE_SLOTS"
                    :key="`campaign-image-${slot.id}`"
                    class="rounded-md border border-default/80 p-2 space-y-2"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-xs font-medium text-highlighted">
                        {{ slot.label }}
                      </div>
                      <div class="flex items-center gap-1">
                        <UButton
                          size="xs"
                          color="neutral"
                          variant="soft"
                          icon="i-lucide-image-up"
                          :loading="campaignImageUploadPending[slot.id]"
                          @click="() => { void uploadCampaignImage(slot) }"
                        >
                          Upload
                        </UButton>
                        <UButton
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          icon="i-lucide-x"
                          @click="clearCampaignImage(slot)"
                        >
                          Clear
                        </UButton>
                      </div>
                    </div>
                    <div class="text-[11px] text-dimmed">
                      Keys: <code>{{ slot.urlKey }}</code>, <code>{{ slot.altKey }}</code>
                    </div>
                    <UInput
                      :model-value="readDynamicDataString(slot.urlKey)"
                      class="w-full"
                      placeholder="https://.../image.jpg"
                      @update:model-value="(value) => updateDynamicDataString(slot.urlKey, String(value ?? ''))"
                    />
                    <UInput
                      :model-value="readDynamicDataString(slot.altKey)"
                      class="w-full"
                      placeholder="Alt text"
                      @update:model-value="(value) => updateDynamicDataString(slot.altKey, String(value ?? ''))"
                    />
                    <img
                      v-if="readDynamicDataString(slot.urlKey)"
                      :src="readDynamicDataString(slot.urlKey)"
                      :alt="readDynamicDataString(slot.altKey) || `${slot.label} preview`"
                      class="w-full max-h-28 object-cover rounded border border-default/70"
                    >
                  </div>
                </div>
              </div>
              <UTextarea
                v-model="draft.dynamicDataJsonText"
                :rows="20"
                class="w-full font-mono text-xs"
                placeholder="{&#10;  &quot;hero_enabled&quot;: true&#10;}"
              />
            </div>
          </UFormField>

          <section class="rounded-lg border border-default/80 bg-default/40 p-3 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                Draft preview
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
                  :srcdoc="previewHtml"
                  class="w-full min-h-[760px] rounded-md border border-default/70 bg-white"
                  :sandbox="previewFrameSandbox"
                  title="Campaign preview"
                />
              </div>
            </div>
            <p class="text-xs text-dimmed">
              Preview is a local renderer for template variables and <code v-pre>{{#if ...}}</code> blocks.
              <template v-if="isUsingFetchedSendgridPreview">
                Using fetched SendGrid version HTML for the current template id.
              </template>
              <template v-else-if="draft.renderMode === 'sendgrid_native'">
                Using local fallback shell because a fetched SendGrid version HTML payload is not available.
              </template>
              Final client rendering can vary slightly by inbox provider.
            </p>
          </section>

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
              @click="() => { void createCampaignDraft() }"
            >
              New draft
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              :loading="saving"
              :disabled="isArchivedDraft || !isDraftEventTypeRegistered"
              @click="() => { void saveCampaign() }"
            >
              Save draft
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-flask-conical"
              :loading="sendingTest"
              :disabled="isArchivedDraft || !isDraftEventTypeRegistered || !draftSendgridTemplateId"
              @click="sendCampaignTest"
            >
              Send test
            </UButton>
            <UButton
              icon="i-lucide-send"
              :loading="sending"
              :disabled="isArchivedDraft || !isDraftEventTypeRegistered || !draftSendgridTemplateId || (!draft.includeMembershipRecipients && parseRecipientsInput(draft.additionalRecipientsText).length === 0)"
              @click="sendCampaign"
            >
              Send campaign
            </UButton>
          </div>
        </template>
      </UCard>

      <aside class="order-first xl:order-last space-y-4 xl:sticky xl:top-4 self-start">
        <UCard>
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-sm font-medium">
                Campaigns
              </div>
              <div class="text-xs text-dimmed mt-0.5">
                {{ campaignRows.length }} total campaign{{ campaignRows.length === 1 ? '' : 's' }}
              </div>
            </div>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              color="neutral"
              variant="soft"
              @click="() => { void createCampaignDraft() }"
            >
              New Draft
            </UButton>
          </div>

          <div
            v-if="selectedCampaignRow"
            class="mt-3 rounded-md border border-default/80 bg-default/50 p-2.5"
          >
            <div class="text-xs font-medium text-highlighted">
              Selected
            </div>
            <div class="mt-1 text-sm font-medium">
              {{ selectedCampaignRow.name }}
            </div>
            <div class="mt-1 text-xs text-dimmed">
              Updated {{ formatIsoDate(selectedCampaignRow.updatedAt) }}
            </div>
            <div class="text-xs text-dimmed">
              Sent {{ formatIsoDate(selectedCampaignRow.lastSentAt) }}
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
            Campaign list
          </div>
          <div class="mt-3 max-h-[44rem] overflow-y-auto space-y-2 pr-1">
            <button
              v-for="campaign in campaignRows"
              :key="campaign.id"
              type="button"
              class="w-full rounded-md border p-2.5 text-left transition-colors"
              :class="campaign.id === selectedCampaignId
                ? 'border-primary/60 bg-primary/10'
                : 'border-default/80 bg-default/40 hover:bg-default/70'"
              @click="selectCampaign(campaign.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="text-sm font-medium text-highlighted leading-tight">
                  {{ campaign.name }}
                </div>
                <UBadge
                  :color="campaign.status === 'draft' ? 'warning' : campaign.status === 'sent' ? 'success' : 'neutral'"
                  variant="soft"
                  size="sm"
                >
                  {{ campaign.status }}
                </UBadge>
              </div>
              <div class="mt-1 text-[11px] text-dimmed leading-tight">
                Template: {{ campaign.templateName }}
              </div>
              <div class="text-[11px] text-dimmed leading-tight">
                Updated {{ formatIsoDate(campaign.updatedAt) }}
              </div>
            </button>

            <div
              v-if="campaignRows.length === 0"
              class="rounded-md border border-dashed border-default px-3 py-4 text-sm text-dimmed text-center"
            >
              No campaigns yet. Create your first draft.
            </div>
          </div>
        </UCard>
      </aside>
    </div>
  </DashboardPageScaffold>
</template>

<style scoped>
.campaign-editor-shell :deep(.tiptap.ProseMirror),
.campaign-editor-shell :deep(.ProseMirror) {
  min-height: 22rem;
  max-height: 38rem;
  overflow-y: auto;
  padding: 0.95rem 1rem 0.95rem 2.4rem;
  line-height: 1.55;
}

.campaign-editor-shell :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
