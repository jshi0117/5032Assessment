<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useEventStore } from '@/stores/eventStore'
import { useVolunteerStore } from '@/stores/volunteerStore'
import ChartFigure from './ChartFigure.vue'
import { BAR, COLORS, baseOptions } from './chartTheme'

/**
 * Administrator insights (BR F.1 — interactive charts).
 *
 * Three questions an administrator actually has, one chart each:
 *   1. Which months still need volunteers?   → places filled vs open, by month
 *   2. Which sites do volunteers rate best?  → average rating by site
 *   3. Where does our volunteer time come from? → hours by suburb
 *
 * One period filter sits above the two planting-day charts it applies to.
 * Hovering shows exact figures; selecting a site's bar opens it on the map.
 * Every chart can be switched to a table of the same numbers.
 */
const events = useEventStore()
const volunteers = useVolunteerStore()
const router = useRouter()

onMounted(() => {
  events.load()
  volunteers.load()
})

const PERIODS = [
  { value: 'all', label: 'All' },
  { value: 'past', label: 'Past' },
  { value: 'upcoming', label: 'Upcoming' }
]
const period = ref('all')

/** Planting days that ran or will run: drafts and cancellations are left out. */
const inPeriod = computed(() =>
  events.events
    .filter((e) => !['draft', 'cancelled'].includes(e.status))
    .filter((e) => period.value === 'all' || (period.value === 'past' ? e.isPast : !e.isPast))
)

const nf = new Intl.NumberFormat('en-AU')
const MONTH = new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthLabel = (ym) => MONTH.format(new Date(`${ym}-01T00:00:00Z`))
// "Sept 26" on the axis, so fourteen months fit flat on a phone; the tooltip
// and the table still give the full "Sept 2026".
const MONTH_SHORT = new Intl.DateTimeFormat('en-AU', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const monthTick = (ym) => MONTH_SHORT.format(new Date(`${ym}-01T00:00:00Z`))
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)

/* ---------- 1. Places filled by month ---------- */

const byMonth = computed(() => {
  const months = new Map()
  for (const e of inPeriod.value) {
    const key = e.date.slice(0, 7)
    const m = months.get(key) ?? { key, days: 0, registered: 0, capacity: 0 }
    m.days += 1
    m.registered += Math.min(e.registered, e.capacity)
    m.capacity += e.capacity
    months.set(key, m)
  }
  return [...months.values()].sort((a, b) => a.key.localeCompare(b.key))
})

const monthsConfig = computed(() => {
  const rows = byMonth.value
  return () => ({
    type: 'bar',
    data: {
      labels: rows.map((m) => monthTick(m.key)),
      datasets: [
        {
          label: 'Registered',
          data: rows.map((m) => m.registered),
          backgroundColor: COLORS.FILLED,
          maxBarThickness: BAR.maxBarThickness,
          stack: 'places',
          // Rounded only when it is the top of the column — a fully booked
          // month has no open-places segment above it.
          borderRadius: (ctx) => {
            const m = rows[ctx.dataIndex]
            return m && m.capacity - m.registered === 0 ? { topLeft: 4, topRight: 4 } : 0
          },
          borderSkipped: false
        },
        {
          label: 'Open places',
          data: rows.map((m) => m.capacity - m.registered),
          backgroundColor: COLORS.OPEN,
          maxBarThickness: BAR.maxBarThickness,
          stack: 'places',
          // The 2px gap between the two segments is drawn in the surface
          // colour; the rounded end belongs to whichever segment is on top.
          borderColor: COLORS.SURFACE,
          borderWidth: { bottom: 2 },
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: false
        }
      ]
    },
    options: (() => {
      const o = baseOptions({
        valueAxis: 'y',
        legend: true,
        tooltip: {
          callbacks: {
            title: (items) => monthLabel(rows[items[0].dataIndex].key),
            footer: (items) => {
              const m = rows[items[0].dataIndex]
              return `${percent(m.registered, m.capacity)}% full · ${m.days} planting day${m.days === 1 ? '' : 's'}`
            }
          }
        }
      })
      o.scales.x.stacked = true
      o.scales.x.ticks = { ...o.scales.x.ticks, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 }
      o.scales.y.stacked = true
      o.scales.y.title = { display: true, text: 'Places', color: COLORS.INK_MUTED }
      return o
    })()
  })
})

