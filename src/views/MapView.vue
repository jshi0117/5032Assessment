<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useEventStore } from '@/stores/eventStore'
import { useTripStore } from '@/stores/tripStore'
import BaseAlert from '@/components/base/BaseAlert.vue'
import AddressSearch from '@/components/map/AddressSearch.vue'
import SiteMap from '@/components/map/SiteMap.vue'
import TripPanel from '@/components/map/TripPanel.vue'
import { distanceKm, formatDistance } from '@/utils/geo'
import { formatDateMedium, formatTime, formatRating } from '@/utils/format'

/**
 * Planting map (BR E.2).
 *
 * Feature 1 — geospatial site search. Planting sites are filtered by suburb,
 * tree species, month and family-friendliness, and — once the user has said
 * where they are, by device location or by searching an address — by distance,
 * nearest first, within a chosen radius. Map and list stay in step: hovering or
 * focusing a result highlights its marker, choosing a marker selects its card.
 *
 * Feature 2 — trip planning. "Directions" routes from that starting point to
 * the site for walking, cycling and driving at once, draws the chosen route,
 * lists the turns, and works out when to leave to make the start time.
 *
 * The selected site is kept in the URL (?site=site-03), so a link to the map
 * from a planting day opens on that site, and the view survives a refresh.
 */
const route = useRoute()
const router = useRouter()
const events = useEventStore()
const trip = useTripStore()

const filters = reactive({ suburb: '', species: '', month: '', familyOnly: false, radiusKm: '' })
const highlightedId = ref(null)
const mapError = ref(null)
const filtersOpen = ref(false)
const addressSearch = ref(null)

onMounted(() => events.load())

const selectedId = computed(() => (typeof route.query.site === 'string' ? route.query.site : null))

function select(siteId, { scroll = true } = {}) {
  router.replace({ query: { ...route.query, site: siteId || undefined } })
  if (scroll && siteId) {
    nextTick(() => document.getElementById(`site-${siteId}`)?.scrollIntoView({ block: 'nearest' }))
  }
}

/** Planting days a volunteer could still join: not past, not draft, not cancelled. */
const upcoming = computed(() =>
  events.events
    .filter((e) => !e.isPast && !['draft', 'cancelled'].includes(e.status))
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
)

const MONTH = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthLabel = (ym) => MONTH.format(new Date(`${ym}-01T00:00:00Z`))

const options = computed(() => ({
  suburbs: [...new Set(events.sites.map((s) => s.suburb))].sort(),
  species: [...new Set(events.sites.flatMap((s) => s.species))].sort(),
  months: [...new Set(upcoming.value.map((e) => e.date.slice(0, 7)))].sort()
}))

/** Average across every rated planting day held at the site. */
function siteRating(siteId) {
  const rated = events.events.filter((e) => e.siteId === siteId && e.ratingCount > 0)
  const count = rated.reduce((sum, e) => sum + e.ratingCount, 0)
  if (!count) return null
  return { average: rated.reduce((sum, e) => sum + e.ratingSum, 0) / count, count }
}

const results = computed(() => {
  const origin = trip.origin
  const radius = Number(filters.radiusKm) || null
  const eventFilterActive = Boolean(filters.month || filters.familyOnly)

  const list = events.sites
    .filter((site) => !filters.suburb || site.suburb === filters.suburb)
    .filter((site) => !filters.species || site.species.includes(filters.species))
    .map((site) => {
      const matching = upcoming.value.filter(
        (e) =>
          e.siteId === site.id &&
          (!filters.month || e.date.startsWith(filters.month)) &&
          (!filters.familyOnly || e.familyFriendly)
      )
      return {
        site,
        nextEvent: matching[0] ?? null,
        upcomingCount: matching.length,
        distanceKm: origin ? distanceKm(origin, site) : null,
        rating: siteRating(site.id)
      }
    })
    // A month or family filter is a question about planting days, so a site
    // with none that match is not an answer to it.
    .filter((r) => !eventFilterActive || r.nextEvent)
    .filter((r) => !radius || r.distanceKm === null || r.distanceKm <= radius)

  return list.sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm
    if (a.nextEvent && b.nextEvent) return a.nextEvent.date.localeCompare(b.nextEvent.date)
    if (a.nextEvent !== b.nextEvent) return a.nextEvent ? -1 : 1
    return a.site.name.localeCompare(b.site.name)
  })
})

