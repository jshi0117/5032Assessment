<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue'
import {
  BarController, BarElement, CategoryScale, Chart, Legend, LinearScale, Tooltip
} from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

/**
 * One chart, as an accessible figure (BR F.1 — interactive charts).
 *
 * Chart.js draws on a <canvas>, which a screen reader cannot read and a
 * keyboard cannot explore. So every chart here comes with:
 *   - a heading and a one-line description (the figure's caption),
 *   - `summary`, a sentence saying what the chart shows, as the canvas label,
 *   - a "Show as table" switch revealing the same numbers as a real table —
 *     the tooltip enhances the chart, it is never the only way to a value.
 * Animation is off for anyone who has asked their system for less motion.
 *
 * `config` is a function returning a Chart.js config, so the parent can
 * rebuild it when its data changes (a filter) and this component swaps the
 * data in place rather than tearing the chart down.
 */
const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  summary: { type: String, required: true },
  config: { type: Function, required: true },
  /** `{ columns: string[], rows: (string|number)[][] }` */
  table: { type: Object, required: true },
  height: { type: Number, default: 260 }
})

const uid = useId()
const canvas = ref(null)
const chart = shallowRef(null)
const showTable = ref(false)

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function build() {
  const config = props.config()
  config.options = {
    ...config.options,
    animation: reducedMotion() ? false : config.options?.animation
  }
  return config
}

onMounted(() => {
  chart.value = new Chart(canvas.value, build())
})

// Same chart, new data: update in place so a filter change is a smooth
// transition rather than a blank flash.
watch(() => props.config, () => {
  const c = chart.value
  if (!c) return
  const next = build()
  c.data.labels = next.data.labels
  next.data.datasets.forEach((ds, i) => {
    if (c.data.datasets[i]) Object.assign(c.data.datasets[i], ds)
    else c.data.datasets.push(ds)
  })
  c.data.datasets.length = next.data.datasets.length
  c.options = next.options
  c.update()
})

onBeforeUnmount(() => chart.value?.destroy())
</script>

<template>
  <figure class="gr-chart card h-100 mb-0" :aria-labelledby="`${uid}-title`">
    <div class="card-body d-flex flex-column">
      <div class="d-flex align-items-start justify-content-between gap-2 mb-1">
        <div>
          <h3 :id="`${uid}-title`" class="h6 mb-1">{{ title }}</h3>
          <p v-if="description" class="small text-body-secondary mb-2">{{ description }}</p>
        </div>
        <button
          type="button"
          class="btn btn-sm btn-link text-nowrap p-0"
          :aria-expanded="showTable"
          :aria-controls="`${uid}-table`"
          @click="showTable = !showTable"
        >
          {{ showTable ? 'Show as chart' : 'Show as table' }}
        </button>
      </div>

      <!-- Nothing to plot: say so rather than leave bare axes. -->
      <p v-if="!table.rows.length" class="gr-chart__empty text-body-secondary small mb-2" role="status">
        No data to show for this selection yet.
      </p>

      <div v-show="!showTable && table.rows.length" class="gr-chart__plot" :style="{ height: `${height}px` }">
        <canvas ref="canvas" role="img" :aria-label="summary">{{ summary }}</canvas>
      </div>

      <!-- Scrolls on its own when long, so it takes focus: keyboard users can
           then scroll it with the arrow keys. -->
      <div
        v-show="showTable && table.rows.length"
        :id="`${uid}-table`"
        class="table-responsive gr-chart__table"
        tabindex="0"
        :aria-label="`${title}, as a table`"
      >
        <table class="table table-sm small mb-0">
          <caption class="visually-hidden">{{ title }}</caption>
          <thead>
            <tr>
              <th v-for="(column, i) in table.columns" :key="column" scope="col" :class="{ 'text-end': i > 0 }">
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in table.rows" :key="row[0]">
              <th scope="row" class="fw-normal">
                <slot name="row-label" :row="row">{{ row[0] }}</slot>
              </th>
              <td v-for="(cell, i) in row.slice(1)" :key="i" class="text-end gr-chart__num">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <slot name="footer" />
    </div>
  </figure>
</template>

<style scoped lang="scss">
.gr-chart__plot {
  position: relative; // Chart.js sizes the canvas to this box
  width: 100%;
}

.gr-chart__empty {
  border: 1px dashed var(--bs-border-color);
  border-radius: 0.375rem;
  padding: 2rem 1rem;
  text-align: center;
}

.gr-chart__table {
  max-height: 22rem;
  overflow-y: auto;
}

// Numbers in a column line up digit for digit.
.gr-chart__num {
  font-variant-numeric: tabular-nums;
}
</style>