const monthsTable = computed(() => ({
  columns: ['Month', 'Planting days', 'Registered', 'Open places', 'Full'],
  rows: byMonth.value.map((m) => [
    monthLabel(m.key), m.days, nf.format(m.registered), nf.format(m.capacity - m.registered),
    `${percent(m.registered, m.capacity)}%`
  ])
}))

const monthsSummary = computed(() => {
  const rows = byMonth.value
  if (!rows.length) return 'No planting days in this period.'
  const total = rows.reduce((s, m) => ({ r: s.r + m.registered, c: s.c + m.capacity }), { r: 0, c: 0 })
  const emptiest = [...rows].sort((a, b) => a.registered / a.capacity - b.registered / b.capacity)[0]
  return `Places filled by month: ${percent(total.r, total.c)}% full overall across ${rows.length} months; ` +
    `${monthLabel(emptiest.key)} is the least full at ${percent(emptiest.registered, emptiest.capacity)}%.`
})

/* ---------- 2. Average rating by site ---------- */

const bySite = computed(() => {
  const sites = new Map()
  for (const e of inPeriod.value) {
    if (!e.ratingCount || !e.site) continue
    const s = sites.get(e.siteId) ?? { id: e.siteId, name: e.site.name, sum: 0, count: 0 }
    s.sum += e.ratingSum
    s.count += e.ratingCount
    sites.set(e.siteId, s)
  }
  return [...sites.values()]
    .map((s) => ({ ...s, average: s.sum / s.count }))
    .sort((a, b) => b.average - a.average)
})

function openSite(siteId) {
  router.push({ name: 'map', query: { site: siteId } })
}

const ratingsConfig = computed(() => {
  const rows = bySite.value
  return () => ({
    type: 'bar',
    data: {
      labels: rows.map((s) => s.name),
      datasets: [{
        label: 'Average rating',
        data: rows.map((s) => Number(s.average.toFixed(2))),
        backgroundColor: COLORS.SERIES,
        ...BAR
      }]
    },
    options: {
      ...baseOptions({
        valueAxis: 'x',
        valueTicks: { stepSize: 1 },
        tooltip: {
          callbacks: {
            label: (item) => {
              const s = rows[item.dataIndex]
              return `${s.average.toFixed(1)} out of 5 from ${nf.format(s.count)} ratings`
            },
            footer: () => 'Select to open on the map'
          }
        }
      }),
      // A site is a place, so selecting its bar goes to it on the planting map.
      onClick: (_event, elements, chart) => {
        const hit = elements[0] ?? chart.getElementsAtEventForMode(_event, 'index', { intersect: false }, false)[0]
        if (hit) openSite(rows[hit.index].id)
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length ? 'pointer' : 'default'
      }
    }
  })
})

// The value axis is pinned to the full 1–5 scale so bars are comparable
// across filters rather than rescaled to whatever happens to be on screen.
const ratingsConfigFixed = computed(() => {
  const build = ratingsConfig.value
  return () => {
    const c = build()
    c.options.scales.x.min = 0
    c.options.scales.x.max = 5
    return c
  }
})

const ratingsTable = computed(() => ({
  columns: ['Site', 'Average rating', 'Ratings'],
  rows: bySite.value.map((s) => [s.name, s.average.toFixed(1), nf.format(s.count)])
}))

const ratingsSummary = computed(() => {
  const rows = bySite.value
  if (!rows.length) return 'No rated planting days in this period.'
  const best = rows[0]
  const worst = rows[rows.length - 1]
  return `Average rating by site: ${best.name} is highest at ${best.average.toFixed(1)} out of 5, ` +
    `${worst.name} lowest at ${worst.average.toFixed(1)}.`
})

/* ---------- 3. Volunteer hours by suburb ---------- */

