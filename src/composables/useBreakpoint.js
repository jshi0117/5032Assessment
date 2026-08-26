import { ref, computed, onMounted, onUnmounted } from 'vue'

/**
 * Tracks the active responsive band.
 *
 * The four bands BR A.2 is graded against are xs / sm / lg / xxl; md and xl are
 * carried as well so nothing is left undefined between them.
 *
 * Backed by matchMedia rather than a resize listener, so it fires only when a
 * boundary is actually crossed instead of on every pixel of a drag.
 */
const TIERS = [
  { name: 'xs', min: 0 },
  { name: 'sm', min: 576 },
  { name: 'md', min: 768 },
  { name: 'lg', min: 992 },
  { name: 'xl', min: 1200 },
  { name: 'xxl', min: 1400 }
]

export function useBreakpoint() {
  const width = ref(typeof window === 'undefined' ? 0 : window.innerWidth)
  const queries = []

  const sync = () => { width.value = window.innerWidth }

  onMounted(() => {
    // One listener per boundary; each fires only when that boundary is crossed.
    TIERS.filter((t) => t.min > 0).forEach((t) => {
      const mq = window.matchMedia(`(min-width: ${t.min}px)`)
      mq.addEventListener('change', sync)
      queries.push({ mq, handler: sync })
    })
    sync()
  })

  onUnmounted(() => {
    queries.forEach(({ mq, handler }) => mq.removeEventListener('change', handler))
  })

  const current = computed(() => {
    let name = 'xs'
    for (const tier of TIERS) {
      if (width.value >= tier.min) name = tier.name
    }
    return name
  })

  /** Label naming the BR A.2 band, for the dev badge. */
  const bandLabel = computed(() => {
    const w = width.value
    if (w < 576) return `${w}px · xs · BR band "< 576"`
    if (w < 768) return `${w}px · sm · BR band "576–768"`
    if (w < 992) return `${w}px · md`
    if (w < 1200) return `${w}px · lg · BR band "992–1200"`
    if (w < 1400) return `${w}px · xl`
    return `${w}px · xxl · BR band "> 1400"`
  })

  const isMobile = computed(() => width.value < 768)
  const isDesktop = computed(() => width.value >= 992)

  return { width, current, bandLabel, isMobile, isDesktop }
}