const sortedBy = computed(() => (trip.origin ? 'nearest first' : 'next planting day first'))
const fitKey = computed(() => results.value.map((r) => r.site.id).join(','))

const activeFilterSummary = computed(() =>
  [
    filters.suburb,
    filters.species,
    filters.month && monthLabel(filters.month),
    filters.familyOnly && 'family friendly',
    filters.radiusKm && `within ${filters.radiusKm} km`
  ]
    .filter(Boolean)
    .join(', ')
)

function resetFilters() {
  Object.assign(filters, { suburb: '', species: '', month: '', familyOnly: false, radiusKm: '' })
}

// A selection that the filters have just hidden is dropped, rather than left
// pointing at a marker that is no longer drawn.
watch(results, (list) => {
  if (selectedId.value && !list.some((r) => r.site.id === selectedId.value)) select(null, { scroll: false })
})

/* ---------- Starting point ---------- */

async function useMyLocation() {
  const place = await trip.locate()
  if (place) addressSearch.value?.setText('')
}

function onAddressChosen(place) {
  trip.setOrigin(place)
}

/* ---------- Trip planning ---------- */

const destination = computed(() =>
  trip.destination ? results.value.find((r) => r.site.id === trip.destination.id) ?? {
    site: trip.destination,
    nextEvent: null
  } : null
)

const startHeading = ref(null)
const mainArea = ref(null)

/**
 * Directions need a starting point. If there is none yet, ask the device —
 * the button press is the user's consent — and fall back to pointing them at
 * the address box if that is refused.
 */
async function directionsTo(siteId) {
  const site = events.sites.find((s) => s.id === siteId)
  if (!site) return
  select(siteId, { scroll: false })
  if (!trip.origin) {
    const place = await trip.locate()
    if (!place) {
      await trip.planTrip(site) // records the "choose a start" message
      startHeading.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
  }
  await trip.planTrip(site)
  // Map at the top of the screen with the route on it, directions beneath.
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  nextTick(() => mainArea.value?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }))
}

// A new starting point re-plans the open trip from there.
watch(() => trip.origin, (origin, previous) => {
  if (origin && trip.destination && (origin.lng !== previous?.lng || origin.lat !== previous?.lat)) {
    trip.planTrip(trip.destination)
  }
})

const mapRoute = computed(() =>
  trip.activeRoute ? { mode: trip.mode, geometry: trip.activeRoute.geometry } : null
)
</script>

