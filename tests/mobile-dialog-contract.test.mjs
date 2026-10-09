import assert from 'node:assert/strict'
import { globSync, readFileSync } from 'node:fs'
import test from 'node:test'

test('custom modal content uses the shared scroll-safe card layout', () => {
  for (const file of globSync('app/**/*.vue')) {
    const source = readFileSync(file, 'utf8')
    for (const modal of source.matchAll(/<UModal\b[\s\S]*?<\/UModal>/g)) {
      const content = modal[0].match(/<template #content[^>]*>\s*([^]*?)<\/template>/)
      if (content) assert.match(content[1], /^<UCard\b/, `${file}: custom content needs a scroll-safe layout`)
    }
  }
  const css = readFileSync('app/assets/css/main.css', 'utf8')
  assert.match(css, /\.app-dialog-surface > \.app-card \{[^}]*min-height: 0;[^}]*max-height: inherit;/)
  assert.match(css, /\.app-dialog-surface > \.app-card > \[data-slot='body'\] \{[^}]*min-height: 0;[^}]*overflow-y: auto;/)
})

test('extension UI permits upcoming and ongoing bookings, but excludes standby and unpaid bookings', () => {
  const source = readFileSync('app/pages/dashboard/bookings.vue', 'utf8')
  const guard = source.match(/function canExtend\(booking: Booking\) \{([^]*?)\n\}/)?.[1]
  assert.ok(guard)
  assert.match(guard, /booking_rate_kind === 'standby'/)
  assert.match(guard, /isPendingPayment\(booking\)/)
  assert.match(guard, /return !hasEnded\(booking\)/)
  assert.doesNotMatch(guard, /hasPassed\(booking\)/)
})
