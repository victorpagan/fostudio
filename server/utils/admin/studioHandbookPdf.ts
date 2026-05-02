import PDFDocument from 'pdfkit'
import { DateTime } from 'luxon'
import type { HandbookPayload, HandbookTier } from '~~/server/utils/admin/studioHandbook'

const PAGE_BOTTOM = 720

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function dateTime(value: string, timezone: string) {
  const parsed = DateTime.fromISO(value).setZone(timezone)
  return parsed.isValid ? parsed.toFormat('LLL d, yyyy h:mm a ZZZZ') : value
}

function titleCase(value: string) {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function ensureSpace(doc: PDFKit.PDFDocument, height = 80) {
  if (doc.y + height > PAGE_BOTTOM) doc.addPage()
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, internal = false) {
  ensureSpace(doc, 90)
  doc.moveDown(0.7)
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor('#111111')
    .text(title)

  if (internal) {
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#555555')
      .text('INTERNAL ONLY', { continued: false })
  }

  doc
    .moveTo(doc.page.margins.left, doc.y + 6)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y + 6)
    .lineWidth(0.8)
    .strokeColor('#D1D5DB')
    .stroke()
    .moveDown(1.1)
}

function smallLabel(doc: PDFKit.PDFDocument, value: string) {
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor('#6B7280')
    .text(value.toUpperCase(), { continued: false })
}

function paragraph(doc: PDFKit.PDFDocument, value: string) {
  ensureSpace(doc, 52)
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#1F2937')
    .text(value, { lineGap: 3 })
    .moveDown(0.35)
}

function bulletList(doc: PDFKit.PDFDocument, items: string[]) {
  for (const item of items) {
    ensureSpace(doc, 34)
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#1F2937')
      .text(`- ${item}`, { indent: 8, lineGap: 2 })
  }
  doc.moveDown(0.5)
}

function keyValues(doc: PDFKit.PDFDocument, rows: Array<[string, string | number]>) {
  for (const [label, value] of rows) {
    ensureSpace(doc, 30)
    const x = doc.page.margins.left
    const y = doc.y
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#374151')
      .text(label, x, y, { width: 170 })
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#111827')
      .text(String(value), x + 180, y, { width: 320, lineGap: 2 })
    doc.y = Math.max(doc.y, y + 18)
  }
  doc.moveDown(0.5)
}

function tableHeader(doc: PDFKit.PDFDocument, labels: string[], widths: number[]) {
  ensureSpace(doc, 42)
  const startX = doc.page.margins.left
  let x = startX
  const y = doc.y
  doc.rect(startX, y - 3, widths.reduce((sum, width) => sum + width, 0), 18).fill('#111111')
  labels.forEach((label, index) => {
    const width = widths[index] ?? 100
    doc
      .font('Helvetica-Bold')
      .fontSize(7.8)
      .fillColor('#FFFFFF')
      .text(label.toUpperCase(), x + 4, y + 2, { width: width - 8 })
    x += width
  })
  doc.y = y + 21
}

function tableRow(doc: PDFKit.PDFDocument, values: Array<string | number>, widths: number[]) {
  ensureSpace(doc, 52)
  const startX = doc.page.margins.left
  let x = startX
  const y = doc.y
  const heights = values.map((value, index) => {
    const width = widths[index] ?? 100
    return doc.heightOfString(String(value), { width: width - 8, lineGap: 1 })
  })
  const rowHeight = Math.max(22, ...heights) + 8

  doc
    .rect(startX, y - 2, widths.reduce((sum, width) => sum + width, 0), rowHeight)
    .fill('#F9FAFB')

  values.forEach((value, index) => {
    const width = widths[index] ?? 100
    doc
      .font(index === 0 ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8)
      .fillColor('#111827')
      .text(String(value), x + 4, y + 2, { width: width - 8, lineGap: 1 })
    x += width
  })
  doc.y = y + rowHeight + 2
}

function tierPriceSummary(tier: HandbookTier) {
  const visible = tier.variations.filter(variation => variation.active && variation.visible)
  if (!visible.length) return 'No active public Square variation'
  return visible
    .map((variation) => {
      const suffix = variation.discountLabel ? `, ${variation.discountLabel}` : ''
      return `${titleCase(variation.cadence)}: ${money(variation.priceCents)} (${variation.creditsPerMonth} cr/mo${suffix})`
    })
    .join('\n')
}