<template>
  <section class="gr-mapview">
    <p class="text-body-secondary small mb-1">Find a planting site</p>
    <h1 class="h3 mb-1">Planting map</h1>
    <p class="text-body-secondary mb-3">
      Find a site near you, then get directions on foot, by bike or by car — with the time to leave
      so you arrive before the planting day starts.
    </p>

    <BaseAlert v-if="!trip.isConfigured" variant="warning" title="The map is not available">
      Maps have not been set up on this copy of the site. You can still filter the sites below and
      sort them by distance from your location.
    </BaseAlert>
    <BaseAlert v-if="mapError" variant="warning" title="The map could not load">{{ mapError }}</BaseAlert>
    <BaseAlert v-if="events.error" variant="danger" title="Could not load planting sites">
      {{ events.error }}
    </BaseAlert>

    <div class="gr-mapview__layout">
      <!-- DOM order is search → map → results, which is also the order on a
           phone. On a wide screen search and results share the left column,
           so reading and tab order never jump against the visual layout. -->
      <div class="gr-mapview__search">
        <section class="mb-3" aria-labelledby="start-heading">
          <h2 id="start-heading" ref="startHeading" class="h6 mb-2">1. Where are you starting from?</h2>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary w-100 mb-2"
            :disabled="trip.locating"
            :aria-busy="trip.locating ? 'true' : undefined"
            @click="useMyLocation"
          >
            <span v-if="trip.locating" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
            {{ trip.locating ? 'Finding your location…' : 'Use my current location' }}
          </button>
          <AddressSearch
            v-if="trip.isConfigured"
            ref="addressSearch"
            label="Or search an address or suburb"
            placeholder="e.g. 12 Ballarat Rd, Sunshine"
            :search="trip.searchPlaces"
            @select="onAddressChosen"
          />
          <p v-if="trip.locationError" class="small text-danger mt-2 mb-0" role="alert">{{ trip.locationError }}</p>
          <p v-if="trip.origin" class="small mt-2 mb-0">
            <span class="text-body-secondary">Starting from:</span> {{ trip.origin.label }}
            <button type="button" class="btn btn-link btn-sm p-0 ms-1 align-baseline" @click="trip.setOrigin(null)">
              Clear<span class="visually-hidden"> starting point</span>
            </button>
          </p>
        </section>

        <section class="mb-3" aria-labelledby="filter-heading">
          <div class="d-flex align-items-center justify-content-between">
            <h2 id="filter-heading" class="h6 mb-2">2. Filter sites</h2>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary d-lg-none mb-2"
              aria-controls="map-filters"
              :aria-expanded="filtersOpen"
              @click="filtersOpen = !filtersOpen"
            >
              {{ filtersOpen ? 'Hide filters' : 'Show filters' }}
            </button>
          </div>
          <p v-if="activeFilterSummary && !filtersOpen" class="small text-body-secondary d-lg-none mb-2">
            Filtering: {{ activeFilterSummary }}
          </p>

          <div id="map-filters" class="row g-2" :class="{ 'd-none d-lg-flex': !filtersOpen }">
            <div class="col-6 col-lg-12">
              <label class="form-label small mb-1" for="map-suburb">Suburb</label>
              <select id="map-suburb" v-model="filters.suburb" class="form-select form-select-sm">
                <option value="">Any suburb</option>
                <option v-for="suburb in options.suburbs" :key="suburb" :value="suburb">{{ suburb }}</option>
              </select>
            </div>
            <div class="col-6 col-lg-12">
              <label class="form-label small mb-1" for="map-species">Tree or plant species</label>
              <select id="map-species" v-model="filters.species" class="form-select form-select-sm">
                <option value="">Any species</option>
                <option v-for="name in options.species" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>
            <div class="col-6 col-lg-12">
              <label class="form-label small mb-1" for="map-month">Planting month</label>
              <select id="map-month" v-model="filters.month" class="form-select form-select-sm">
                <option value="">Any month</option>
                <option v-for="month in options.months" :key="month" :value="month">{{ monthLabel(month) }}</option>
              </select>
            </div>
            <div class="col-6 col-lg-12">
              <label class="form-label small mb-1" for="map-radius">Distance</label>
              <select
                id="map-radius"
                v-model="filters.radiusKm"
                class="form-select form-select-sm"
                :disabled="!trip.origin"
                aria-describedby="map-radius-hint"
              >
                <option value="">Any distance</option>
                <option v-for="km in [2, 5, 10, 20]" :key="km" :value="String(km)">Within {{ km }} km</option>
              </select>
              <p v-if="!trip.origin" id="map-radius-hint" class="form-text mb-0">Set a starting point first.</p>
            </div>
            <div class="col-12">
              <div class="form-check">
                <input id="map-family" v-model="filters.familyOnly" class="form-check-input" type="checkbox" />
                <label class="form-check-label small" for="map-family">Family-friendly planting days only</label>
              </div>
            </div>
            <div v-if="activeFilterSummary" class="col-12">
              <button type="button" class="btn btn-link btn-sm p-0" @click="resetFilters">Clear filters</button>
            </div>
          </div>
        </section>

      </div>

      <!-- ============ Map and trip ============ -->
      <div ref="mainArea" class="gr-mapview__main">
        <div class="gr-mapview__map">
          <SiteMap
            v-if="trip.isConfigured && !mapError"
            :results="results"
            :selected-id="selectedId"
            :highlighted-id="highlightedId"
            :origin="trip.origin"
            :route="mapRoute"
            :fit-key="fitKey"
            @select="select"
            @directions="directionsTo"
            @error="mapError = $event"
          />
        </div>

        <TripPanel
          v-if="destination"
          id="trip-panel"
          class="mt-3"
          :destination="destination"
          :origin="trip.origin"
          :routes="trip.routes"
          :mode="trip.mode"
          :routing="trip.routing"
          :error="trip.routeError"
          @update:mode="trip.mode = $event"
          @close="trip.clearTrip()"
        />
      </div>

      <div class="gr-mapview__list">
        <section aria-labelledby="results-heading">
          <h2 id="results-heading" class="h6 mb-1">3. Choose a site</h2>
          <p class="small text-body-secondary mb-2" role="status" aria-live="polite">
            {{ events.loading ? 'Loading sites…' : `${results.length} site${results.length === 1 ? '' : 's'} found · ${sortedBy}` }}
          </p>

          <p v-if="!events.loading && !results.length" class="small">
            No sites match. <button type="button" class="btn btn-link btn-sm p-0 align-baseline" @click="resetFilters">Clear the filters</button>
            to see them all.
          </p>

          <ul class="gr-mapview__results list-unstyled mb-0">
            <li
              v-for="result in results"
              :id="`site-${result.site.id}`"
              :key="result.site.id"
              class="gr-site card mb-2"
              :class="{ 'is-selected': result.site.id === selectedId }"
              @mouseenter="highlightedId = result.site.id"
              @mouseleave="highlightedId = null"
              @focusin="highlightedId = result.site.id"
              @focusout="highlightedId = null"
            >
              <div class="card-body p-3">
                <h3 class="h6 mb-1">
                  <button
                    type="button"
                    class="gr-site__name btn btn-link p-0 text-start"
                    :aria-pressed="result.site.id === selectedId"
                    @click="select(result.site.id, { scroll: false })"
                  >
                    {{ result.site.name }}
                  </button>
                </h3>
                <p class="small text-body-secondary mb-1">
                  {{ result.site.suburb }}
                  <template v-if="result.distanceKm !== null"> · {{ formatDistance(result.distanceKm) }} away</template>
                </p>
                <p class="small mb-1">
                  <template v-if="result.nextEvent">
                    Next: {{ formatDateMedium(result.nextEvent.date) }}, {{ formatTime(result.nextEvent.startTime) }}
                    <span v-if="result.upcomingCount > 1" class="text-body-secondary">(+{{ result.upcomingCount - 1 }} more)</span>
                  </template>
                  <span v-else class="text-body-secondary">No upcoming planting day</span>
                </p>
                <p v-if="result.rating" class="small mb-2">
                  <span aria-hidden="true">★</span>
                  {{ formatRating(result.rating.average) }}
                  <span class="text-body-secondary">({{ result.rating.count }} ratings)</span>
                </p>
                <div class="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="btn btn-sm btn-primary"
                    :disabled="!trip.isConfigured"
                    @click="directionsTo(result.site.id)"
                  >
                    Directions<span class="visually-hidden"> to {{ result.site.name }}</span>
                  </button>
                  <RouterLink
                    v-if="result.nextEvent"
                    class="btn btn-sm btn-outline-primary"
                    :to="{ name: 'event-detail', params: { id: result.nextEvent.id } }"
                  >
                    View planting day<span class="visually-hidden"> at {{ result.site.name }}</span>
                  </RouterLink>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
