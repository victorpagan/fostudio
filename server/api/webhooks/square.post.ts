/**
 * POST /api/webhooks/square
 *
 * NOTE: Square webhooks are handled by the dedicated `fohooks` webhook server,
 * not by the main fostudio app. This endpoint is intentionally disabled.
 *
 * Point your Square Developer webhook URL to:
 *   https://fohooks-05b5385af97e.herokuapp.com/swbhk
 *
 * fohooks handles:
 *   payment.completed          → confirm a pending_payment guest booking
 *   subscription.created       → upsert membership row
 *   subscription.updated       → upsert membership row
 *   invoice.payment_made       → schedule / release monthly credit grants
 */
export default defineEventHandler(() => {
  throw createError({ statusCode: 404, statusMessage: 'Not used — see fohooks' })
})
