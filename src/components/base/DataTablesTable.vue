<script setup>
import { computed, nextTick, ref, shallowRef, useId } from 'vue'
import DataTablesVue from 'datatables.net-vue3'
import DataTablesCore from 'datatables.net-bs5'
import 'datatables.net-columncontrol-bs5'
import 'datatables.net-bs5/css/dataTables.bootstrap5.min.css'
import 'datatables.net-columncontrol-bs5/css/columnControl.bootstrap5.min.css'

import { downloadCsv, downloadPdf } from '@/utils/exporters'
import { escapeHtml } from '@/utils/sanitize'

DataTablesVue.use(DataTablesCore)

/**
 * DataTables.net table (BR D.3) with export (BR E.4).
 *
 * DataTables provides the sorting, the search across all columns and the
 * pagination (ten rows a page). Its ColumnControl extension adds a second
 * header row with a search box per column — "contains", "starts with" and so
 * on for text, "greater than" and so on for numbers.
 *
 * DataTables builds the rows itself, so cells are given as HTML strings rather
 * than Vue templates (mixing the two would have both trying to own the same
 * DOM). Every value that came from data goes through `escapeHtml` first.
 *
 * Columns use the same shape as the rest of the app so the exporters can read
 * them:
 *   key, label        data property and heading.
 *   value(row)        what the column holds; used for search and export.
 *   sortValue(row)    sort by something else (an ISO date behind a formatted one).
 *   html(row)         cell markup; defaults to the escaped value.
 *   search            'text' (default), 'number' or false.
 *   sortable, exportable, align ('end'), className, hideLabel.
 */
const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  caption: { type: String, required: true },
  exportTitle: { type: String, default: null },
  /** DataTables order, e.g. [[0, 'asc']]. */
  order: { type: Array, default: () => [[0, 'asc']] }
})

const emit = defineEmits(['ready'])

const uid = useId()
const tableRef = ref(null)
const dt = shallowRef(null)
const exporting = ref(null)
const exportError = ref(null)
const matching = ref(props.rows.length)

const valueOf = (column, row) => (column.value ? column.value(row) : row[column.key])

const SEARCH_CONTENT = { text: 'searchText', number: 'searchNumber' }

/** Our column shape → DataTables' column shape. */
const dtColumns = computed(() =>
  props.columns.map((column) => {
    const search = column.search === undefined ? 'text' : column.search
    return {
      data: null,
      name: column.key,
      title: column.label,
      orderable: column.sortable !== false,
      searchable: search !== false,
      className: [column.className, column.align === 'end' ? 'text-end dt-type-numeric' : 'dt-type-string']
        .filter(Boolean)
        .join(' '),
      // Without this DataTables guesses from the data and right-aligns
      // anything that looks numeric, postcodes included.
      type: search === 'number' ? 'num' : 'string',
      render: (data, type, row) => {
        if (type === 'display') return column.html ? column.html(row) : escapeHtml(valueOf(column, row))
        if (type === 'sort' || type === 'type') {
          const sortable = column.sortValue ? column.sortValue(row) : valueOf(column, row)
          return sortable ?? ''
        }
        return valueOf(column, row) ?? ''
      },
      // Header row 0 keeps DataTables' own sort-on-click; row 1 is the search
      // box ColumnControl inserts under it.
      columnControl: search
        ? [{ target: 1, content: [{ extend: SEARCH_CONTENT[search], placeholder: 'Search', titleAttr: 'Search [title]' }] }]
        : [{ target: 1, content: [] }]
    }
  })
)

const dtOptions = {
  order: props.order,
  // Fired once the table, its rows and ColumnControl's search row all exist.
  initComplete(settings) {
    nextTick(() => onReady(new DataTablesCore.Api(settings)))
  },
  pageLength: 10,
  lengthMenu: [10, 25, 50],
  autoWidth: false,
  layout: {
    topStart: 'pageLength',
    topEnd: 'search',
    bottomStart: 'info',
    bottomEnd: 'paging'
  },
  language: {
    search: 'Search all columns:',
    lengthMenu: '_MENU_ rows per page',
    emptyTable: 'There is nothing to show.',
    zeroRecords: 'No rows match these filters.'
  }
}

/**
 * Accessibility fixes ColumnControl does not make itself.
 *
 * Its search inputs and their "contains / equals" selects carry no label, so a
 * screen reader announces them as "edit text" and "combo box" with no column.
 */
