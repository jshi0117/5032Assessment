<script setup>
import { computed, useId } from 'vue'

import { TRAVEL_MODES, transitDirectionsUrl } from '@/services/mapService'
import { formatDistance, formatDuration, leaveBy } from '@/utils/geo'
import { formatDateMedium, formatTime } from '@/utils/format'

/**
 * Trip information and turn-by-turn directions (BR E.2).
 *
 * Compares walking, cycling and driving side by side, shows the chosen one's
 * steps, and works out when to leave to make the planting day's start time —
 * the question a volunteer actually has, rather than just "how far is it".
 * Public transport, which Mapbox does not route, is handed to Google Maps.
 */
const props = defineProps({
  /** `{ site, nextEvent }` for the destination */
  destination: { type: Object, required: true },
  origin: { type: Object, default: null },
  routes: { type: Object, default: null },
  mode: { type: String, required: true },
  routing: { type: Boolean, default: false },
  error: { type: String, default: null }
})

const emit = defineEmits(['update:mode', 'close'])

const uid = useId()
const active = computed(() => props.routes?.[props.mode] ?? null)

const leaveTime = computed(() => {
  const event = props.destination.nextEvent
  if (!event || !active.value) return null
  return leaveBy(event.startTime, active.value.durationSeconds)
})

const transitUrl = computed(() => transitDirectionsUrl(props.origin, props.destination.site))

/** Announced when a route arrives, so a screen reader user hears the result. */
const summary = computed(() => {
  if (props.routing) return 'Finding routes…'
  if (!active.value) return ''
  const mode = TRAVEL_MODES.find((m) => m.id === props.mode)?.label.toLowerCase()
  return `${formatDuration(active.value.durationSeconds)} by ${mode === 'walk' ? 'foot' : mode === 'cycle' ? 'bike' : 'car'}, ${formatDistance(active.value.distanceKm)}.`
})

/** Arrow keys move between the mode buttons, as in any radio group. */
function onModeKey(event, index) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
  if (!step) return
  event.preventDefault()
  const available = TRAVEL_MODES.filter((m) => props.routes?.[m.id])
  if (!available.length) return
  const current = available.findIndex((m) => m.id === TRAVEL_MODES[index].id)
  const next = available[(current + step + available.length) % available.length]
  emit('update:mode', next.id)
  document.getElementById(`${uid}-mode-${next.id}`)?.focus()
}
</script>

<template>
  <section class="gr-trip card" :aria-labelledby="`${uid}-title`">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
        <div>
          <h2 :id="`${uid}-title`" class="h6 mb-1">Directions to {{ destination.site.name }}</h2>
          <p class="small text-body-secondary mb-0">
            From {{ origin?.label ?? '—' }}
          </p>
        </div>
        <button type="button" class="btn-close" aria-label="Close directions" @click="emit('close')"></button>
      </div>

      <p class="visually-hidden" role="status" aria-live="polite">{{ summary }}</p>

      <p v-if="error" class="alert alert-warning small py-2 mb-2" role="alert">{{ error }}</p>

      <div v-if="routing" class="d-flex align-items-center gap-2 small text-body-secondary py-2">
        <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        Finding routes…
      </div>

      <template v-else-if="routes">
        <div class="gr-trip__modes mb-3" role="radiogroup" aria-label="Travel mode">
          <button
            v-for="(travel, index) in TRAVEL_MODES"
            :id="`${uid}-mode-${travel.id}`"
            :key="travel.id"
            type="button"
            role="radio"
            class="gr-trip__mode btn btn-sm"
            :class="mode === travel.id ? 'btn-primary' : 'btn-outline-secondary'"
            :aria-checked="mode === travel.id"
            :tabindex="mode === travel.id ? 0 : -1"
            :disabled="!routes[travel.id]"
            @click="emit('update:mode', travel.id)"
            @keydown="onModeKey($event, index)"
          >
            <span class="d-block fw-semibold">{{ travel.label }}</span>
            <span class="d-block small">
              {{ routes[travel.id] ? formatDuration(routes[travel.id].durationSeconds) : 'No route' }}
            </span>
          </button>
          <a
            v-if="transitUrl"
            class="gr-trip__mode btn btn-sm btn-outline-secondary"
            :href="transitUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="d-block fw-semibold">Transit</span>
            <span class="d-block small">Google Maps<span class="visually-hidden"> (opens in a new tab)</span> ↗</span>
          </a>
        </div>

        <template v-if="active">
          <dl class="gr-trip__facts small mb-3">
            <div>
              <dt>Travel time</dt>
              <dd>{{ formatDuration(active.durationSeconds) }}</dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd>{{ formatDistance(active.distanceKm) }}</dd>
            </div>
            <div v-if="destination.nextEvent">
              <dt>Next planting day</dt>
              <dd>
                {{ formatDateMedium(destination.nextEvent.date) }},
                {{ formatTime(destination.nextEvent.startTime) }}
              </dd>
            </div>
            <div v-if="leaveTime">
              <dt>Leave by</dt>
              <dd>{{ formatTime(leaveTime) }} <span class="text-body-secondary">(arrives 10 min early)</span></dd>
            </div>
          </dl>

          <h3 class="h6 small text-uppercase text-body-secondary mb-2">Step by step</h3>
          <!-- Scrolls on its own, so it takes focus: a keyboard user can then
               scroll it with the arrow keys. -->
          <ol class="gr-trip__steps small mb-2" tabindex="0" aria-label="Turn-by-turn directions">
            <li v-for="(step, index) in active.steps" :key="index">
              <span>{{ step.instruction }}</span>
              <span v-if="step.distanceKm > 0" class="text-body-secondary text-nowrap ms-1">
                · {{ formatDistance(step.distanceKm) }}
              </span>
            </li>
          </ol>
          <p class="small mb-0">
            <strong>Meeting point:</strong> {{ destination.site.meetingPoint }}
          </p>
        </template>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
.gr-trip__modes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
  gap: 0.5rem;
}

.gr-trip__mode {
  line-height: 1.25;
}

.gr-trip__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: 0.5rem 1rem;

  dt {
    font-weight: 400;
    color: var(--bs-secondary-color);
  }

  dd {
    margin: 0;
    font-weight: 600;
  }
}

.gr-trip__steps {
  max-height: 14rem;
  overflow-y: auto;
  padding-left: 1.25rem;

  li {
    padding: 0.2rem 0;
    border-bottom: 1px solid var(--bs-border-color-translucent);
  }
}
</style>
