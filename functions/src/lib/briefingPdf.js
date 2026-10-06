import PDFDocument from 'pdfkit'

import { formatDateLong, formatTimeRange } from './format.js'

/**
 * The planting-day briefing, as a one-page A4 PDF — the first email
 * attachment. Generated on the server from the seed data, so its content is
 * never taken from the request.
 */
const GREEN = '#2e7d32'
const INK = '#212529'
const MUTED = '#5c636a'

export function buildBriefingPdf(day, { url } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 56,
      info: {
        Title: `Planting day briefing — ${day.title}`,
        Author: 'GreenRoots Melbourne',
        Subject: 'Planting day briefing'
      },
      // Tagged PDF with a document language, so screen readers read the
      // headings and paragraphs in order (BR E.3 applies to files too).
      tagged: true,
      lang: 'en-AU',
      displayTitle: true
    })

    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const { site } = day
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right

    const heading = (text) => {
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor(GREEN).text(text)
      doc.moveDown(0.25).font('Helvetica').fontSize(10.5).fillColor(INK)
    }
    const row = (label, value) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value)
    }

    // Header band
    doc.rect(0, 0, doc.page.width, 8).fill(GREEN)
    doc.moveDown(0.5).font('Helvetica').fontSize(10).fillColor(MUTED).text('GreenRoots Melbourne · Planting day briefing')
    doc.moveDown(0.3).font('Helvetica-Bold').fontSize(20).fillColor(INK).text(day.title, { width })
    doc.moveDown(0.3).font('Helvetica').fontSize(12).fillColor(INK)
      .text(`${formatDateLong(day.date)}, ${formatTimeRange(day.startTime, day.endTime)}`)

    heading('Where to meet')
    row('Site', `${site.name}, ${site.suburb} VIC ${site.postcode}`)
    row('Meeting point', site.meetingPoint)
    row('Coordinates', `${site.lat}, ${site.lng}`)
    row('Council', site.council)

    heading('The day')
    doc.text(day.description, { width })
    doc.moveDown(0.4)
    row('Activity', day.activityLabel)
    row('Species being planted', site.species.join(', '))
    row('Family friendly', day.familyFriendly ? 'Yes — children welcome with an adult' : 'Adults only')
    row('Wheelchair access', site.wheelchairAccessible ? 'Accessible path to the meeting point' : 'Uneven ground; contact us first')

    heading('What to bring')
    const bring = [
      'Sturdy closed shoes and long trousers',
      'Water bottle, hat and sunscreen',
      'A rain jacket — planting goes ahead in light rain',
      day.toolsProvided ? 'Nothing else: tools and gloves are provided' : 'Gloves and a hand trowel if you have them'
    ]
    doc.list(bring, { bulletRadius: 2, textIndent: 12, bulletIndent: 4 })

    heading('Getting there')
    doc.text(
      'Use the planting map on our site for walking, cycling and driving directions to the meeting point, ' +
        'including the time to leave to arrive before the start.',
      { width }
    )
    if (url) {
      doc.moveDown(0.3).fillColor(GREEN).text(url, { link: url, underline: true })
    }

    doc.moveDown(1.2).fontSize(9).fillColor(MUTED)
      .text('A calendar invitation (.ics) is attached to the same email. See you on the day!', { width })

    doc.end()
  })
}
