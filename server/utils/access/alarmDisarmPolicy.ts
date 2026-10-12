export function shouldDisarmAwayOnly(state: string | null) {
  if (!state || ['unknown', 'unavailable'].includes(state)) {
    throw new Error(`Cannot safely check daytime booking alarm state: ${state ?? 'missing'}`)
  }
  return state === 'armed_away'
}
