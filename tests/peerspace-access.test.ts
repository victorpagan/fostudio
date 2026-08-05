import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePeerspaceEventDetails } from '../server/utils/access/peerspace.ts'

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
