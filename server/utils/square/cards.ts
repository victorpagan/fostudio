function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function toRecordArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
}

export function extractSquareCards(listRes: unknown) {
  const root = asRecord(listRes)
  if (!root) return [] as Array<Record<string, unknown>>

  const data = asRecord(root.data)
  const cardsFromData = toRecordArray(data?.cards)
  if (cardsFromData.length) return cardsFromData

  return toRecordArray(root.cards)
}