// Phones and tablets: one column — search, map (with the trip under it), then
// the results. From lg up: search and results in a left column that scrolls,
// map and trip on the right, held in view while the list is browsed.
.gr-mapview__layout {
  display: grid;
  gap: 1rem;
  grid-template-areas: 'search' 'main' 'list';

  @media (min-width: 992px) {
    grid-template-columns: minmax(18rem, 22rem) 1fr;
    grid-template-rows: auto 1fr;
    grid-template-areas:
      'search main'
      'list   main';
    align-items: start;
  }
}

.gr-mapview__search {
  grid-area: search;
}

.gr-mapview__list {
  grid-area: list;

  @media (min-width: 992px) {
    max-height: 60vh;
    overflow-y: auto;
    padding-right: 0.25rem;
  }
}

.gr-mapview__main {
  grid-area: main;
  // Room for the sticky site header when scrolled into view.
  scroll-margin-top: 5rem;
}

.gr-mapview__map {
  height: 50vh;
  min-height: 20rem;

  @media (min-width: 992px) {
    height: 62vh;
  }
}

.gr-site {
  transition: border-color 0.15s ease;

  &.is-selected {
    border-color: var(--gr-green-700);
    box-shadow: inset 4px 0 0 var(--gr-green-700);
  }
}

.gr-site__name {
  font-weight: 600;
  text-decoration: none;
  color: var(--gr-green-900);

  &:hover {
    text-decoration: underline;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gr-site {
    transition: none;
  }
}
</style>
