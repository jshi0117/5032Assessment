<script setup>
import { computed, onMounted } from 'vue'

import { useEventStore } from '@/stores/eventStore'
import { useAdminStore } from '@/stores/adminStore'
import BaseAlert from '@/components/base/BaseAlert.vue'
import { formatDateMedium, formatRating } from '@/utils/format'

/**
 * Administrator overview (BR C.2).
 *
 * The whole picture, which is what separates this role from a coordinator's:
 * every planting day rather than the ones they run, and every account rather
 * than none.
 */
const events = useEventStore()
const admin = useAdminStore()

onMounted(() => {
  events.load()
  admin.load()
})

const eventTotals = computed(() => {
  const all = events.events
  const rated = all.filter((event) => event.ratingCount > 0)
  return {
    total: all.length,
    upcoming: all.filter((event) => !event.isPast && event.status !== 'cancelled').length,
    drafts: all.filter((event) => event.status === 'draft').length,
    cancelled: all.filter((event) => event.status === 'cancelled').length,
    registered: all.reduce((sum, event) => sum + event.registered, 0),
    capacity: all.reduce((sum, event) => sum + event.capacity, 0),
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

const fillRate = computed(() =>
  eventTotals.value.capacity
    ? Math.round((eventTotals.value.registered / eventTotals.value.capacity) * 100)
    : 0
)

const needingAttention = computed(() =>
  events.events
    .filter((event) => event.status === 'draft' || (!event.isPast && event.spotsLeft > 20))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)
)

const ROLE_LABELS = {
  volunteer: 'Volunteers',
  coordinator: 'Coordinators',
  admin: 'Administrators'
}
</script>

<template>
  <div class="container gr-admin">
    <p class="text-body-secondary small mb-1">Administrator</p>
    <h1 class="h3 mb-4">Overview</h1>

    <BaseAlert v-if="events.error" variant="danger" title="Could not load planting days">
      {{ events.error }}
    </BaseAlert>

    <section class="mb-5" aria-labelledby="events-heading">
      <h2 id="events-heading" class="h6 text-body-secondary mb-3">Planting days</h2>
      <div class="row g-3">
        <div v-for="stat in [
          { label: 'Total', value: eventTotals.total },
          { label: 'Upcoming', value: eventTotals.upcoming },
          { label: 'Drafts', value: eventTotals.drafts },
          { label: 'Cancelled', value: eventTotals.cancelled },
          { label: 'Places filled', value: `${fillRate}%` },
          {
            label: 'Average rating',
            value: eventTotals.averageRating ? formatRating(eventTotals.averageRating) : '—'
          }
        ]" :key="stat.label" class="col-6 col-md-4 col-xl-2">
          <div class="card h-100">
            <div class="card-body py-3">
              <p class="h4 mb-0">{{ stat.value }}</p>
              <p class="small text-body-secondary mb-0">{{ stat.label }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="mb-5" aria-labelledby="accounts-heading">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h2 id="accounts-heading" class="h6 text-body-secondary mb-0">Accounts</h2>
        <RouterLink class="btn btn-sm btn-outline-primary" :to="{ name: 'admin-users' }">
          Manage accounts
        </RouterLink>
      </div>

      <BaseAlert v-if="admin.error" variant="danger" title="Could not load accounts">
        {{ admin.error }}
      </BaseAlert>

      <p v-else-if="admin.loading" role="status">Loading accounts…</p>

      <div v-else class="row g-3">
        <div v-for="role in ['volunteer', 'coordinator', 'admin']" :key="role" class="col-6 col-md-4">
          <div class="card h-100">
            <div class="card-body py-3">
              <p class="h4 mb-0">{{ admin.byRole[role] ?? 0 }}</p>
              <p class="small text-body-secondary mb-0">{{ ROLE_LABELS[role] }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section aria-labelledby="attention-heading">
      <h2 id="attention-heading" class="h6 text-body-secondary mb-3">Needs attention</h2>
      <p v-if="!needingAttention.length" class="text-body-secondary">
        Nothing to review — no drafts, and every upcoming planting day is filling up.
      </p>
      <ul v-else class="list-group">
        <li
          v-for="event in needingAttention"
          :key="event.id"
          class="list-group-item d-flex flex-wrap justify-content-between gap-2"
        >
          <span>
            <RouterLink :to="{ name: 'event-detail', params: { id: event.id } }">
              {{ event.title }}
            </RouterLink>
            <span class="d-block small text-body-secondary">
              {{ formatDateMedium(event.date) }}
            </span>
          </span>
          <span class="small text-body-secondary align-self-center">
            {{ event.status === 'draft'
              ? 'Still a draft — not visible to volunteers'
              : `${event.spotsLeft} places still open` }}
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.gr-admin {
  padding-block: 2rem 4rem;
}
</style>
