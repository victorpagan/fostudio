// File: server/api/memberships.get.ts
export default defineEventHandler(async () => {
  // Initial caps you picked
  const caps: Record<string, number> = {
    creator: 10,
    pro: 5,
    studio_plus: 3
  }

  // TODO: replace with DB counts:
  // e.g. SELECT tier, count(*) FROM memberships WHERE status='active' GROUP BY tier
  const active: Record<string, number> = {
    creator: 0,
    pro: 0,
    studio_plus: 0
  }

  const availability: Record<
    string,
    { cap: number; active: number; spotsLeft: number; isFull: boolean }
  > = {}

  for (const [tier, cap] of Object.entries(caps)) {
    const used = active[tier] ?? 0
    const spotsLeft = Math.max(cap - used, 0)
    availability[tier] = {
      cap,
      active: used,
      spotsLeft,
      isFull: spotsLeft <= 0
    }
  }

  return { availability }
})
