/**
 * Shared look for every chart (BR F.1).
 *
 * Colours are from the validated data-viz palette, checked with its
 * validator rather than by eye:
 *   - one series            → SERIES (blue, 4.6:1 on white)
 *   - filled vs open places → FILLED / OPEN, two steps of one blue ramp: a part
 *     and its remainder, like a meter. Validated as an ordinal pair; the light
 *     step is 2.06:1, so these charts always offer the table view.
 * Text is never drawn in a series colour — labels and ticks use ink tokens.
 */
export const COLORS = {
  SERIES: '#2a78d6',
  FILLED: '#1c5cab',
  OPEN: '#86b6ef',
  SURFACE: '#ffffff',
  GRID: '#e9ecef',
  INK: '#212529',
  INK_MUTED: '#5c636a'
}

const FONT = {
  family: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  size: 12
}

/** Bars: capped thickness, 4px rounded data end, square at the baseline. */
export const BAR = {
  maxBarThickness: 24,
  borderRadius: 4,
  borderSkipped: 'start'
}

const axis = (extra = {}) => ({
  grid: { color: COLORS.GRID, lineWidth: 1, drawTicks: false },
  border: { display: false },
  ticks: { color: COLORS.INK_MUTED, font: FONT, padding: 6 },
  ...extra
})

/**
 * Base options. `valueAxis` is the axis carrying numbers ('x' for horizontal
 * bars, 'y' for columns); only it gets gridlines — the category axis stays
 * clean.
 */
export function baseOptions({ valueAxis = 'y', valueTicks = {}, legend = false, tooltip = {} } = {}) {
  const categoryAxis = valueAxis === 'y' ? 'x' : 'y'
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: valueAxis === 'y' ? 'x' : 'y',
    // The whole band is the hover target, not just the painted bar, so a thin
    // or short bar is as easy to point at as a long one.
    interaction: { mode: 'index', intersect: false, axis: categoryAxis },
    layout: { padding: { top: 4, right: 8 } },
    scales: {
      [valueAxis]: axis({ beginAtZero: true, ticks: { ...axis().ticks, ...valueTicks } }),
      [categoryAxis]: axis({ grid: { display: false } })
    },
    plugins: {
      legend: legend
        ? {
            position: 'top',
            align: 'start',
            labels: { color: COLORS.INK, font: FONT, boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 3 }
          }
        : { display: false },
      tooltip: {
        backgroundColor: COLORS.INK,
        titleFont: { ...FONT, weight: '600' },
        bodyFont: FONT,
        padding: 10,
        cornerRadius: 6,
        boxPadding: 4,
        ...tooltip
      }
    }
  }
}
