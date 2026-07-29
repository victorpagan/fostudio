import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('guest payment status is authenticated, ownership-scoped, and resumable', async () => {
  const endpoint = await readProjectFile('server/api/bookings/guest/payment-status.get.ts')

  assert.match(endpoint, /serverSupabaseUser\(event\)/)
  assert.match(endpoint, /\.eq\('user_id', user\.sub\)/)
  assert.match(endpoint, /inspectGuestPaymentCheckout/)
  assert.match(endpoint, /checkoutAvailable/)
  assert.match(endpoint, /issueMessage/)
  assert.doesNotMatch(endpoint, /topupToken|session\.token/)
})

test('expired and released reservations close Square checkout before local cancellation', async () => {
  const [cleanup, cancellation, checkout] = await Promise.all([
    readProjectFile('server/utils/booking/pendingPayments.ts'),
    readProjectFile('server/api/bookings/[id].delete.ts'),
    readProjectFile('server/utils/booking/guestPaymentCheckout.ts')
  ])

  assert.match(cleanup, /closeGuestPaymentCheckout/)
  assert.match(cleanup, /scope\.bookingId/)
  assert.match(cleanup, /scope\.startTime/)
  assert.match(cleanup, /completed \|\| closeResult\.inFlight/)
  assert.match(cleanup, /safe expiry deferred/)
  assert.match(cancellation, /closeGuestPaymentCheckout/)
  assert.match(cancellation, /Payment is already processing/)
  assert.match(checkout, /square\.checkout\.paymentLinks\.delete/)
  assert.match(checkout, /guestPaymentIssueMessage/)
  assert.match(checkout, /CVV_FAILURE/)
})

test('Square decline inspection prefers actionable payment errors', async () => {
  const resolver = await readProjectFile('server/utils/square/orderPayment.ts')

  assert.match(resolver, /readPaymentFailure\(item\)/)
  assert.match(resolver, /cardDetails\?\.errors/)
  assert.match(resolver, /GENERIC_DECLINE/)
  assert.match(resolver, /failureCode: failureCode \?\? tenderFailure\.code/)
})

test('guest booking surfaces recovery actions and labels unverified payment clearly', async () => {
  const [book, bookings, success] = await Promise.all([
    readProjectFile('app/pages/dashboard/book.vue'),
    readProjectFile('app/pages/dashboard/bookings.vue'),
    readProjectFile('app/pages/checkout/booking-success.vue')
  ])

  assert.match(book, /Resume payment/)
  assert.match(book, /Payment needs attention/)
  assert.match(bookings, /resumePendingPayment/)
  assert.match(bookings, /correct card details or use another card/)
  assert.match(success, /Your booking is not confirmed until payment verification finishes/)
  assert.match(success, /status === 'confirmed'/)
  assert.match(success, /Your payment was received/)
  assert.match(success, /Reservation Expired/)
})
