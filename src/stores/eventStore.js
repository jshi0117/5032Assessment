import { ref, reactive, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/authStore'

import * as eventService from '@/services/eventService'
import * as ratingService from '@/services/ratingService'

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

  /**
   * Rating totals per planting day, and this user's own scores (BR C.3).
   *
   * Held here rather than inside each event so a rating can be folded in
   * without re-reading the whole list: `rate` updates one entry and re-hydrates
   * one event.
   */
  const ratingStats = ref({})
  const myRatings = ref({})
  const ratingError = ref(null)

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
      // The planting days are on this device already, so they are shown at
      // once; the live rating totals come from Firestore and are folded in
      // when they arrive. Waiting for the network first left every page on
      // "Loading…" for a second or two on a cold start — long enough for a
      // crawler, or a person, to see no content at all.
      const [nextEvents, nextSites] = await Promise.all([
        eventService.listEvents(ratingStats.value),
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
    if (loaded.value) refreshRatings()
  }

  /**
   * Fetches the live rating totals and re-hydrates the events with them.
   * Ratings are public, so this read needs no sign-in, and a failure here
   * leaves the planting days showing their seed averages rather than nothing.
   */
  async function refreshRatings() {
    try {
      const stats = await ratingService.listStats()
      ratingStats.value = stats
      ratingError.value = null
      events.value = await eventService.listEvents(stats)
    } catch (err) {
      ratingError.value = err?.message ?? 'Ratings could not be loaded.'
    }
  }

  /** Replaces one event in place after a write, avoiding a full reload. */
  function replace(updated) {
    const index = events.value.findIndex((e) => e.id === updated.id)
    if (index !== -1) events.value[index] = updated
  }

  async function register(eventId, volunteerId, details = {}) {
    useAuthStore().assertVerified()
    const updated = await eventService.registerForEvent(
      eventId, volunteerId, details, ratingStats.value
    )
    replace(updated)
    return updated
  }

  async function cancelRegistration(eventId, volunteerId) {
    useAuthStore().assertVerified()
    replace(
      await eventService.cancelRegistration(eventId, volunteerId, ratingStats.value)
    )
  }

  /** Loads the signed-in user's own score for one planting day. */
  async function loadMyRating(eventId, uid) {
    if (!uid) return null
    const score = await ratingService.getMyRating(eventId, uid)
    myRatings.value = { ...myRatings.value, [eventId]: score }
    return score
  }

  /** Forgets the cached scores — called when the account changes. */
  function clearMyRatings() {
    myRatings.value = {}
  }

  /**
   * Records a rating and folds the new totals straight back into the event on
   * screen, so the average moves as soon as the score is saved rather than
   * after a reload.
   */
  async function rate(eventId, uid, score) {
    useAuthStore().assertVerified()
    const { stats } = await ratingService.submitRating(eventId, uid, score)
    ratingStats.value = { ...ratingStats.value, [eventId]: stats }
    myRatings.value = { ...myRatings.value, [eventId]: score }
    replace(await eventService.getEvent(eventId, ratingStats.value))
    return stats
  }

  const myRatingFor = (eventId) => myRatings.value[eventId] ?? null

  async function resetLocalChanges() {
    events.value = await eventService.resetLocalChanges(ratingStats.value)
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
    ratingStats, myRatings, ratingError,
    load, register, cancelRegistration, rate, resetLocalChanges, resetFilters,
    loadMyRating, clearMyRatings, myRatingFor,
    upcoming, nextEvent, suburbs, activityTypes, filtered, eventById
  }
})