const bySuburb = computed(() => {
  const suburbs = new Map()
  for (const v of volunteers.volunteers) {
    const s = suburbs.get(v.suburb) ?? { suburb: v.suburb, hours: 0, people: 0 }
    s.hours += v.hoursContributed
    s.people += 1
    suburbs.set(v.suburb, s)
  }
  return [...suburbs.values()].sort((a, b) => b.hours - a.hours)
})

// Eight bars read at a glance; the rest are in the table view.
const TOP = 8
const topSuburbs = computed(() => bySuburb.value.slice(0, TOP))

const hoursConfig = computed(() => {
  const rows = topSuburbs.value
  return () => ({
    type: 'bar',
    data: {
      labels: rows.map((s) => s.suburb),
      datasets: [{
        label: 'Hours contributed',
        data: rows.map((s) => s.hours),
        backgroundColor: COLORS.SERIES,
        ...BAR
      }]
    },
    options: baseOptions({
      valueAxis: 'x',
      tooltip: {
        callbacks: {
          label: (item) => {
            const s = rows[item.dataIndex]
            return `${nf.format(s.hours)} hours from ${s.people} volunteer${s.people === 1 ? '' : 's'}`
          }
        }
      }
    })
  })
})

const hoursTable = computed(() => ({
  columns: ['Suburb', 'Hours', 'Volunteers'],
  rows: bySuburb.value.map((s) => [s.suburb, nf.format(s.hours), s.people])
}))

const hoursSummary = computed(() => {
  const rows = bySuburb.value
  if (!rows.length) return 'No volunteer hours recorded.'
  const total = rows.reduce((sum, s) => sum + s.hours, 0)
  return `Volunteer hours by suburb: ${rows[0].suburb} leads with ${nf.format(rows[0].hours)} of ` +
    `${nf.format(total)} hours in total, across ${rows.length} suburbs.`
})

const ready = computed(() => events.loaded && volunteers.loaded)
</script>

<template>
  <section class="mb-5" aria-labelledby="insights-heading">
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
      <div>
        <h2 id="insights-heading" class="h6 text-body-secondary mb-1">Insights</h2>
        <p class="small text-body-secondary mb-0">Hover for exact figures, or show any chart as a table.</p>
      </div>

      <!-- One filter, above the charts it scopes. -->
      <div class="btn-group btn-group-sm" role="radiogroup" aria-label="Planting days to include">
        <template v-for="option in PERIODS" :key="option.value">
          <input
            :id="`period-${option.value}`"
            v-model="period"
            class="btn-check"
            type="radio"
            name="insight-period"
            :value="option.value"
          />
          <label class="btn btn-outline-primary" :for="`period-${option.value}`">{{ option.label }}</label>
        </template>
      </div>
    </div>

    <p v-if="!ready" class="text-body-secondary" role="status">Loading insights…</p>

    <div v-else class="row g-3">
      <div class="col-lg-7">
        <ChartFigure
          title="Places filled by month"
          description="Registered volunteers against open places, for planting days that ran or will run."
          :summary="monthsSummary"
          :config="monthsConfig"
          :table="monthsTable"
        />
      </div>
      <div class="col-lg-5">
        <ChartFigure
          title="Average rating by site"
          description="Out of 5, from volunteers who attended."
          :summary="ratingsSummary"
          :config="ratingsConfigFixed"
          :table="ratingsTable"
        >
          <template #row-label="{ row }">
            <RouterLink :to="{ name: 'map', query: { site: bySite.find((s) => s.name === row[0])?.id } }">
              {{ row[0] }}
            </RouterLink>
          </template>
          <template #footer>
            <p class="small text-body-secondary mt-2 mb-0">Select a bar to open that site on the planting map.</p>
          </template>
        </ChartFigure>
      </div>
      <div class="col-12">
        <ChartFigure
          title="Volunteer hours by suburb"
          :description="`Top ${TOP} of ${bySuburb.length} suburbs by hours contributed; the table lists them all. Not affected by the period filter.`"
          :summary="hoursSummary"
          :config="hoursConfig"
          :table="hoursTable"
          :height="300"
        />
      </div>
    </div>
  </section>
</template>
