import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPeerspaceReferenceMatches,
  parsePeerspaceEventDetails
} from '../server/utils/access/peerspace.ts'

test('parses a standard Peerspace calendar event', () => {
  const result = parsePeerspaceEventDetails({
    title: 'Peerspace Booking, Amairaly G.',
    description: [
      'Confirmation number: PS-ABC123',
      'Manage: https://www.peerspace.com/inbox/ps-abc123'
    ].join('\n')
  })

  assert.deepEqual(result, {
    isPeerspace: true,
    guestName: 'Amairaly G.',
    externalReference: 'PS-ABC123',
    manageUrl: 'https://www.peerspace.com/inbox/ps-abc123'
  })
})

test('uses an encoded inbox reference when confirmation copy is absent', () => {
  const result = parsePeerspaceEventDetails({
    title: 'Production reservation',
    description: 'Open Peerspace: https://www.peerspace.com/inbox%2Fabc-987'
  })

  assert.equal(result.isPeerspace, true)
  assert.equal(result.externalReference, 'ABC-987')
})

test('ignores unrelated Google Calendar events', () => {
  const result = parsePeerspaceEventDetails({
    title: 'Equipment maintenance',
    description: 'Quarterly inspection'
  })

  assert.deepEqual(result, {
    isPeerspace: false,
    guestName: null,
    externalReference: null,
    manageUrl: null
  })
})

test('matches a manual scheduled-access record by normalized Peerspace confirmation', () => {
  const manualLink = {
    id: 'manual-link',
    provider: 'manual' as const,
    external_reference: '6A7215205F2E616ED58B0B75'
  }
  const otherLink = {
    id: 'other-link',
    provider: 'peerspace' as const,
    external_reference: 'OTHER-CONFIRMATION'
  }

  assert.deepEqual(
    getPeerspaceReferenceMatches([manualLink, otherLink], ',6a7215205f2e616ed58b0b75'),
    [manualLink]
  )
})
