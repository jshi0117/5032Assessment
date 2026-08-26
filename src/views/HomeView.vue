<script setup>
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'

import { useEventStore } from '@/stores/eventStore'
import EventList from '@/components/events/EventList.vue'
import { formatDateLong, formatTimeRange } from '@/utils/format'

/**
 * Landing page.
 *
 * Every figure and card on this page is derived from the store, which reads
 * through eventService (BR B.2). Nothing is written into the template by hand —
 * changing the seed JSON changes what renders here.
 */
const store = useEventStore()
const { loading, error } = storeToRefs(store)

onMounted(() => store.load())

const nextEvent = computed(() => store.nextEvent)

const highlights = computed(() =>
  store.upcoming.filter((e) => e.status !== 'cancelled').slice(0, 4)
)

/** Headline numbers, counted from the data rather than typed in. */
const impact = computed(() => {
  const completed = store.events.filter((e) => e.status === 'completed')
  const attendances = completed.reduce((total, e) => total + e.registered, 0)

  return [
    {
      value: attendances.toLocaleString('en-AU'),
      label: 'Volunteer attendances at completed planting days'
    },
    { value: String(store.sites.length), label: 'Planting sites under restoration' },
    { value: String(completed.length), label: 'Planting days completed' },
    {
      value: String(new Set(store.sites.flatMap((s) => s.species)).size),
      label: 'Indigenous species propagated'
    }
  ]
})

/** The suburb with the least canopy — the reason the organisation exists. */
const lowestCanopy = computed(() =>
  store.sites.length
    ? store.sites.reduce((lowest, s) => (s.canopyCover < lowest.canopyCover ? s : lowest))
    : null
)
</script>

<template>
  <!-- Hero -->
  <section class="gr-hero rounded-4 p-4 p-lg-5 mb-4 mb-lg-5">
    <div class="row align-items-center g-4">
      <div class="col-12 col-lg-7">
        <p class="text-uppercase fw-semibold small mb-2 gr-hero__eyebrow">
          Melbourne's west &amp; north
        </p>
        <h1 class="display-6 fw-bold mb-3">Grow a cooler, greener neighbourhood</h1>
        <p class="lead mb-4">
          GreenRoots Melbourne plants indigenous trees with the communities that
          need shade the most.
          <template v-if="lowestCanopy">
            In {{ lowestCanopy.suburb }}, canopy cover sits at just
            {{ lowestCanopy.canopyCover }}%.
          </template>
        </p>
        <div class="d-flex flex-column flex-sm-row gap-2">
          <RouterLink :to="{ name: 'volunteer' }" class="btn btn-primary btn-lg">
            Join a planting day
          </RouterLink>
          <RouterLink :to="{ name: 'events' }" class="btn btn-outline-primary btn-lg">
            See upcoming events
          </RouterLink>
        </div>
      </div>

      <div class="col-12 col-lg-5">
        <div class="gr-hero__panel rounded-4 p-4">
          <p class="fw-semibold mb-1">Next planting day</p>

          <template v-if="nextEvent">
            <p class="h5 mb-1">
              {{ formatDateLong(nextEvent.date) }},
              {{ formatTimeRange(nextEvent.startTime, nextEvent.endTime) }}
            </p>
            <p class="text-body-secondary mb-3">
              {{ nextEvent.site?.name }}, {{ nextEvent.suburb }}
            </p>
            <RouterLink
              class="btn btn-sm btn-outline-primary"
              :to="{ name: 'event-detail', params: { id: nextEvent.id } }"
            >
              View details
            </RouterLink>
          </template>

          <p v-else-if="loading" class="text-body-secondary mb-0">Loading…</p>
          <p v-else class="text-body-secondary mb-0">
            No planting days are scheduled right now — check back soon.
          </p>
        </div>
      </div>
    </div>
  </section>

  <!-- Impact figures -->
  <section class="mb-4 mb-lg-5" aria-labelledby="impact-heading">
    <h2 id="impact-heading" class="h4 mb-3">Our impact so far</h2>
    <div class="row g-3">
      <div v-for="item in impact" :key="item.label" class="col-6 col-lg-3">
        <div class="card h-100 border-0 gr-stat">
          <div class="card-body">
            <p class="h3 mb-1 gr-stat__value">{{ item.value }}</p>
            <p class="small text-body-secondary mb-0">{{ item.label }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Upcoming -->
  <section aria-labelledby="upcoming-heading">
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <h2 id="upcoming-heading" class="h4 mb-0">Upcoming planting days</h2>
      <RouterLink :to="{ name: 'events' }" class="small">View all events</RouterLink>
    </div>

    <EventList
      :events="highlights"
      :loading="loading"
      :error="error"
      empty-message="No planting days are scheduled at the moment."
    />
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints' as bp;

.gr-hero {
  background: linear-gradient(150deg, var(--gr-green-100), #ffffff 70%);
  border: 1px solid rgba(46, 125, 50, 0.15);

  &__eyebrow { color: var(--gr-green-700); letter-spacing: 0.06em; }

  &__panel {
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.08);
  }

  @include bp.band-xs {
    .display-6 { font-size: 1.75rem; }
    .lead { font-size: 1rem; }
  }
}

.gr-stat {
  background: var(--gr-green-100);

  &__value { color: var(--gr-green-900); }
}
</style>
