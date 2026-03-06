type LooseRecord = Record<string, unknown>

export type PendingSwapAction = {
  actionId: string | null
  effectiveDate: string | null
  newPlanVariationId: string | null
}

export type PendingCancelAction = {
  actionId: string | null
  effectiveDate: string | null
}

export function readSquareString(source: LooseRecord | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function toRecordArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter(item => item && typeof item === 'object') as LooseRecord[]
}

export function normalizeSquareActionType(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().toUpperCase()
}

export function findPendingSwapAction(actions: LooseRecord[]): PendingSwapAction | null {
  for (const action of actions) {
    if (normalizeSquareActionType(action.type) !== 'SWAP_PLAN') continue
    return {
      actionId: readSquareString(action, 'id'),
      effectiveDate: readSquareString(action, 'effectiveDate', 'effective_date'),
      newPlanVariationId: readSquareString(action, 'newPlanVariationId', 'new_plan_variation_id')
    }
  }
  return null
}

export function findPendingCancelAction(actions: LooseRecord[]): PendingCancelAction | null {
  for (const action of actions) {
    if (normalizeSquareActionType(action.type) !== 'CANCEL') continue
    return {
      actionId: readSquareString(action, 'id'),
      effectiveDate: readSquareString(action, 'effectiveDate', 'effective_date')
    }
  }
  return null
}
