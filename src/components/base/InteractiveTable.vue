<script setup>
import { computed, reactive, ref, useId, watch } from 'vue'

import { cellText, downloadCsv, downloadPdf } from '@/utils/exporters'

/**
 * Interactive table for editable rows (BR D.3) with export (BR E.4).
 *
 * The read-only tables (volunteer roster, planting days) use DataTables — see
 * DataTablesTable.vue. This one is for tables whose cells are live Vue form
 * controls, such as the accounts screen where a role is changed in place.
 * DataTables builds its own rows outside Vue, so a <select> bound to the store
 * would need re-wiring on every redraw; here the rows stay Vue's, and the same
 * features are provided: search across every column, search within one column,
 * sort by any column, ten rows to a page, and accessible markup throughout
 * (aria-sort, labelled per-column inputs, an announced result count).
 *
 * A column is `{ key, label }` plus any of:
 *   value(row)       what the column holds — used to sort, search and export.
 *                    Defaults to row[key].
 *   sortValue(row)   sort by something other than the displayed value (an ISO
 *                    date behind a formatted one).
 *   filterValue(row) the text a search matches against, if not `value`.
 *   exportValue(row) the text written to CSV / PDF, if not `value`.
 *   filter           'text' (default), 'select', or false for no search box.
 *   sortable         defaults to true.
 *   exportable       defaults to true; false for action columns.
 *   rowHeader        render the cell as <th scope="row">.
 *   align            'end' for numbers.
 *
 * A cell's markup can be replaced with a `cell-<key>` slot, which receives
 * `{ row, value }`.
 */
const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  rowKey: { type: String, default: 'id' },
  /** Read by screen readers as the table's name, and used as the export title. */
  caption: { type: String, required: true },
  exportTitle: { type: String, default: null },
  exportable: { type: Boolean, default: true },
  pageSize: { type: Number, default: 10 },
  initialSort: { type: Object, default: null },
  emptyText: { type: String, default: 'No rows match these filters.' }
})

const uid = useId()

const PAGE_SIZES = [10, 25, 50]

const globalQuery = ref('')
const columnFilters = reactive(Object.fromEntries(props.columns.map((column) => [column.key, ''])))
const sortKey = ref(props.initialSort?.key ?? null)
const sortDir = ref(props.initialSort?.dir ?? 'asc')
const perPage = ref(props.pageSize)
const page = ref(1)
const exporting = ref(null)
const exportError = ref(null)

const filterType = (column) => (column.filter === undefined ? 'text' : column.filter)
const isSortable = (column) => column.sortable !== false

const valueOf = (column, row) => (column.value ? column.value(row) : row[column.key])
const searchText = (column, row) => {
  const value = column.filterValue ? column.filterValue(row) : valueOf(column, row)
  return value === null || value === undefined ? '' : String(value).toLowerCase()
}

const searchableColumns = computed(() => props.columns.filter((column) => filterType(column)))

/** Choices for a 'select' column: given explicitly, or every distinct value. */
const selectOptions = computed(() =>
  Object.fromEntries(
    props.columns
      .filter((column) => filterType(column) === 'select')
      .map((column) => [
        column.key,
        column.options ??
          [...new Set(props.rows.map((row) => valueOf(column, row)).filter((v) => v !== '' && v != null))]
            .map(String)
            .sort((a, b) => a.localeCompare(b))
      ])
  )
)

const filtered = computed(() => {
  const global = globalQuery.value.trim().toLowerCase()
  const active = props.columns.filter((column) => String(columnFilters[column.key] ?? '').trim())

  return props.rows.filter((row) => {
    for (const column of active) {
      const wanted = String(columnFilters[column.key]).trim().toLowerCase()
      const text = searchText(column, row)
      // A select filter is an exact choice; a text box is "contains".
      if (filterType(column) === 'select' ? text !== wanted : !text.includes(wanted)) return false
    }
    if (!global) return true
    return searchableColumns.value.some((column) => searchText(column, row).includes(global))
  })
})

const collator = new Intl.Collator('en-AU', { numeric: true, sensitivity: 'base' })

