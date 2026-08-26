<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useEventStore } from '@/stores/eventStore'
import {
  formatDateLong, formatTimeRange, formatSpots, formatRating,
  starsFor, formatStatus, statusVariant, formatActivity
} from '@/utils/format'

/**
 * A single planting day, looked up by route parameter.
 */
const route = useRoute()
const store = useEventStore()
const { loading, error } = storeToRefs(store)

// Standing in for the signed-in user until authentication arrives (BR C.1).
// Registration is wired up now so that persistence across a reload can be
// demonstrated; the identity becomes the real session user later.
const CURRENT_VOLUNTEER_ID = 'vol-001'

const submitting = ref(false)
const feedback = ref(null)

onMounted(() => store.load())

const event = computed(() => store.eventById(route.params.id))

const isRegistered = computed(() =>
  Boolean(event.value?.registeredVolunteerIds.includes(CURRENT_VOLUNTEER_ID))
)

const canRegister = computed(() => {
  const e = event.value
  if (!e) return false
  return !e.isPast && !e.isFull && !['cancelled', 'draft'].includes(e.status)
})

/**
 * The badge labels are abbreviated to fit a card; a disabled button has room
 * for a full sentence, and needs one to explain why it cannot be pressed.
 */
const unavailableLabel = computed(() => {
  const e = event.value
  if (!e) return ''
  if (e.isPast) return 'This planting day has finished'
  if (e.status === 'cancelled') return 'This planting day was cancelled'
  if (e.status === 'draft') return 'Registration not open yet'
  if (e.isFull) return 'Fully booked'
  return ''
})

async function register() {
  submitting.value = true
  feedback.value = null
  try {
    await store.register(event.value.id, CURRENT_VOLUNTEER_ID)
    feedback.value = {
      variant: 'success',
      message: 'You are registered. Your spot is saved on this device and will still be here after a refresh.'
    }
  } catch (err) {
    feedback.value = { variant: 'danger', message: err.message }
  } finally {
    submitting.value = false
  }
}

async function cancel() {
  submitting.value = true
  feedback.value = null
  try {
    await store.cancelRegistration(event.value.id, CURRENT_VOLUNTEER_ID)
    feedback.value = { variant: 'secondary', message: 'Your registration has been cancelled.' }
  } catch (err) {
    feedback.value = { variant: 'danger', message: err.message }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section>
    <nav aria-label="Breadcrumb" class="mb-3">
      <ol class="breadcrumb small mb-0">
        <li class="breadcrumb-item">
          <RouterLink :to="{ name: 'home' }">Home</RouterLink>
        </li>
        <li class="breadcrumb-item">
          <RouterLink :to="{ name: 'events' }">Planting Events</RouterLink>
        </li>
        <li class="breadcrumb-item active" aria-current="page">
          {{ event ? event.title : 'Event' }}
        </li>
      </ol>
    </nav>

    <p v-if="loading" class="text-body-secondary" role="status">Loading planting day…</p>

    <div v-else-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <div v-else-if="!event" class="alert alert-secondary" role="alert">
      <p class="fw-semibold mb-1">We couldn't find that planting day</p>
      <p class="mb-0 small">
        It may have been removed.
        <RouterLink :to="{ name: 'events' }">Browse all planting days</RouterLink>.
      </p>
    </div>

    <div v-else class="row g-4">
      <div class="col-12 col-lg-7 col-xxl-8">
        <span class="badge mb-2" :class="statusVariant(event.displayStatus)">
          {{ formatStatus(event.displayStatus) }}
        </span>

        <h1 class="h3 mb-2">{{ event.title }}</h1>
        <p class="text-body-secondary mb-4">
          {{ formatDateLong(event.date) }} · {{ formatTimeRange(event.startTime, event.endTime) }}
        </p>

        <p class="mb-4">{{ event.description }}</p>

        <h2 class="h6 text-uppercase text-body-secondary">What we're planting</h2>
        <ul class="list-unstyled d-flex flex-wrap gap-2 mb-4">
          <li
            v-for="species in event.site?.species ?? []"
            :key="species"
            class="badge text-bg-light fw-normal"
          >
            {{ species }}
          </li>
        </ul>

        <h2 class="h6 text-uppercase text-body-secondary">Good to know</h2>
        <ul class="mb-0">
          <li>Activity: {{ formatActivity(event.activityType) }}</li>
          <li>{{ event.toolsProvided ? 'Tools and gloves provided' : 'Please bring your own gloves' }}</li>
          <li>{{ event.familyFriendly ? 'Suitable for children with an adult' : 'Best suited to adults' }}</li>
          <li>
            {{ event.wheelchairAccessible ? 'Wheelchair accessible meeting point' : 'Uneven ground — not wheelchair accessible' }}
          </li>
        </ul>
      </div>

      <div class="col-12 col-lg-5 col-xxl-4">
        <div class="card mb-3">
          <div class="card-body">
            <h2 class="h6 mb-3">Your spot</h2>

            <p class="mb-1" :class="canRegister ? 'h5' : 'text-body-secondary'">
              <template v-if="event.isPast">{{ event.registered }} volunteers attended</template>
              <template v-else-if="event.status === 'cancelled'">This planting day has been cancelled</template>
              <template v-else-if="event.status === 'draft'">Dates still to be confirmed</template>
              <template v-else>{{ formatSpots(event.spotsLeft) }}</template>
            </p>
            <p class="small text-body-secondary mb-3">
              {{ event.registered }} of {{ event.capacity }} places taken
            </p>

            <div
              class="progress mb-3"
              role="img"
              :aria-label="`${event.registered} of ${event.capacity} places taken`"
            >
              <div
                class="progress-bar"
                :style="{ width: `${Math.round((event.registered / event.capacity) * 100)}%` }"
              ></div>
            </div>

            <div v-if="feedback" class="alert py-2 px-3 small" :class="`alert-${feedback.variant}`" role="status">
              {{ feedback.message }}
            </div>

            <button
              v-if="isRegistered"
              type="button"
              class="btn btn-outline-secondary w-100"
              :disabled="submitting"
              @click="cancel"
            >
              Cancel my spot
            </button>
            <button
              v-else
              type="button"
              class="btn btn-primary w-100"
              :disabled="!canRegister || submitting"
              @click="register"
            >
              {{ canRegister ? 'Register for this planting day' : unavailableLabel }}
            </button>
          </div>
        </div>

        <div v-if="event.site" class="card mb-3">
          <div class="card-body">
            <h2 class="h6 mb-2">Meeting point</h2>
            <p class="mb-1 fw-semibold">{{ event.site.name }}</p>
            <p class="small text-body-secondary mb-2">
              {{ event.site.suburb }} {{ event.site.postcode }} · {{ event.site.council }}
            </p>
            <p class="small mb-2">{{ event.site.meetingPoint }}</p>
            <p class="small text-body-secondary mb-0">
              Tree canopy cover in {{ event.site.suburb }}: {{ event.site.canopyCover }}%
            </p>
          </div>
        </div>

        <div v-if="event.ratingCount" class="card">
          <div class="card-body">
            <h2 class="h6 mb-2">Volunteer rating</h2>
            <p class="mb-0">
              <span class="h5" aria-hidden="true">
                {{ '★'.repeat(starsFor(event.averageRating)).padEnd(5, '☆') }}
              </span>
              <span class="ms-2">{{ formatRating(event.averageRating) }} / 5</span>
              <span class="text-body-secondary small d-block mt-1">
                from {{ event.ratingCount }}
                {{ event.ratingCount === 1 ? 'volunteer' : 'volunteers' }}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
