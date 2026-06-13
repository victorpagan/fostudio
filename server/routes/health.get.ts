export default defineEventHandler(() => {
  return {
    ok: true,
    service: 'fostudio',
    state: 'up',
    checkedAt: new Date().toISOString()
  }
})
