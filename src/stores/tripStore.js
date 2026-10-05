import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import * as mapService from '@/services/mapService'

/**
 * Where the user is starting from, and how to get from there to a site
 * (BR E.2).
 *
 * The origin is the hinge of both map features: the site search sorts and
 * filters by distance from it, and the trip planner routes from it. It can come
 * from the browser's location or from an address the user searched for.
 */
export const useTripStore = defineStore('trip', () => {
  /** `{ lng, lat, label, source: 'device' | 'search' }` */
  const origin = ref(null)
  const locating = ref(false)
  const locationError = ref(null)

  const destination = ref(null)
  const routes = ref(null)
  const mode = ref('cycling')
  const routing = ref(false)
  const routeError = ref(null)

  let routeController = null

  const isConfigured = mapService.isMapConfigured()

  /**
   * Asks the browser where the user is.
   *
   * Only ever called from a button press — never on page load — so the
   * permission prompt arrives as the answer to something the user asked for,
   * not as an unexplained interruption. Each way it can fail gets its own
   * message, because "denied" needs different advice from "timed out".
   */
  function locate() {
    locationError.value = null
    if (!('geolocation' in navigator)) {
      locationError.value = 'This browser cannot share its location. Search for an address instead.'
      return Promise.resolve(null)
    }

    locating.value = true
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const point = { lng: position.coords.longitude, lat: position.coords.latitude }
          origin.value = { ...point, label: 'Your location', source: 'device', accuracy: position.coords.accuracy }
          locating.value = false
          resolve(origin.value)
          // Named afterwards, so the distances appear without waiting for it.
          try {
            const label = await mapService.describeLocation(point)
            if (label && origin.value?.source === 'device') {
              origin.value = { ...origin.value, label: `Your location (near ${label})` }
            }
          } catch {
            // The coordinates are what matter; an unnamed origin is fine.
          }
        },
        (err) => {
          locating.value = false
          locationError.value =
            {
              1: 'Location access was blocked. Allow it in your browser’s site settings, or search for an address instead.',
              2: 'Your location could not be worked out. Search for an address instead.',
              3: 'Finding your location took too long. Try again, or search for an address.'
            }[err.code] ?? 'Your location could not be found.'
          resolve(null)
        },
        // Street-level accuracy is plenty for choosing a planting site, and a
        // five-minute-old fix is still accurate enough to sort by.
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      )
    })
  }

  function setOrigin(place) {
    locationError.value = null
    origin.value = place ? { lng: place.lng, lat: place.lat, label: place.label, source: 'search' } : null
  }

  function clearTrip() {
    routeController?.abort()
    destination.value = null
    routes.value = null
    routeError.value = null
    routing.value = false
  }

  /**
   * Plans the trip to a site for every travel mode at once.
   *
   * A newer request cancels the one before, so clicking "Directions" on two
   * sites in quick succession cannot leave the first site's route on screen.
   */
  async function planTrip(site) {
    routeController?.abort()
    routeController = new AbortController()
    destination.value = site
    routes.value = null
    routeError.value = null

    if (!origin.value) {
      routeError.value = 'Choose where you are starting from first.'
      return
    }

    routing.value = true
    try {
      const result = await mapService.getRoutes(origin.value, site, { signal: routeController.signal })
      routes.value = result
      // Stay on the chosen mode if it has a route; otherwise the first that does.
      if (!result[mode.value]) {
        mode.value = mapService.TRAVEL_MODES.find((m) => result[m.id])?.id ?? mode.value
      }
      if (!Object.values(result).some(Boolean)) {
        routeError.value = 'No route could be found to this site from where you are starting.'
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      routeError.value = err.message ?? 'Directions could not be loaded.'
    } finally {
      routing.value = false
    }
  }

  const activeRoute = computed(() => routes.value?.[mode.value] ?? null)

  /** Suggestions for the address box. Errors go to the caller to show inline. */
  const searchPlaces = (query, options) =>
    mapService.searchPlaces(query, { near: origin.value ?? undefined, ...options })

  return {
    origin, locating, locationError,
    destination, routes, mode, routing, routeError, activeRoute,
    isConfigured,
    locate, setOrigin, clearTrip, planTrip, searchPlaces
  }
})