function labelControls(api) {
  api.columns().every(function () {
    const title = this.title()
    const cell = api.table().header().querySelectorAll('tr')[1]?.children[this.index()]
    if (!cell) return
    cell.querySelector('input')?.setAttribute('aria-label', `Search ${title}`)
    cell.querySelector('select')?.setAttribute('aria-label', `How to match ${title}`)
  })
}

function onReady(api) {
  dt.value = api
  labelControls(api)
  api.on('draw', () => {
    matching.value = api.rows({ search: 'applied' }).count()
  })
  emit('ready', api)
}

const title = computed(() => props.exportTitle ?? props.caption)

/** What is filtered, read back from the controls — printed on the PDF. */
function filterSummary(api) {
  const parts = []
  const global = api.search()
  if (global) parts.push(`Search "${global}"`)
  const filterRow = api.table().header().querySelectorAll('tr')[1]
  api.columns().every(function () {
    const cell = filterRow?.children[this.index()]
    const input = cell?.querySelector('input')
    const select = cell?.querySelector('select')
    if (input?.value) {
      const how = select?.selectedOptions[0]?.textContent?.toLowerCase() ?? 'contains'
      parts.push(`${this.title()} ${how} "${input.value}"`)
    }
  })
  return parts.length ? `Filtered by: ${parts.join('; ')}` : 'All rows'
}

/**
 * Exports every row that matches the current searches, in the current order —
 * all pages, not only the ten on screen.
 */
async function exportAs(format) {
  const api = dt.value
  if (!api) return
  exporting.value = format
  exportError.value = null
  try {
    const rows = api.rows({ search: 'applied', order: 'applied' }).data().toArray()
    const payload = { title: title.value, columns: props.columns, rows }
    if (format === 'csv') downloadCsv(payload)
    else await downloadPdf({ ...payload, summary: filterSummary(api) })
  } catch (err) {
    exportError.value = err?.message ?? 'The file could not be created.'
  } finally {
    exporting.value = null
  }
}

defineExpose({ dt })
</script>

<template>
  <div class="gr-dt">
    <div class="d-flex flex-wrap justify-content-end gap-2 mb-2">
      <slot name="toolbar" />
      <button
        type="button"
        class="btn btn-sm btn-primary"
        :disabled="!matching || exporting !== null"
        @click="exportAs('csv')"
      >
        Export CSV
      </button>
      <button
        type="button"
        class="btn btn-sm btn-outline-primary"
        :disabled="!matching || exporting !== null"
        :aria-busy="exporting === 'pdf' ? 'true' : undefined"
        @click="exportAs('pdf')"
      >
        <span v-if="exporting === 'pdf'" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
        {{ exporting === 'pdf' ? 'Creating PDF…' : 'Export PDF' }}
      </button>
    </div>

    <p v-if="exportError" class="alert alert-danger py-2 small" role="alert">
      Export failed: {{ exportError }}
    </p>

    <DataTablesVue
      :id="`dt-${uid}`"
      ref="tableRef"
      :columns="dtColumns"
      :data="rows"
      :options="dtOptions"
      class="table align-middle w-100"
    >
      <caption class="visually-hidden">{{ caption }}</caption>
      <!-- Header given up front: ColumnControl adds its search row beneath
           this one, and needs it to exist when it does. -->
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key" scope="col">{{ column.label }}</th>
        </tr>
      </thead>
    </DataTablesVue>
  </div>
</template>

<style scoped lang="scss">
.gr-dt {
  // DataTables puts the table inside its own scrolling wrapper on narrow
  // screens only with `scrollX`; this keeps the page itself from scrolling
  // sideways instead.
  :deep(.dt-layout-table) {
    overflow-x: auto;
  }

  :deep(.dt-paging .page-link) {
    --bs-pagination-active-bg: var(--gr-green-700);
    --bs-pagination-active-border-color: var(--gr-green-700);
    --bs-pagination-color: var(--gr-green-900);
  }

  :deep(.dt-paging .active > .page-link) {
    background-color: var(--gr-green-700);
    border-color: var(--gr-green-700);
    color: #fff;
  }

  :deep(thead tr:nth-child(2) td),
  :deep(thead tr:nth-child(2) th) {
    min-width: 6.5rem;
  }
}
</style>
