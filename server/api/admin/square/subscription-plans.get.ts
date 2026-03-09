import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

type SquareCatalogObject = {
  id?: string
  type?: string
  createdAt?: string
  updatedAt?: string
  created_at?: string
  updated_at?: string
  subscriptionPlanData?: {
    name?: string
    eligibleItemIds?: unknown
    subscriptionPlanVariations?: Array<{ id?: string }>
    subscription_plan_variations?: Array<{ id?: string }>
  }
  subscription_plan_data?: {
    name?: string
    eligible_item_ids?: unknown
    subscription_plan_variations?: Array<{ id?: string }>
  }
}

function readObjects(response: unknown): SquareCatalogObject[] {
  if (!response || typeof response !== 'object') return []
  const payload = response as {
    objects?: unknown[]
    body?: { objects?: unknown[] }
    result?: { objects?: unknown[] }
  }
  const values = payload.objects ?? payload.body?.objects ?? payload.result?.objects ?? []
  return Array.isArray(values) ? (values as SquareCatalogObject[]) : []
}

function readCursor(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null
  const payload = response as {
    cursor?: string
    body?: { cursor?: string }
    result?: { cursor?: string }
  }
  const cursor = payload.cursor ?? payload.body?.cursor ?? payload.result?.cursor ?? null
  return typeof cursor === 'string' && cursor.trim() ? cursor : null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(entry => typeof entry === 'string' ? entry.trim() : '')
    .filter((entry): entry is string => entry.length > 0)
}

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)
  const square = await useSquareClient(event)

  const planObjects: SquareCatalogObject[] = []
  let cursor: string | null = null

  // Temporary admin tool: fetch all subscription plans across pages.
  for (let page = 0; page < 20; page += 1) {
    const response = await square.catalog.search({
      objectTypes: ['SUBSCRIPTION_PLAN'],
      includeRelatedObjects: true,
      includeDeletedObjects: false,
      limit: 100,
      cursor: cursor ?? undefined
    } as never)

    const objects = readObjects(response).filter(object => object?.type === 'SUBSCRIPTION_PLAN')
    planObjects.push(...objects)
    cursor = readCursor(response)
    if (!cursor) break
  }

  const plans = planObjects
    .map((object) => {
      const planData = object.subscriptionPlanData ?? object.subscription_plan_data
      const variationEntries = planData?.subscriptionPlanVariations ?? planData?.subscription_plan_variations ?? []
      const variationIds = toStringArray(variationEntries.map(row => row?.id ?? ''))
      const eligibleItemIds = toStringArray(planData?.eligibleItemIds ?? planData?.eligible_item_ids ?? [])
      return {
        id: object.id ?? '',
        name: planData?.name ?? object.id ?? '(unnamed)',
        variationIds,
        eligibleItemIds,
        createdAt: object.createdAt ?? object.created_at ?? null,
        updatedAt: object.updatedAt ?? object.updated_at ?? null
      }
    })
    .filter(plan => plan.id)
    .sort((left, right) => left.name.localeCompare(right.name))

  return { plans }
})
