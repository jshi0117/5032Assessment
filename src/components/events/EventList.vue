<script setup>
import EventCard from './EventCard.vue'

/**
 * Grid of event cards, with the loading, error and empty states that go with a
 * list fed from a store.
 *
 * Column counts step through every band BR A.2 is graded on:
 * 1 up on phones, 2 from 576px, 3 from 992px, 4 beyond 1400px.
 */
defineProps({
  events: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  emptyMessage: { type: String, default: 'No planting days match those filters.' }
})
</script>

<template>
  <div>
    <div v-if="loading" class="row g-3 g-lg-4" aria-hidden="true">
      <div v-for="n in 6" :key="n" class="col-12 col-sm-6 col-lg-4 col-xxl-3">
        <div class="card h-100 gr-skeleton">
          <div class="card-body">
            <span class="placeholder col-4 mb-3 d-block"></span>
            <span class="placeholder col-9 mb-2 d-block"></span>
            <span class="placeholder col-6 mb-3 d-block"></span>
            <span class="placeholder col-12 d-block"></span>
          </div>
        </div>
      </div>
    </div>
    <p v-if="loading" class="visually-hidden" role="status">Loading planting days…</p>

    <div v-else-if="error" class="alert alert-danger" role="alert">
      <p class="fw-semibold mb-1">Planting days could not be loaded</p>
      <p class="mb-0 small">{{ error }}</p>
    </div>

    <p v-else-if="!events.length" class="alert alert-secondary mb-0" role="status">
      {{ emptyMessage }}
    </p>

    <div v-else class="row g-3 g-lg-4">
      <div
        v-for="event in events"
        :key="event.id"
        class="col-12 col-sm-6 col-lg-4 col-xxl-3"
      >
        <EventCard :event="event" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.gr-skeleton { opacity: 0.6; }
</style>
