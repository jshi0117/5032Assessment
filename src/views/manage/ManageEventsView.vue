<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import BaseAlert from '@/components/base/BaseAlert.vue'
import DataTablesTable from '@/components/base/DataTablesTable.vue'
import { escapeHtml } from '@/utils/sanitize'
import {
  formatDateMedium, formatTimeRange, formatStatus, statusVariant, formatRating
} from '@/utils/format'

/**
 * Coordinator workspace (BR C.2).
 *
 * The page is open to coordinators and administrators, but they do not see the
 * same thing: a coordinator sees the planting days they run, an administrator
 * sees all of them. That difference is the point — two roles with the same
 * route but different authority is a clearer demonstration of authorisation
 * levels than a page that is simply on or off.
 *
 * It also shows draft planting days, which the public list withholds. Deciding
 * what to do with a draft is exactly the job this page exists for.
 */
const store = useEventStore()
const auth = useAuthStore()

const router = useRouter()

onMounted(() => store.load())

/**
 * An administrator's view is everything. A coordinator's is the planting days
 * whose `coordinatorId` matches the volunteer record their account is linked
 * to — and if nobody has linked it yet, nothing, which the empty state explains
 * rather than leaving as a blank table.
 */
const visibleEvents = computed(() => {
  if (auth.isAdmin) return store.events
  if (!auth.volunteerId) return []
  return store.events.filter((event) => event.coordinatorId === auth.volunteerId)
})

const unlinked = computed(() => !auth.isAdmin && !auth.volunteerId)

/**
 * Table columns (BR D.3), rendered by DataTables. The date column displays a
 * formatted date but sorts on the ISO one. Cells are HTML strings, so every
 * value from the data is escaped before it goes in.
 */
const columns = [
  {
    key: 'title',
    label: 'Planting day',
    html: (event) =>
      `<a href="${escapeHtml(router.resolve({ name: 'event-detail', params: { id: event.id } }).href)}" data-route>${escapeHtml(event.title)}</a>`
  },
  { key: 'suburb', label: 'Suburb' },
  {
    key: 'date',
    label: 'Date',
    value: (event) => formatDateMedium(event.date),
    sortValue: (event) => `${event.date}T${event.startTime}`,
    html: (event) =>
      `<span class="text-nowrap">${escapeHtml(formatDateMedium(event.date))}</span>` +
      `<span class="d-block small text-body-secondary text-nowrap">${escapeHtml(formatTimeRange(event.startTime, event.endTime))}</span>`,
    exportValue: (event) =>
      `${formatDateMedium(event.date)} ${formatTimeRange(event.startTime, event.endTime)}`
  },
  {
    key: 'status',
    label: 'Status',
    value: (event) => formatStatus(event.displayStatus),
    html: (event) =>
      `<span class="badge ${statusVariant(event.displayStatus)}">${escapeHtml(formatStatus(event.displayStatus))}</span>`
  },
  { key: 'registered', label: 'Registered', align: 'end', search: 'number' },
  { key: 'capacity', label: 'Capacity', align: 'end', search: 'number' },
  {
    key: 'rating',
    label: 'Rating',
    align: 'end',
    search: 'number',
    value: (event) => (event.ratingCount ? event.averageRating : null),
    html: (event) =>
      event.ratingCount
        ? `<span class="text-nowrap">${escapeHtml(formatRating(event.averageRating))} <span class="small text-body-secondary">(${event.ratingCount})</span></span>`
        : '<span class="text-body-secondary">—</span>',
    exportValue: (event) =>
      event.ratingCount ? `${formatRating(event.averageRating)} (${event.ratingCount})` : ''
  },
  {
    key: 'actions',
    label: 'Sign-ups',
    sortable: false,
    search: false,
    exportable: false,
    html: (event) =>
      `<button type="button" class="btn btn-sm btn-outline-secondary text-nowrap js-signups" ` +
      `aria-expanded="false" aria-controls="registrations-${escapeHtml(event.id)}">Show sign-ups</button>`
  }
]

/**
 * The sign-ups under a planting day, built as DOM nodes with `textContent` —
 * the volunteer keys came from a form and must never be parsed as markup.
 */
