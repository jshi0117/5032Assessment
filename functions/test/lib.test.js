import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildBriefingPdf } from '../src/lib/briefingPdf.js'
import { getPlantingDay } from '../src/lib/events.js'
import { buildIcs } from '../src/lib/ics.js'
import {
  requireAttachments, requireEventId, requireRecipients, requireString, safeFilename
} from '../src/lib/validate.js'

const day = getPlantingDay('evt-010')

test('getPlantingDay attaches the site and hides drafts', () => {
  assert.equal(day.site.id, day.siteId)
  assert.match(day.title, /—/)
  assert.equal(getPlantingDay('evt-999'), null)
})

test('ICS: CRLF lines, Melbourne zone, every line ≤ 75 octets, text escaped', () => {
  const ics = buildIcs(
    { ...day, description: 'Bring gloves; trowels, too.\nSee you there' },
    { url: 'https://example.com/events/evt-010', now: new Date('2026-10-06T00:00:00Z') }
  )
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'))
  assert.ok(!/[^\r]\n/.test(ics), 'bare LF found')
  assert.match(ics, /DTSTART;TZID=Australia\/Melbourne:\d{8}T\d{6}\r\n/)
  assert.match(ics, /DTSTAMP:20261006T000000Z/)
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `too long: ${line}`)
  const unfolded = ics.replace(/\r\n /g, '')
  assert.ok(unfolded.includes('Bring gloves\\; trowels\\, too.\\nSee you there'))
})

test('briefing PDF renders', async () => {
  const pdf = await buildBriefingPdf(day, { url: 'https://example.com/events/evt-010' })
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
  assert.ok(pdf.length > 2000)
})

test('validation refuses what it should', () => {
  assert.equal(requireEventId('evt-010'), 'evt-010')
  assert.throws(() => requireEventId('../etc'), /not recognised/)
  assert.throws(() => requireString('Hi\r\nBcc: x@y.z', 'Subject', { singleLine: true }), /single line/)
  assert.deepEqual(requireRecipients([' A@Example.com', 'a@example.com']), ['a@example.com'])
  assert.throws(() => requireRecipients(['nope']), /do not look right/)
  assert.throws(() => requireRecipients(Array.from({ length: 11 }, (_, i) => `p${i}@x.org`)), /10 people/)
  assert.equal(safeFilename('../../Site plan (v2).pdf'), 'Site-plan-v2.pdf')
})

test('attachments: type, extension and magic number must agree', () => {
  const pdf = Buffer.from('%PDF-1.4 test').toString('base64')
  assert.equal(requireAttachments([{ filename: 'a.pdf', type: 'application/pdf', content: pdf }])[0].filename, 'a.pdf')
  const fake = Buffer.from('<script>alert(1)</script>').toString('base64')
  assert.throws(() => requireAttachments([{ filename: 'x.pdf', type: 'application/pdf', content: fake }]), /not really/)
  assert.throws(() => requireAttachments([{ filename: 'x.exe', type: 'application/pdf', content: pdf }]), /only PDF/)
  const big = Buffer.alloc(5 * 1024 * 1024, 65).toString('base64')
  assert.throws(() => requireAttachments([{ filename: 'b.txt', type: 'text/plain', content: big }]), /4 MB/)
})
