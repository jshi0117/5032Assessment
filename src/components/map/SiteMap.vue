<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
// The CSP build loads its worker from a file this site serves, rather than
// from a blob: URL, so the Content Security Policy can keep `worker-src 'self'`.
import mapboxgl from 'mapbox-gl/dist/mapbox-gl-csp.js'
import workerUrl from 'mapbox-gl/dist/mapbox-gl-csp-worker.js?url'
import 'mapbox-gl/dist/mapbox-gl.css'

import { MAPBOX_TOKEN } from '@/services/mapService'
import { boundsOf, formatDistance } from '@/utils/geo'
import { formatDateMedium, formatTime, formatRating } from '@/utils/format'

mapboxgl.workerUrl = workerUrl
mapboxgl.accessToken = MAPBOX_TOKEN

/**
 * The planting-site map (BR E.2).
 *
 * Presentational: it draws what it is given — the sites that match the current
 * search, the user's starting point and the planned route — and reports clicks
 * back up. Everything it shows is also in the result list beside it, which is
 * the accessible alternative for anyone who cannot use a map.
 *
 * Markers are real <button>s, so they can be reached with Tab and pressed with
 * Enter, and each carries a label that says what it is and how far away.
 */
const props = defineProps({
  /** `{ site, nextEvent, distanceKm, rating }[]` */
  results: { type: Array, required: true },
  selectedId: { type: String, default: null },
  highlightedId: { type: String, default: null },
  origin: { type: Object, default: null },
  /** `{ mode, geometry }` or null */
  route: { type: Object, default: null },
  /** Changes whenever the result set changes, to re-frame the map on it. */
  fitKey: { type: String, default: '' }
})

const emit = defineEmits(['select', 'directions', 'error'])

const router = useRouter()
const container = ref(null)
const map = shallowRef(null)
const markers = new Map()
let originMarker = null
let popup = null
let resizeObserver = null
let reportedError = false

const MELBOURNE_WEST = [144.85, -37.78]
const ROUTE_COLOURS = { walking: '#6d4c41', cycling: '#1b5e20', driving: '#0b5394' }

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Camera moves are instant for anyone who has asked the OS for less motion. */
const motion = (options = {}) => (prefersReducedMotion() ? { ...options, duration: 0 } : options)

function markerLabel(result) {
  const parts = [result.site.name]
  if (result.distanceKm !== null && result.distanceKm !== undefined) parts.push(`${formatDistance(result.distanceKm)} away`)
  parts.push(result.nextEvent ? `next planting ${formatDateMedium(result.nextEvent.date)}` : 'no upcoming planting day')
  return parts.join(', ')
}

function createMarkerElement(result) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'gr-marker'
  button.innerHTML = '<span class="gr-marker__pin" aria-hidden="true"></span>'
  button.addEventListener('click', (e) => {
    e.stopPropagation()
    emit('select', result.site.id)
  })
  return button
}

function syncMarkers() {
  const m = map.value
  if (!m) return
  const wanted = new Map(props.results.map((r) => [r.site.id, r]))

  for (const [id, marker] of markers) {
    if (!wanted.has(id)) {
      marker.remove()
      markers.delete(id)
    }
  }

  for (const [id, result] of wanted) {
    let marker = markers.get(id)
    if (!marker) {
      marker = new mapboxgl.Marker({ element: createMarkerElement(result), anchor: 'bottom' })
        .setLngLat([result.site.lng, result.site.lat])
        .addTo(m)
      markers.set(id, marker)
    }
    const el = marker.getElement()
    el.setAttribute('aria-label', markerLabel(result))
    el.setAttribute('aria-pressed', String(id === props.selectedId))
    el.classList.toggle('is-selected', id === props.selectedId)
    el.classList.toggle('is-highlighted', id === props.highlightedId)
  }
}

/**
 * Popup for the selected site. Built from DOM nodes with textContent — never
 * an HTML string — so a site or suburb name cannot inject markup.
 */