function signUpsFor(event) {
  const box = document.createElement('div')
  box.id = `registrations-${event.id}`
  box.className = 'small'

  if (!event.localRegistrations.length) {
    const note = document.createElement('p')
    note.className = 'mb-0 text-body-secondary'
    note.textContent =
      `No sign-ups have been taken on this device yet. The ${event.registered} shown ` +
      'above come from the existing volunteer records.'
    box.append(note)
    return box
  }

  const list = document.createElement('ul')
  list.className = 'list-unstyled mb-0'
  for (const registration of event.localRegistrations) {
    const item = document.createElement('li')
    item.className = 'd-flex justify-content-between border-bottom py-1'
    const who = document.createElement('span')
    who.className = 'text-truncate'
    who.textContent = registration.volunteerId
    const places = document.createElement('span')
    places.className = 'text-nowrap ms-3'
    places.textContent = `${registration.places} ${registration.places === 1 ? 'place' : 'places'}`
    item.append(who, places)
    list.append(item)
  }
  box.append(list)
  return box
}

/**
 * Wires up the two kinds of interactive cell once DataTables has built the
 * table. Listeners sit on the table body, so they keep working for rows drawn
 * later by paging, sorting or searching.
 *
 *  - "Show sign-ups" opens a DataTables child row under its planting day.
 *  - Title links go through the router, so following one does not reload the
 *    whole application.
 */
function onTableReady(dt) {
  const body = dt.table().body()

  body.addEventListener('click', (e) => {
    const toggle = e.target.closest('button.js-signups')
    if (toggle) {
      const row = dt.row(toggle.closest('tr'))
      if (row.child.isShown()) {
        row.child.hide()
        toggle.setAttribute('aria-expanded', 'false')
        toggle.textContent = 'Show sign-ups'
      } else {
        row.child(signUpsFor(row.data()), 'bg-body-tertiary').show()
        toggle.setAttribute('aria-expanded', 'true')
        toggle.textContent = 'Hide sign-ups'
      }
      return
    }

    const link = e.target.closest('a[data-route]')
    if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      e.preventDefault()
      router.push(link.getAttribute('href'))
    }
  })
}

const totals = computed(() => {
  const events = visibleEvents.value
  const rated = events.filter((event) => event.ratingCount > 0)
  return {
    events: events.length,
    drafts: events.filter((event) => event.status === 'draft').length,
    upcoming: events.filter((event) => !event.isPast && event.status !== 'cancelled').length,
    registered: events.reduce((sum, event) => sum + event.registered, 0),
    // Weighted by how many people rated each day, so a day with one 5 does not
    // count as much as a day with twenty 4s.
    averageRating: rated.length
      ? Number(
          (
            rated.reduce((sum, event) => sum + event.ratingSum, 0) /
            rated.reduce((sum, event) => sum + event.ratingCount, 0)
          ).toFixed(1)
        )
      : null
  }
})
</script>

<template>
  <div class="container gr-manage">
    <p class="text-body-secondary small mb-1">
      {{ auth.isAdmin ? 'All planting days' : 'The planting days you run' }}
    </p>
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
      <h1 class="h3 mb-0">Manage planting days</h1>
      <RouterLink class="btn btn-sm btn-outline-primary" :to="{ name: 'roster' }">
        Volunteer roster
      </RouterLink>
    </div>

    <BaseAlert v-if="store.error" variant="danger" title="Could not load planting days">
      {{ store.error }}
    </BaseAlert>

    <BaseAlert v-else-if="unlinked" variant="info" title="Your account is not linked yet">
      Your account has coordinator access, but it has not been linked to a
      volunteer record, so we cannot tell which planting days are yours. An
      administrator can link it from the accounts screen.
    </BaseAlert>

    <template v-else>
      <div class="row g-3 mb-4">
        <div v-for="stat in [
          { label: 'Planting days', value: totals.events },
          { label: 'Upcoming', value: totals.upcoming },
          { label: 'Drafts', value: totals.drafts },
          { label: 'Volunteers registered', value: totals.registered },
          { label: 'Average rating', value: totals.averageRating ? formatRating(totals.averageRating) : '—' }
        ]" :key="stat.label" class="col-6 col-lg">
          <div class="card h-100">
            <div class="card-body py-3">
              <p class="h4 mb-0">{{ stat.value }}</p>
              <p class="small text-body-secondary mb-0">{{ stat.label }}</p>
            </div>
          </div>
        </div>
      </div>

      <p v-if="store.loading" role="status">Loading planting days…</p>

      <p v-else-if="!visibleEvents.length" class="text-body-secondary">
        There are no planting days to show.
      </p>

      <DataTablesTable
        v-else
        :columns="columns"
        :rows="visibleEvents"
        caption="Planting days you can manage, with capacity, registrations and ratings"
        :export-title="auth.isAdmin ? 'All planting days' : 'My planting days'"
        :order="[[2, 'asc']]"
        @ready="onTableReady"
      />
    </template>
  </div>
</template>

<style scoped>
.gr-manage {
  padding-block: 2rem 4rem;
}
</style>
