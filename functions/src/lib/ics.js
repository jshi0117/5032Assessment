/**
 * iCalendar (RFC 5545) invite for a planting day — the second email attachment.
 *
 * Opening it adds the day to Google Calendar, Outlook or Apple Calendar with
 * the meeting point and a reminder the evening before.
 */

/** Escapes TEXT values: backslash, semicolon, comma and newlines. */
const escapeText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')

/**
 * Folds a content line to 75 octets, as the spec requires; continuation lines
 * start with a space. Counted in bytes, not characters, so an em dash (three
 * bytes in UTF-8) is never split down the middle.
 */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const parts = []
  let start = 0
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Step back off a UTF-8 continuation byte (10xxxxxx).
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    parts.push(bytes.subarray(start, end).toString('utf8'))
    start = end
    limit = 74 // the leading space of a continuation line counts
  }
  return parts.join('\r\n ')
}

/** "2026-09-12" + "09:00" → "20260912T090000" (local time, no Z). */
const localStamp = (date, time) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`

const utcStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/**
 * Melbourne's daylight-saving rules, so calendars that do not know IANA zone
 * names still place 9am at 9am: AEDT (+11) from the first Sunday in October,
 * AEST (+10) from the first Sunday in April.
 */
const MELBOURNE_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Australia/Melbourne',
  'BEGIN:STANDARD',
  'DTSTART:19700405T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU',
  'TZOFFSETFROM:+1100',
  'TZOFFSETTO:+1000',
  'TZNAME:AEST',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19701004T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU',
  'TZOFFSETFROM:+1000',
  'TZOFFSETTO:+1100',
  'TZNAME:AEDT',
  'END:DAYLIGHT',
  'END:VTIMEZONE'
]

export function buildIcs(day, { url, now = new Date() } = {}) {
  const { site } = day
  const description = [
    day.description,
    '',
    `Meeting point: ${site.meetingPoint}`,
    day.toolsProvided ? 'Tools and gloves are provided.' : 'Please bring gloves and a trowel.',
    url ? `Details: ${url}` : ''
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .trim()

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GreenRoots Melbourne//Planting days//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...MELBOURNE_VTIMEZONE,
    'BEGIN:VEVENT',
    `UID:${day.id}@greenroots-melbourne`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=Australia/Melbourne:${localStamp(day.date, day.startTime)}`,
    `DTEND;TZID=Australia/Melbourne:${localStamp(day.date, day.endTime)}`,
    `SUMMARY:${escapeText(`Planting day: ${day.title}`)}`,
    `LOCATION:${escapeText(`${site.name}, ${site.suburb} VIC ${site.postcode}`)}`,
    `GEO:${site.lat};${site.lng}`,
    `DESCRIPTION:${escapeText(description)}`,
    url ? `URL:${url}` : null,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    // Reminder at 6pm the evening before is awkward in iCalendar; 15 hours
    // before a 9am start is the same thing for every planting day we run.
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`Tomorrow: ${day.title}`)}`,
    'TRIGGER:-PT15H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean)

  return lines.map(fold).join('\r\n') + '\r\n'
}