function buildPopup(result) {
  const box = document.createElement('div')
  box.className = 'gr-popup'

  const title = document.createElement('p')
  title.className = 'fw-semibold mb-1'
  title.textContent = result.site.name
  box.append(title)

  const meta = document.createElement('p')
  meta.className = 'small text-body-secondary mb-2'
  const bits = [result.site.suburb]
  if (result.distanceKm !== null && result.distanceKm !== undefined) bits.push(formatDistance(result.distanceKm))
  if (result.rating) bits.push(`★ ${formatRating(result.rating.average)} (${result.rating.count})`)
  meta.textContent = bits.join(' · ')
  box.append(meta)

  const next = document.createElement('p')
  next.className = 'small mb-2'
  next.textContent = result.nextEvent
    ? `Next: ${formatDateMedium(result.nextEvent.date)}, ${formatTime(result.nextEvent.startTime)}`
    : 'No upcoming planting day'
  box.append(next)

  const actions = document.createElement('div')
  actions.className = 'd-flex flex-wrap gap-2'

  const directions = document.createElement('button')
  directions.type = 'button'
  directions.className = 'btn btn-sm btn-primary'
  directions.textContent = 'Directions'
  directions.addEventListener('click', () => emit('directions', result.site.id))
  actions.append(directions)

  if (result.nextEvent) {
    const link = document.createElement('a')
    const href = router.resolve({ name: 'event-detail', params: { id: result.nextEvent.id } }).href
    link.href = href
    link.className = 'btn btn-sm btn-outline-primary'
    link.textContent = 'View planting day'
    link.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      router.push(href)
    })
    actions.append(link)
  }

  box.append(actions)
  return box
}

function syncPopup() {
  const m = map.value
  if (!m) return
  const result = props.results.find((r) => r.site.id === props.selectedId)
  // While a route is drawn the popup would sit on top of it; the orange
  // marker and the directions panel already say which site it is.
  if (!result || props.route) {
    popup?.remove()
    return
  }
  if (!popup) {
    // focusAfterOpen is off: choosing a site from the list must leave focus
    // in the list, not jump it into the map.
    popup = new mapboxgl.Popup({ offset: 36, closeOnClick: false, focusAfterOpen: false, maxWidth: '260px' })
  }
  popup.setLngLat([result.site.lng, result.site.lat]).setDOMContent(buildPopup(result))
  if (!popup.isOpen()) popup.addTo(m)
}

function syncOrigin() {
  const m = map.value
  if (!m) return
  if (!props.origin) {
    originMarker?.remove()
    originMarker = null
    return
  }
  const lngLat = [props.origin.lng, props.origin.lat]
  if (!originMarker) {
    const el = document.createElement('div')
    el.className = 'gr-origin'
    // A marker has to have a position before it is added to the map.
    originMarker = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(m)
  } else {
    originMarker.setLngLat(lngLat)
  }
  // Set after addTo, which otherwise replaces it with a generic "Map marker".
  const el = originMarker.getElement()
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `Starting point: ${props.origin.label}`)
}

function syncRoute() {
  const m = map.value
  if (!m || !m.isStyleLoaded()) return
  const source = m.getSource('route')
  const data = props.route?.geometry
    ? { type: 'Feature', properties: {}, geometry: props.route.geometry }
    : { type: 'FeatureCollection', features: [] }
  source?.setData(data)
  if (props.route) {
    m.setPaintProperty('route-line', 'line-color', ROUTE_COLOURS[props.route.mode] ?? ROUTE_COLOURS.cycling)
    m.setPaintProperty('route-line', 'line-dasharray', props.route.mode === 'walking' ? [1, 1.5] : [1, 0])
    const coords = props.route.geometry.coordinates.map(([lng, lat]) => ({ lng, lat }))
    const bounds = boundsOf(coords, 0.002)
    if (bounds) m.fitBounds(bounds, motion({ padding: 60, maxZoom: 15 }))
  }
}

function fitToResults() {
  const m = map.value
  if (!m || props.route) return
  const points = props.results.map((r) => ({ lng: r.site.lng, lat: r.site.lat }))
  if (props.origin) points.push(props.origin)
  const bounds = boundsOf(points)
  if (bounds) m.fitBounds(bounds, motion({ padding: 60, maxZoom: 14 }))
}

function focusSelected() {
  const m = map.value
  const result = props.results.find((r) => r.site.id === props.selectedId)
  if (!m || !result || props.route) return
  m.easeTo(motion({ center: [result.site.lng, result.site.lat], zoom: Math.max(m.getZoom(), 12.5) }))
}

