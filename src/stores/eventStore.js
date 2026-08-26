import { ref, reactive, computed } from 'vue'
import { defineStore } from 'pinia'

import * as eventService from '@/services/eventService'

/**
 * Application state for planting events.
 *
 * Components talk to this store; only the store talks to the service. Keeping
 * that direction one-way is what lets the data source change later without
 * touching a single component.
 */
export const useEventStore = defineStore('events', () => {
  const events = ref([])
  const sites = ref([])
  const loading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  const filters = reactive({
    query: '',
    suburb: '',
    activityType: '',
    familyFriendlyOnly: false,
    includePast: false
  })

  async function load({ force = false } = {}) {
    if (loaded.value && !force) return
    loading.value = true
    error.value = null
    try {
      const [nextEvents, nextSites] = await Promise.all([
        eventService.listEvents(),
        eventService.listSites()
      ])
      events.value = nextEvents
      sites.value = nextSites
      loaded.value = true
    } catch (err) {
      error.value = err.message ?? 'Planting events could not be loaded.'
    } finally {
      loading.value = false
    }
  }

  /** Replaces one event in place after a write, avoiding a full reload. */
  function replace(updated) {
    const index = events.value.findIndex((e) => e.id === updated.id)
    if (index !== -1) events.value[index] = updated
  }

  async function register(eventId, volunteerId) {
    replace(await eventService.registerForEvent(eventId, volunteerId))
  }

  async function cancelRegistration(eventId, volunteerId) {
    replace(await eventService.cancelRegistration(eventId, volunteerId))
  }

  async function rate(eventId, volunteerId, rating) {
    replace(await eventService.rateEvent(eventId, volunteerId, rating))
  }

  async function resetLocalChanges() {
    events.value = await eventService.resetLocalChanges()
  }

  const upcoming = computed(() =>
    events.value.filter((e) => !e.isPast && e.status !== 'draft')
  )

  const nextEvent = computed(
    () => upcoming.value.find((e) => e.status !== 'cancelled') ?? null
  )

  const suburbs = computed(() =>
    [...new Set(sites.value.map((s) => s.suburb))].sort()
  )

  const activityTypes = computed(() =>
    [...new Set(events.value.map((e) => e.activityType))].sort()
  )

  /**
   * The public list.
   *
   * Drafts are withheld: they are events a coordinator has started but not
   * published, so showing them to visitors advertises a planting day that has
   * no confirmed date. Coordinator tooling reads `events` directly instead.
   */
  const filtered = computed(() => {
    const query = filters.query.trim().toLowerCase()
    return events.value
      .filter((e) => e.status !== 'draft')
      .filter((e) => (filters.includePast ? true : !e.isPast))
      .filter((e) => (filters.suburb ? e.suburb === filters.suburb : true))
      .filter((e) =>
        filters.activityType ? e.activityType === filters.activityType : true
      )
      .filter((e) => (filters.familyFriendlyOnly ? e.familyFriendly : true))
      .filter((e) =>
        query
          ? [e.title, e.suburb, e.description].join(' ').toLowerCase().includes(query)
          : true
      )
  })

  const eventById = (id) => events.value.find((e) => e.id === id) ?? null

  function resetFilters() {
    Object.assign(filters, {
      query: '',
      suburb: '',
      activityType: '',
      familyFriendlyOnly: false,
      includePast: false
    })
  }

  return {
    events, sites, loading, error, loaded, filters,
    load, register, cancelRegistration, rate, resetLocalChanges, resetFilters,
    upcoming, nextEvent, suburbs, activityTypes, filtered, eventById
  }
})
