export function formatMembershipTierLabel(tierId: string | null | undefined) {
  const raw = (tierId ?? '').trim()
  if (!raw) return null
  if (raw === 'studio_plus') return 'Studio+'

  return raw
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