const sorted = computed(() => {
  const column = props.columns.find((c) => c.key === sortKey.value)
  if (!column) return filtered.value
  const read = column.sortValue ?? ((row) => valueOf(column, row))
  const direction = sortDir.value === 'asc' ? 1 : -1

  return [...filtered.value].sort((a, b) => {
    const x = read(a)
    const y = read(b)
    // Empty values go last whichever way the column is sorted — an unrated
    // planting day is not "lower" than a rated one, it is unknown.
    const xEmpty = x === null || x === undefined || x === ''
    const yEmpty = y === null || y === undefined || y === ''
    if (xEmpty || yEmpty) return xEmpty === yEmpty ? 0 : xEmpty ? 1 : -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * direction
    return collator.compare(String(x), String(y)) * direction
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(sorted.value.length / perPage.value)))
const visibleRows = computed(() =>
  sorted.value.slice((page.value - 1) * perPage.value, page.value * perPage.value)
)

const firstShown = computed(() => (sorted.value.length ? (page.value - 1) * perPage.value + 1 : 0))
const lastShown = computed(() => Math.min(page.value * perPage.value, sorted.value.length))

// Any change to what is being looked at starts again from page one; staying on
// page 4 of a result that now has two pages would show an empty table.
watch([globalQuery, columnFilters, perPage, sortKey, sortDir], () => { page.value = 1 })
watch(pageCount, (count) => { if (page.value > count) page.value = count })

const hasFilters = computed(
  () => Boolean(globalQuery.value.trim()) || Object.values(columnFilters).some((v) => String(v).trim())
)

function clearFilters() {
  globalQuery.value = ''
  for (const key of Object.keys(columnFilters)) columnFilters[key] = ''
}

function sortBy(column) {
  if (sortKey.value === column.key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = column.key
    sortDir.value = 'asc'
  }
}

const ariaSort = (column) =>
  sortKey.value === column.key ? (sortDir.value === 'asc' ? 'ascending' : 'descending') : 'none'

/**
 * Page numbers to offer: the first, the last, and the current one with a
 * neighbour either side, with gaps marked. Twenty numbered buttons in a row
 * would wrap on a phone and be a long way to tab through.
 */
const pageItems = computed(() => {
  const count = pageCount.value
  const current = page.value
  const wanted = new Set([1, count, current - 1, current, current + 1])
  const numbers = [...wanted].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b)
  const items = []
  numbers.forEach((n, i) => {
    if (i > 0 && n - numbers[i - 1] > 1) items.push({ gap: true, key: `gap-${n}` })
    items.push({ page: n, key: `page-${n}` })
  })
  return items
})

function goTo(target) {
  page.value = Math.min(Math.max(1, target), pageCount.value)
}

const sortedColumnLabel = computed(
  () => props.columns.find((column) => column.key === sortKey.value)?.label ?? null
)

/** Announced after every change, so a screen reader user hears the result. */
const statusText = computed(() => {
  const total = props.rows.length
  const count = sorted.value.length
  const range = count ? `Showing ${firstShown.value}–${lastShown.value} of ${count}` : 'No matching rows'
  const of = count !== total ? ` (filtered from ${total})` : ''
  const sortedBy = sortedColumnLabel.value
    ? `. Sorted by ${sortedColumnLabel.value}, ${sortDir.value === 'asc' ? 'ascending' : 'descending'}`
    : ''
  return `${range}${of}${sortedBy}.`
})

/** "Search: "creek"; Suburb contains "Sunshine"" — printed on the PDF. */
const filterSummary = computed(() => {
  const parts = []
  if (globalQuery.value.trim()) parts.push(`Search "${globalQuery.value.trim()}"`)
  for (const column of props.columns) {
    const value = String(columnFilters[column.key] ?? '').trim()
    if (!value) continue
    parts.push(filterType(column) === 'select' ? `${column.label} = ${value}` : `${column.label} contains "${value}"`)
  }
  return parts.length ? `Filtered by: ${parts.join('; ')}` : 'All rows'
})

const title = computed(() => props.exportTitle ?? props.caption)

async function exportAs(format) {
  exporting.value = format
  exportError.value = null
  try {
    const payload = { title: title.value, columns: props.columns, rows: sorted.value }
    if (format === 'csv') downloadCsv(payload)
    else await downloadPdf({ ...payload, summary: filterSummary.value })
  } catch (err) {
    exportError.value = err?.message ?? 'The file could not be created.'
  } finally {
    exporting.value = null
  }
}

const keyOf = (row) => row[props.rowKey]

defineExpose({ filteredRows: sorted })
</script>

<template>
  <div class="gr-table">
    <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
      <div class="gr-table__global">
        <label class="form-label small mb-1" :for="`${uid}-global`">Search all columns</label>
        <input
          :id="`${uid}-global`"
          v-model="globalQuery"
          class="form-control form-control-sm"
          type="search"
          autocomplete="off"
        />
      </div>

      <div>
        <label class="form-label small mb-1" :for="`${uid}-size`">Rows per page</label>
        <select :id="`${uid}-size`" v-model.number="perPage" class="form-select form-select-sm">
          <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
        </select>
      </div>

      <button
        v-if="hasFilters"
        type="button"
        class="btn btn-sm btn-link px-0"
        @click="clearFilters"
      >
        Clear all filters
      </button>

      <div v-if="exportable" class="ms-auto d-flex flex-wrap gap-2">
        <slot name="toolbar" />
        <button
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="!sorted.length || exporting !== null"
          @click="exportAs('csv')"
        >
          Export CSV
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          :disabled="!sorted.length || exporting !== null"
          :aria-busy="exporting === 'pdf' ? 'true' : undefined"
          @click="exportAs('pdf')"
        >
          <span v-if="exporting === 'pdf'" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
          {{ exporting === 'pdf' ? 'Creating PDF…' : 'Export PDF' }}
        </button>
      </div>
    </div>

    <p v-if="exportError" class="alert alert-danger py-2 small" role="alert">
      Export failed: {{ exportError }}
    </p>

    <div class="table-responsive">
      <table class="table align-middle mb-2">
        <caption class="visually-hidden">{{ caption }}</caption>
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              :class="{ 'text-end': column.align === 'end' }"
              :aria-sort="isSortable(column) ? ariaSort(column) : undefined"
            >
              <button
                v-if="isSortable(column)"
                type="button"
                class="gr-table__sort"
                :class="{ 'flex-row-reverse': column.align === 'end' }"
                @click="sortBy(column)"
              >
                <span>{{ column.label }}</span>
                <span class="gr-table__arrow" :class="{ 'is-active': sortKey === column.key }" aria-hidden="true">
                  {{ sortKey !== column.key ? '↕' : sortDir === 'asc' ? '▲' : '▼' }}
                </span>
              </button>
              <span v-else-if="column.hideLabel" class="visually-hidden">{{ column.label }}</span>
              <span v-else>{{ column.label }}</span>
            </th>
          </tr>
          <!-- Per-column search. Plain <td> cells: these are controls, not
               headers, and must not be read out as the name of each column. -->
          <tr class="gr-table__filters">
            <td v-for="column in columns" :key="column.key">
              <template v-if="filterType(column) === 'select'">
                <label class="visually-hidden" :for="`${uid}-f-${column.key}`">Filter by {{ column.label }}</label>
                <select
                  :id="`${uid}-f-${column.key}`"
                  v-model="columnFilters[column.key]"
                  class="form-select form-select-sm"
                >
                  <option value="">All</option>
                  <option v-for="option in selectOptions[column.key]" :key="option" :value="option.toLowerCase()">
                    {{ option }}
                  </option>
                </select>
              </template>
              <template v-else-if="filterType(column) === 'text'">
                <label class="visually-hidden" :for="`${uid}-f-${column.key}`">Search {{ column.label }}</label>
                <input
                  :id="`${uid}-f-${column.key}`"
                  v-model="columnFilters[column.key]"
                  class="form-control form-control-sm"
                  type="search"
                  autocomplete="off"
                  :placeholder="`Search ${column.label.toLowerCase()}`"
                />
              </template>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!visibleRows.length">
            <td :colspan="columns.length" class="text-center text-body-secondary py-4">{{ emptyText }}</td>
          </tr>
          <tr v-for="row in visibleRows" :key="keyOf(row)">
            <component
              :is="column.rowHeader ? 'th' : 'td'"
              v-for="column in columns"
              :key="column.key"
              :scope="column.rowHeader ? 'row' : undefined"
              :class="[column.cellClass, { 'fw-normal': column.rowHeader, 'text-end': column.align === 'end' }]"
            >
              <slot :name="`cell-${column.key}`" :row="row" :value="valueOf(column, row)">
                <!-- Interpolated, never v-html: much of this text was typed
                     by account holders. -->
                {{ cellText({ ...column, exportValue: null }, row) }}
              </slot>
            </component>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
      <p class="small text-body-secondary mb-0" role="status" aria-live="polite">{{ statusText }}</p>

      <nav v-if="pageCount > 1" :aria-label="`${caption}: pages`">
        <ul class="pagination pagination-sm mb-0">
          <li class="page-item" :class="{ disabled: page === 1 }">
            <button type="button" class="page-link" :disabled="page === 1" @click="goTo(page - 1)">
              <span aria-hidden="true">‹</span>
              <span class="visually-hidden">Previous page</span>
            </button>
          </li>
          <li
            v-for="item in pageItems"
            :key="item.key"
            class="page-item"
            :class="{ active: item.page === page, disabled: item.gap }"
          >
            <span v-if="item.gap" class="page-link" aria-hidden="true">…</span>
            <button
              v-else
              type="button"
              class="page-link"
              :aria-current="item.page === page ? 'page' : undefined"
              @click="goTo(item.page)"
            >
              <span class="visually-hidden">Page </span>{{ item.page }}
            </button>
          </li>
          <li class="page-item" :class="{ disabled: page === pageCount }">
            <button type="button" class="page-link" :disabled="page === pageCount" @click="goTo(page + 1)">
              <span aria-hidden="true">›</span>
              <span class="visually-hidden">Next page</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gr-table__global {
  flex: 1 1 16rem;
  max-width: 24rem;
}

.gr-table__sort {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-align: left;

  &:focus-visible {
    outline: 2px solid var(--gr-green-700);
    outline-offset: 2px;
    border-radius: 2px;
  }
}

.gr-table__arrow {
  font-size: 0.7em;
  color: var(--bs-secondary-color);

  &.is-active {
    color: var(--gr-green-700);
  }
}

// Keeps each search box usable on a narrow screen; the table scrolls inside
// .table-responsive instead of crushing the inputs to nothing.
.gr-table__filters td {
  min-width: 7.5rem;
  border-bottom-width: 2px;
}

.pagination {
  --bs-pagination-active-bg: var(--gr-green-700);
  --bs-pagination-active-border-color: var(--gr-green-700);
  --bs-pagination-color: var(--gr-green-900);
  --bs-pagination-hover-color: var(--gr-green-900);
  --bs-pagination-focus-color: var(--gr-green-900);
}
</style>
