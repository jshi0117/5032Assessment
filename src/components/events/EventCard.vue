<script setup>
import { computed } from 'vue'
import {
  formatDateMedium, formatTimeRange, formatSpots,
  formatRating, starsFor, formatStatus, statusVariant
} from '@/utils/format'

/**
 * One planting day, as a card. Presentational: it renders what it is given and
 * never reaches into the store.
 */
const props = defineProps({
  event: { type: Object, required: true }
})

/**
 * Places remaining only mean something for a planting day you could still join.
 * A cancelled or unpublished event has no spots to offer, and a past one is
 * described by who turned up instead.
 */
const availability = computed(() => {
  const e = props.event
  if (e.isPast) return `${e.registered} attended`
  if (e.status === 'cancelled') return 'Cancelled'
  if (e.status === 'draft') return 'Dates to be confirmed'
  return formatSpots(e.spotsLeft)
})

const availabilityIsPositive = computed(
  () => !props.event.isPast && props.event.status === 'open' && !props.event.isFull
)
</script>

<template>
  <article class="card h-100 gr-event-card">
    <div class="card-body d-flex flex-column">
      <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2 gr-event-card__meta">
        <span class="badge text-bg-light">{{ event.suburb }}</span>
        <span class="badge" :class="statusVariant(event.displayStatus)">
          {{ formatStatus(event.displayStatus) }}
        </span>
      </div>

      <h3 class="h6 card-title mb-1">
        <RouterLink
          class="stretched-link text-decoration-none"
          :to="{ name: 'event-detail', params: { id: event.id } }"
        >
          {{ event.title }}
        </RouterLink>
      </h3>

      <p class="small text-body-secondary mb-2">
        {{ formatDateMedium(event.date) }} · {{ formatTimeRange(event.startTime, event.endTime) }}
      </p>

      <p class="small mb-3 gr-event-card__blurb">{{ event.description }}</p>

      <ul class="list-unstyled d-flex flex-wrap gap-1 small mb-3">
        <li v-if="event.familyFriendly" class="badge text-bg-light fw-normal">
          Family friendly
        </li>
        <li v-if="event.toolsProvided" class="badge text-bg-light fw-normal">
          Tools provided
        </li>
        <li v-if="event.wheelchairAccessible" class="badge text-bg-light fw-normal">
          Wheelchair accessible
        </li>
      </ul>

      <div class="mt-auto d-flex align-items-center justify-content-between gap-2">
        <p class="small mb-0" :class="availabilityIsPositive ? 'fw-semibold' : 'text-body-secondary'">
          {{ availability }}
        </p>

        <p v-if="event.ratingCount" class="small mb-0 text-body-secondary">
          <span aria-hidden="true">{{ '★'.repeat(starsFor(event.averageRating)).padEnd(5, '☆') }}</span>
          <span class="visually-hidden">
            Rated {{ formatRating(event.averageRating) }} out of 5 by
            {{ event.ratingCount }} volunteers
          </span>
          <span class="ms-1">{{ formatRating(event.averageRating) }}</span>
        </p>
      </div>
    </div>
  </article>
</template>

<style scoped>
/*
 * Bootstrap's .badge sets white-space: nowrap, so in a nowrap flex row the two
 * badges push past the card edge once the column is narrow — which happens at
 * the xxl breakpoint, where the grid is four columns wide. Letting the row wrap
 * drops the status badge onto its own line instead of overflowing.
 */
.gr-event-card__meta {
  min-width: 0;
}

.gr-event-card {
  transition: box-shadow 0.15s ease-in-out, transform 0.15s ease-in-out;
}

.gr-event-card:hover,
.gr-event-card:focus-within {
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

/* Keeps cards in a row the same height regardless of blurb length. */
.gr-event-card__blurb {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .gr-event-card { transition: none; }
  .gr-event-card:hover { transform: none; }
}
</style>
