/**
 * Table export (BR E.4).
 *
 * Both formats take the same input — the column definitions a DataTable was
 * given and the rows it is currently showing, after search and sort — so what
 * lands in the file is exactly what the user filtered down to on screen, across
 * every page rather than only the ten rows visible.
 *
 * A column contributes `exportValue(row)` if it has one, otherwise `value(row)`,
 * otherwise `row[key]`. Columns marked `exportable: false` (action buttons,
 * form controls) are left out.
 */

/** The value a column holds for one row, as plain text. */
export function cellText(column, row) {
  const read = column.exportValue ?? column.value ?? ((r) => r[column.key])
  const value = read(row)
  return value === null || value === undefined ? '' : String(value)
}

export const exportableColumns = (columns) =>
  columns.filter((column) => column.exportable !== false)

/**
 * Spreadsheet formula injection guard.
 *
 * Excel and Sheets treat a cell beginning with = + - @ (or a tab / carriage
 * return before one) as a formula. Names and suburbs here are typed by account
 * holders, so a value such as `=HYPERLINK(...)` would otherwise run when an
 * administrator opens the export. Prefixing an apostrophe makes it inert text.
 * Plain negative numbers are left alone so numeric columns stay numeric.
 */
function neutraliseFormula(text) {
  if (/^-?\d+(\.\d+)?$/.test(text)) return text
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

/** RFC 4180 quoting: wrap in quotes when needed, double any quote inside. */
function csvField(text) {
  const safe = neutraliseFormula(text)
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(columns, rows) {
  const cols = exportableColumns(columns)
  const lines = [
    cols.map((column) => csvField(column.label)).join(','),
    ...rows.map((row) => cols.map((column) => csvField(cellText(column, row))).join(','))
  ]
  // CRLF is what the CSV spec and Excel expect.
  return lines.join('\r\n')
}

/** "volunteer-roster-2026-10-06" — safe on every file system. */
export function exportFilename(base, extension) {
  const slug = String(base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'export'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date())
  return `${slug}-${today}.${extension}`
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked on the next tick: revoking synchronously can cancel the download
  // in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadCsv({ title, columns, rows }) {
  // The byte-order mark tells Excel the file is UTF-8; without it names with
  // accents ("Zoë") open as mojibake.
  const blob = new Blob(['﻿', toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, exportFilename(title, 'csv'))
}

/**
 * PDF export.
 *
 * jsPDF is loaded on demand: it is several hundred kilobytes, and nobody who
 * never presses the button should have to download it.
 *
 * `summary` is a line describing the filters in force, printed under the title
 * so a printed copy says what subset of the data it is.
 */
export async function downloadPdf({ title, columns, rows, summary = '' }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ])

  const cols = exportableColumns(columns)
  const doc = new jsPDF({
    orientation: cols.length > 4 ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4'
  })

  const generated = new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Melbourne'
  }).format(new Date())

  doc.setProperties({ title, subject: title, creator: 'GreenRoots Melbourne' })
  doc.setFontSize(16)
  doc.text(title, 40, 48)
  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text(`GreenRoots Melbourne · generated ${generated} · ${rows.length} rows`, 40, 64)
  if (summary) doc.text(summary, 40, 78, { maxWidth: doc.internal.pageSize.getWidth() - 80 })

  autoTable(doc, {
    startY: summary ? 92 : 78,
    head: [cols.map((column) => column.label)],
    body: rows.map((row) => cols.map((column) => cellText(column, row))),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    // Brand green header; white on #2e7d32 is 5.1:1, above the AA minimum.
    headStyles: { fillColor: [46, 125, 50], textColor: 255 },
    alternateRowStyles: { fillColor: [244, 248, 244] },
    // Numbers line up on the right, as they do on screen.
    columnStyles: Object.fromEntries(
      cols.map((column, index) => [index, column.align === 'end' ? { halign: 'right' } : {}])
    ),
    didParseCell: (data) => {
      if (data.section === 'head' && cols[data.column.index]?.align === 'end') {
        data.cell.styles.halign = 'right'
      }
    },
    margin: { left: 40, right: 40, bottom: 40 }
  })

  // Footers are written once every page exists, so each can say "of N".
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(
      `Page ${page} of ${pages}`,
      doc.internal.pageSize.getWidth() - 40,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'right' }
    )
  }

  doc.save(exportFilename(title, 'pdf'))
}
