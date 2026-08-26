<script setup>
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'

import { useEventStore } from '@/stores/eventStore'
import EventList from '@/components/events/EventList.vue'
import { formatActivity } from '@/utils/format'

/**
 * Browse and filter planting days.
 *
 * Nothing here is hard-coded: the list, the suburb options and the activity
 * options are all derived from the store, which reads through eventService
 * (BR B.2). Filtering happens in a computed, so changing any control
 * recalculates the list without an explicit refresh.
 */
const store = useEventStore()
const { filters, loading, error } = storeToRefs(store)

onMounted(() => store.load())

const results = computed(() => store.filtered)

const hasActiveFilters = computed(
  () =>
    Boolean(filters.value.query) ||
    Boolean(filters.value.suburb) ||
    Boolean(filters.value.activityType) ||
    filters.value.familyFriendlyOnly ||
    filters.value.includePast
)
</script>

<template>
  <section>
    <header class="mb-4">
      <h1 class="h3 mb-2">Planting Events</h1>
      <p class="text-body-secondary mb-0">
        Weekend planting days across Melbourne's west and north. Everyone is
        welcome — no experience needed, and tools are provided at most sites.
      </p>
    </header>

    <div class="row g-4">
      <!-- Filters: a sidebar once there is room, stacked above the list below that -->
      <aside class="col-12 col-lg-4 col-xl-3">
        <form
          class="card gr-filters"
          role="search"
          aria-label="Filter planting events"
          @submit.prevent
        >
          <div class="card-body">
            <h2 class="h6 text-uppercase text-body-secondary mb-3">Find a planting day</h2>

            <div class="mb-3">
              <label class="form-label" for="filter-query">Search</label>
              <input
                id="filter-query"
                v-model="filters.query"
                type="search"
                class="form-control"
                placeholder="Site, suburb or keyword"
              />
            </div>

            <div class="mb-3">
              <label class="form-label" for="filter-suburb">Suburb</label>
              <select id="filter-suburb" v-model="filters.suburb" class="form-select">
                <option value="">All suburbs</option>
                <option v-for="suburb in store.suburbs" :key="suburb" :value="suburb">
                  {{ suburb }}
                </option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label" for="filter-activity">Activity</label>
              <select id="filter-activity" v-model="filters.activityType" class="form-select">
                <option value="">All activities</option>
                <option
                  v-for="activity in store.activityTypes"
                  :key="activity"
                  :value="activity"
                >
                  {{ formatActivity(activity) }}
                </option>
              </select>
            </div>

            <div class="form-check mb-2">
              <input
                id="filter-family"
                v-model="filters.familyFriendlyOnly"
                class="form-check-input"
                type="checkbox"
              />
              <label class="form-check-label" for="filter-family">
                Family friendly only
              </label>
            </div>

            <div class="form-check mb-3">
              <input
                id="filter-past"
                v-model="filters.includePast"
                class="form-check-input"
                type="checkbox"
              />
              <label class="form-check-label" for="filter-past">
                Include past planting days
              </label>
            </div>

            <button
              type="button"
              class="btn btn-outline-secondary btn-sm w-100"
              :disabled="!hasActiveFilters"
              @click="store.resetFilters()"
            >
              Clear filters
            </button>
          </div>
        </form>
      </aside>

      <div class="col-12 col-lg-8 col-xl-9">
        <p class="text-body-secondary small mb-3" role="status" aria-live="polite">
          <template v-if="!loading">
            Showing {{ results.length }}
            {{ results.length === 1 ? 'planting day' : 'planting days' }}
            <template v-if="!filters.includePast"> still to come</template>
          </template>
        </p>

        <EventList
          :events="results"
          :loading="loading"
          :error="error"
          empty-message="No planting days match those filters. Try clearing the suburb or activity."
        />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints' as bp;

.gr-filters {
  // Keeps the filters beside the results while the user scrolls a long list.
  @include bp.up(lg) {
    position: sticky;
    top: 5rem;
  }
}
</style>