onMounted(() => {
  try {
    map.value = new mapboxgl.Map({
      container: container.value,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: MELBOURNE_WEST,
      zoom: 10.5,
      // On a phone the map sits inside a scrolling page; one finger scrolls
      // the page and two move the map, so the page is never trapped.
      cooperativeGestures: true,
      // The page is in English; label the map the same way.
      language: 'en'
    })
  } catch {
    emit('error', 'This browser cannot display the map (WebGL is unavailable). The list still works.')
    return
  }

  const m = map.value
  m.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right')
  m.addControl(new mapboxgl.FullscreenControl(), 'top-right')
  m.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left')

  m.on('load', () => {
    m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    m.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 8 }
    })
    m.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ROUTE_COLOURS.cycling, 'line-width': 5 }
    })
    syncMarkers()
    syncOrigin()
    syncPopup()
    syncRoute()
    fitToResults()
  })

  m.on('error', (e) => {
    if (reportedError) return
    const status = e?.error?.status
    if (status === 401 || status === 403) {
      reportedError = true
      emit('error', 'The map could not load: this site’s Mapbox token was refused.')
    }
  })

  // Mapbox only watches the window. The map's own box changes size when the
  // filter panel opens or the layout reflows, so watch that as well.
  resizeObserver = new ResizeObserver(() => m.resize())
  resizeObserver.observe(container.value)

  // A page opened in a background tab finishes loading its tiles while the
  // browser is not painting it. Mapbox counts those frames as drawn, so on
  // switching to the tab the map shows its background colour and markers but
  // no streets until something moves it. Redraw once on becoming visible.
  document.addEventListener('visibilitychange', repaintWhenVisible)
})

function repaintWhenVisible() {
  if (document.visibilityState === 'visible') map.value?.triggerRepaint()
}

watch(() => props.results, () => { syncMarkers(); syncPopup() }, { deep: false })
watch(() => [props.selectedId, props.highlightedId], ([selected], [previous] = []) => {
  syncMarkers()
  syncPopup()
  if (selected && selected !== previous) focusSelected()
})
watch(() => props.origin, () => { syncOrigin(); syncMarkers(); fitToResults() })
watch(() => props.route, () => { syncRoute(); syncPopup() })
watch(() => props.fitKey, fitToResults)

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', repaintWhenVisible)
  resizeObserver?.disconnect()
  popup?.remove()
  map.value?.remove()
  markers.clear()
})
</script>

<template>
  <div
    ref="container"
    class="gr-map"
    role="region"
    aria-label="Map of planting sites. Every site on the map is also listed beside it."
  ></div>
</template>

<style scoped lang="scss">
.gr-map {
  width: 100%;
  height: 100%;
  min-height: 22rem;
  border-radius: 0.5rem;
  overflow: hidden;
}

:deep(.gr-marker) {
  width: 34px;
  height: 42px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid #0b5394;
    outline-offset: 2px;
    border-radius: 4px;
  }
}

// A teardrop pin with a white centre, drawn in CSS so it needs no image.
:deep(.gr-marker__pin) {
  position: relative;
  display: block;
  width: 30px;
  height: 30px;
  margin: 0 auto;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  background: var(--gr-green-700);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.35);
  transition: transform 0.15s ease;

  &::after {
    content: '';
    position: absolute;
    inset: 8px;
    border-radius: 50%;
    background: #fff;
  }
}

:deep(.gr-marker.is-highlighted .gr-marker__pin) {
  transform: rotate(-45deg) scale(1.2);
}

:deep(.gr-marker.is-selected .gr-marker__pin) {
  background: #e65100;
  transform: rotate(-45deg) scale(1.25);
}

:deep(.gr-origin) {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #0b5394;
  border: 3px solid #fff;
  box-shadow: 0 0 0 6px rgb(11 83 148 / 0.25);
}

:deep(.mapboxgl-popup-content) {
  padding: 0.75rem 0.9rem;
  font: inherit;
}

@media (prefers-reduced-motion: reduce) {
  :deep(.gr-marker__pin) {
    transition: none;
  }
}
</style>
