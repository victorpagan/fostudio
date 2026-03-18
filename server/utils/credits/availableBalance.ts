function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export async function resolveAvailableCreditBalance(
  supabase: any,
  userId: string
): Promise<number> {
  const { data: balanceRow, error: balanceErr } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle()

  if (balanceErr) throw balanceErr

  const balance = toNumber(balanceRow?.balance)
  if (balance > 0) return balance

  // Fallback for environments where credit_balance can lag or be missing.
  const nowIso = new Date().toISOString()
  const { data: ledgerRows, error: ledgerErr } = await supabase
    .from('credits_ledger')
    .select('delta,expires_at')
    .eq('user_id', userId)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)

  if (ledgerErr) throw ledgerErr

  const computed = (ledgerRows ?? []).reduce((sum: number, row: { delta?: unknown }) => {
    return sum + toNumber(row?.delta)
  }, 0)

  return Math.max(0, Number(computed.toFixed(2)))
}

