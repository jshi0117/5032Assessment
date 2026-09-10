<script setup>
import { computed, onMounted, ref } from 'vue'

import { useEventStore } from '@/stores/eventStore'
import { useAuthStore } from '@/stores/authStore'
import BaseAlert from '@/components/base/BaseAlert.vue'
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

const expanded = ref(null)

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

const sorted = computed(() =>
  [...visibleEvents.value].sort((a, b) => a.date.localeCompare(b.date))
)

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

const toggle = (id) => { expanded.value = expanded.value === id ? null : id }
</script>

<template>
  <div class="container gr-manage">
    <p class="text-body-secondary small mb-1">
      {{ auth.isAdmin ? 'All planting days' : 'The planting days you run' }}
    </p>
    <h1 class="h3 mb-4">Manage planting days</h1>

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

      <p v-else-if="!sorted.length" class="text-body-secondary">
        There are no planting days to show.
      </p>

      <!-- Wide table, narrow screens: the table scrolls inside its own box
           rather than making the whole page scroll sideways. -->
      <div v-else class="table-responsive">
        <table class="table align-middle">
          <caption class="visually-hidden">
            Planting days you can manage, with capacity, registrations and ratings
          </caption>
          <thead>
            <tr>
              <th scope="col">Planting day</th>
              <th scope="col">Date</th>
              <th scope="col">Status</th>
              <th scope="col" class="text-end">Registered</th>
              <th scope="col" class="text-end">Rating</th>
              <th scope="col"><span class="visually-hidden">Registrations</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="event in sorted" :key="event.id">
              <tr>
                <th scope="row" class="fw-normal">
                  <RouterLink :to="{ name: 'event-detail', params: { id: event.id } }">
                    {{ event.title }}
                  </RouterLink>
                  <span class="d-block small text-body-secondary">{{ event.suburb }}</span>
                </th>
                <td class="text-nowrap">
                  {{ formatDateMedium(event.date) }}
                  <span class="d-block small text-body-secondary">
                    {{ formatTimeRange(event.startTime, event.endTime) }}
                  </span>
                </td>
                <td>
                  <span class="badge" :class="statusVariant(event.displayStatus)">
                    {{ formatStatus(event.displayStatus) }}
                  </span>
                </td>
                <td class="text-end text-nowrap">
                  {{ event.registered }} / {{ event.capacity }}
                </td>
                <td class="text-end text-nowrap">
                  <template v-if="event.ratingCount">
                    {{ formatRating(event.averageRating) }}
                    <span class="small text-body-secondary">({{ event.ratingCount }})</span>
                  </template>
                  <span v-else class="text-body-secondary">—</span>
                </td>
                <td class="text-end">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    :aria-expanded="expanded === event.id"
                    :aria-controls="`registrations-${event.id}`"
                    @click="toggle(event.id)"
                  >
                    {{ expanded === event.id ? 'Hide' : 'Show' }} sign-ups
                  </button>
                </td>
              </tr>
              <tr v-show="expanded === event.id" :id="`registrations-${event.id}`">
                <td colspan="6" class="bg-body-tertiary">
                  <p v-if="!event.localRegistrations.length" class="small mb-0 text-body-secondary">
                    No sign-ups have been taken on this device yet. The
                    {{ event.registered }} shown above come from the existing
                    volunteer records.
                  </p>
                  <ul v-else class="list-unstyled small mb-0">
                    <li
                      v-for="registration in event.localRegistrations"
                      :key="registration.volunteerId"
                      class="d-flex justify-content-between border-bottom py-1"
                    >
                      <!-- Interpolated, never v-html: this string came from a
                           form and must render as text whatever it contains. -->
                      <span class="text-truncate">{{ registration.volunteerId }}</span>
                      <span class="text-nowrap ms-3">
                        {{ registration.places }}
                        {{ registration.places === 1 ? 'place' : 'places' }}
                      </span>
                    </li>
                  </ul>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gr-manage {
  padding-block: 2rem 4rem;
}
</style>
