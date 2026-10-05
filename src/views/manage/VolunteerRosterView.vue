<script setup>
import { onMounted } from 'vue'

import { useVolunteerStore } from '@/stores/volunteerStore'
import BaseAlert from '@/components/base/BaseAlert.vue'
import DataTablesTable from '@/components/base/DataTablesTable.vue'
import { escapeHtml } from '@/utils/sanitize'
import { formatDateShort } from '@/utils/format'

/**
 * Volunteer roster (BR D.3, BR E.4).
 *
 * The screen the design calls "Volunteer Roster": every volunteer on record,
 * searchable as a whole or column by column, sortable, ten to a page, and
 * exportable as it stands — so a coordinator can filter to one suburb and hand
 * that list to a site lead as a spreadsheet or a printout.
 */
const store = useVolunteerStore()

onMounted(() => store.load())

const capitalise = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '')

/**
 * DataTables renders these cells from HTML strings, so every value from the
 * data is escaped before it is placed in markup.
 */
const columns = [
  {
    key: 'name',
    label: 'Name',
    html: (row) =>
      `${escapeHtml(row.name)}<span class="d-block small text-body-secondary">${escapeHtml(row.id)}</span>`
  },
  {
    key: 'email',
    label: 'Email',
    html: (row) =>
      `<a class="text-nowrap" href="mailto:${encodeURIComponent(row.email).replace(/%40/g, '@')}">${escapeHtml(row.email)}</a>`
  },
  { key: 'suburb', label: 'Suburb' },
  { key: 'role', label: 'Role', value: (row) => capitalise(row.role) },
  {
    key: 'joinedDate',
    label: 'Joined',
    value: (row) => formatDateShort(row.joinedDate),
    // Sorted on the ISO date: "01 Aug 2024" sorts alphabetically before
    // "15 Apr 2023" otherwise.
    sortValue: (row) => row.joinedDate
  },
  { key: 'eventsAttended', label: 'Events', align: 'end', search: 'number' },
  { key: 'hoursContributed', label: 'Hours', align: 'end', search: 'number' },
  {
    key: 'status',
    label: 'Status',
    value: (row) => capitalise(row.status),
    html: (row) =>
      `<span class="badge ${row.status === 'active' ? 'text-bg-success' : 'text-bg-light'}">${escapeHtml(capitalise(row.status))}</span>`
  }
]
</script>

<template>
  <div class="container gr-roster">
    <p class="text-body-secondary small mb-1">Coordinator</p>
    <h1 class="h3 mb-1">Volunteer roster</h1>
    <p class="text-body-secondary mb-4">
      Everyone on the volunteer register. Search one column with the box under
      its heading, sort by selecting a heading, and export what you have
      filtered as CSV or PDF.
    </p>

    <BaseAlert v-if="store.error" variant="danger" title="Could not load the roster">
      {{ store.error }}
    </BaseAlert>

    <p v-else-if="store.loading" role="status">Loading volunteers…</p>

    <DataTablesTable
      v-else
      :columns="columns"
      :rows="store.volunteers"
      caption="Volunteer roster"
      :order="[[0, 'asc']]"
    />
  </div>
</template>

<style scoped>
.gr-roster {
  padding-block: 2rem 4rem;
}
</style>