function writeHeader(doc: PDFKit.PDFDocument, payload: HandbookPayload) {
  doc
    .font('Helvetica-Bold')
    .fontSize(24)
    .fillColor('#111111')
    .text('FO Studio Ops Handbook')

  doc
    .moveDown(0.2)
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#4B5563')
    .text(`Generated ${dateTime(payload.generatedAt, payload.timezone)} - ${payload.timezone}`)
    .text('Internal ops/staff reference. Customer-safe answers are labeled separately from internal notes.')
    .moveDown(0.8)

  keyValues(doc, [
    ['Guest booking window', `${payload.policies.guest.bookingWindowDays} days`],
    ['Guest booking hours', payload.policies.guest.hoursLabel],
    ['Guest credit rate', `${money(payload.policies.guest.ratePerCreditCents)} per credit`],
    ['Peak window', `${payload.policies.peak.daysLabel}, ${payload.policies.peak.windowLabel}`],
    ['Door access buffer', `${payload.doorAccess.technical.leadMinutes} minutes before through ${payload.doorAccess.technical.trailMinutes} minutes after booking`]
  ])
}

function writeSources(doc: PDFKit.PDFDocument, payload: HandbookPayload) {
  sectionTitle(doc, 'Source Freshness', true)
  tableHeader(doc, ['Source', 'Status', 'Detail'], [130, 70, 300])
  for (const source of payload.sources) {
    tableRow(doc, [source.label, source.status.toUpperCase(), source.detail], [130, 70, 300])
  }
}

function writeRates(doc: PDFKit.PDFDocument, payload: HandbookPayload) {
  sectionTitle(doc, 'Membership Rates + Tiers')
  tableHeader(doc, ['Tier', 'Pricing', 'Credits + Benefits', 'Rules'], [95, 155, 120, 130])
  for (const tier of payload.rates.tiers) {
    tableRow(doc, [
      `${tier.displayName}\n${tier.active ? 'Active' : 'Inactive'} / ${tier.visible ? 'Visible' : 'Hidden'}`,
      tierPriceSummary(tier),
      `${tier.holdsIncluded} holds included\nBank cap: ${tier.maxBank ?? 'n/a'}\nTop-off expiry: ${tier.topoffCreditExpiryDays} days`,
      `${tier.bookingWindowDays} day window\nPeak ${tier.peakMultiplier}x\n${tier.directAccessOnly ? 'Direct access only' : 'Public plan'}`
    ], [95, 155, 120, 130])
  }

  sectionTitle(doc, 'Credit Top-Ups')
  tableHeader(doc, ['Option', 'Credits', 'Price', 'Status'], [190, 70, 110, 130])
  for (const option of payload.rates.creditOptions) {
    tableRow(doc, [
      `${option.label}${option.description ? `\n${option.description}` : ''}`,
      option.credits,
      option.salePriceCents ? `${money(option.salePriceCents)} sale\n${money(option.basePriceCents)} base` : money(option.basePriceCents),
      option.active ? 'Active' : 'Inactive'
    ], [190, 70, 110, 130])
  }
}

function writePolicies(doc: PDFKit.PDFDocument, payload: HandbookPayload) {
  sectionTitle(doc, 'Guest Booking Policies')
  keyValues(doc, [
    ['Account requirement', 'Guests must be authenticated users with customer rows. Anonymous visitors can view availability only.'],
    ['Booking window', `${payload.policies.guest.bookingWindowDays} days`],
    ['Booking hours', payload.policies.guest.hoursLabel],
    ['Normal minimum', `${payload.policies.guest.minBookingHours} hours`],
    ['Increment', `${payload.policies.guest.bookingIncrementMinutes} minutes`],
    ['Peak multiplier', `${payload.policies.guest.peakMultiplier}x`],
    ['Credit expiry', `${payload.policies.guest.creditExpiryDays} days`],
    ['Pending payment reservation', `${payload.policies.guest.pendingPaymentHoldMinutes} minutes`],
    ['Holds', 'Not available for guests']
  ])

  sectionTitle(doc, 'Standby + Workshop Policies')
  keyValues(doc, [
    ['Standby enabled', payload.policies.standby.enabled ? 'Yes' : 'No'],
    ['Standby open slot minimum', `${payload.policies.standby.minOpenSlotHours} hours`],
    ['Standby discount', `${payload.policies.standby.discountMultiplier}x after normal pricing`],
    ['Member standby window', payload.policies.standby.memberWindowLabel],
    ['Guest standby reach', `${payload.policies.standby.guestWindowHours} hours from first guest-allowed time`],
    ['Standby management', 'Users cannot cancel, reschedule, extend, hold, or chain standby bookings.'],
    ['Workshop access', 'Admin-enabled accounts only, separate booking mode.'],
    ['Workshop multiplier', `${payload.policies.credits.workshopCreditMultiplier}x`],
    ['Workshop liability', 'Required acknowledgement at booking create.']
  ])

  sectionTitle(doc, 'Credits + Checkout Flows')
  bulletList(doc, payload.customerFlows.map(flow => `${flow.title}: ${flow.customerSafe}`))
  smallLabel(doc, 'Internal flow notes')
  bulletList(doc, payload.customerFlows.map(flow => `${flow.title}: ${flow.internal}`))
}

