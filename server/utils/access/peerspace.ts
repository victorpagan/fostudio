export type PeerspaceEventDetails = {
  isPeerspace: boolean
  guestName: string | null
  externalReference: string | null
  manageUrl: string | null
}

type PeerspaceEventLike = {
  title: string | null
  description: string | null
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

export function normalizePeerspaceReference(value: unknown) {
  const normalized = normalizeText(value)
  return normalized ? normalized.replace(/^,+/, '').trim().toUpperCase() || null : null
}

function extractManageUrl(description: string) {
  const match = description.match(/https:\/\/(?:www\.)?peerspace\.com\/[^\s<>"']+/i)
  return normalizeText(match?.[0])
}

function extractReferenceFromManageUrl(manageUrl: string | null) {
  if (!manageUrl) return null
  let decoded = manageUrl
  try {
    decoded = decodeURIComponent(manageUrl)
  } catch {
    // Keep the original URL when a malformed escape sequence is present.
  }
  return normalizePeerspaceReference(decoded.match(/\/inbox\/([a-z0-9-]+)/i)?.[1])
}

export function getPeerspaceReferenceMatches<T extends {
  provider: 'peerspace' | 'manual'
  external_reference: string | null
}>(links: T[], reference: unknown) {
  const normalizedReference = normalizePeerspaceReference(reference)
  if (!normalizedReference) return []

  return links.filter(link => (
    ['peerspace', 'manual'].includes(link.provider)
    && normalizePeerspaceReference(link.external_reference) === normalizedReference
  ))
}

export function parsePeerspaceEventDetails(event: PeerspaceEventLike): PeerspaceEventDetails {
  const title = normalizeText(event.title) ?? ''
  const description = normalizeText(event.description) ?? ''
  const manageUrl = extractManageUrl(description)
  const titleMatch = title.match(/^Peerspace\s+Booking\s*,\s*(.+)$/i)
  const confirmationMatch = description.match(/Confirmation\s+number\s*:\s*,?\s*([a-z0-9-]+)/i)
  const externalReference = normalizePeerspaceReference(confirmationMatch?.[1])
    ?? extractReferenceFromManageUrl(manageUrl)

  return {
    isPeerspace: Boolean(titleMatch || manageUrl || /\bpeerspace\b/i.test(description)),
    guestName: normalizeText(titleMatch?.[1]),
    externalReference,
    manageUrl
  }
}