function writeDoorAccess(doc: PDFKit.PDFDocument, payload: HandbookPayload) {
  sectionTitle(doc, 'Door Access Overview')
  bulletList(doc, payload.doorAccess.overview)

  sectionTitle(doc, 'Door Access Technical Appendix', true)
  keyValues(doc, [
    ['Member slot range', `${payload.doorAccess.technical.slotRanges.memberStart}-${payload.doorAccess.technical.slotRanges.memberEnd}`],
    ['Guest slot range', `${payload.doorAccess.technical.slotRanges.guestStart}-${payload.doorAccess.technical.slotRanges.guestEnd}`],
    ['Pending/running jobs', payload.doorAccess.technical.status.pendingJobs],
    ['Dead jobs', payload.doorAccess.technical.status.deadJobs],
    ['Open access incidents', payload.doorAccess.technical.status.openIncidents],
    ['Active permanent codes', payload.doorAccess.technical.status.activePermanentCodes],
    ['Active member slots', payload.doorAccess.technical.status.activeMemberSlots],
    ['Active guest slots', payload.doorAccess.technical.status.activeGuestSlots],
    ['Scheduled/active guest codes', payload.doorAccess.technical.status.scheduledOrActiveGuestCodes],
    ['Pending door code requests', payload.doorAccess.technical.status.pendingDoorCodeRequests]
  ])
  bulletList(doc, payload.doorAccess.technical.notes)
}

function writeEquipment(doc: PDFKit.PDFDocument, payload: HandbookPayload) {
  sectionTitle(doc, 'Equipment List')
  paragraph(doc, payload.equipment.heroBody)
  smallLabel(doc, payload.equipment.includedHeader)
  bulletList(doc, payload.equipment.includedGear)
  smallLabel(doc, payload.equipment.equipmentListHeader)
  bulletList(doc, payload.equipment.equipmentList)
  smallLabel(doc, payload.equipment.guidelinesHeader)
  bulletList(doc, payload.equipment.sessionGuidelines)
}

function writeCallAnswers(doc: PDFKit.PDFDocument, payload: HandbookPayload) {
  sectionTitle(doc, 'Employee Call Answer Bank', true)
  for (const answer of payload.callAnswers) {
    ensureSpace(doc, 95)
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#111111')
      .text(answer.question)
    smallLabel(doc, 'Customer-safe answer')
    paragraph(doc, answer.customerSafeAnswer)
    smallLabel(doc, 'Internal note / escalate if')
    paragraph(doc, answer.internalNote)
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#6B7280')
      .text(`Tags: ${answer.tags.join(', ')}`)
      .moveDown(0.7)
  }
}

export async function renderStudioHandbookPdf(payload: HandbookPayload) {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 54, right: 54, bottom: 54, left: 54 },
      info: {
        Title: 'FO Studio Ops Handbook',
        Author: 'FO Studio',
        Subject: 'Internal studio operations handbook'
      }
    })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    writeHeader(doc, payload)
    sectionTitle(doc, 'Quick Reference')
    smallLabel(doc, 'Customer-safe answers')
    bulletList(doc, payload.quickReference.customerSafe)
    smallLabel(doc, 'Internal notes')
    bulletList(doc, payload.quickReference.internalNotes)
    writeRates(doc, payload)
    writePolicies(doc, payload)
    writeDoorAccess(doc, payload)
    writeEquipment(doc, payload)
    writeCallAnswers(doc, payload)
    writeSources(doc, payload)

    doc.end()
  })
}
