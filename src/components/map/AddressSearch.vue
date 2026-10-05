<script setup>
import { computed, onBeforeUnmount, ref, useId } from 'vue'

/**
 * Address autocomplete (BR E.2), following the WAI-ARIA combobox pattern.
 *
 * Typing asks the geocoder for suggestions after a short pause; ↓/↑ move
 * through them, Enter picks one, Escape closes the list. The input keeps focus
 * throughout and `aria-activedescendant` tells a screen reader which option is
 * highlighted, so it reads the same way a native select would.
 *
 * Network behaviour: requests wait 300 ms after the last keystroke, need three
 * characters, and each new one aborts the last. Without that, typing an address
 * fires a request per letter and the answers can arrive out of order.
 */
const props = defineProps({
  label: { type: String, required: true },
  /** `(query, { signal }) => Promise<Place[]>` */
  search: { type: Function, required: true },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['select'])

const uid = useId()
const listId = `${uid}-list`
const query = ref('')
const results = ref([])
const open = ref(false)
const active = ref(-1)
const busy = ref(false)
const error = ref(null)

let timer = null
let controller = null

const optionId = (index) => `${uid}-opt-${index}`

const statusText = computed(() => {
  if (busy.value) return 'Searching…'
  if (error.value) return error.value
  if (open.value && query.value.trim().length >= 3) {
    return results.value.length
      ? `${results.value.length} suggestion${results.value.length === 1 ? '' : 's'}. Use the arrow keys to choose.`
      : 'No matching places in greater Melbourne.'
  }
  return ''
})

function onInput() {
  clearTimeout(timer)
  error.value = null
  active.value = -1
  if (query.value.trim().length < 3) {
    controller?.abort()
    results.value = []
    open.value = false
    return
  }
  timer = setTimeout(runSearch, 300)
}

async function runSearch() {
  controller?.abort()
  controller = new AbortController()
  busy.value = true
  try {
    results.value = await props.search(query.value, { signal: controller.signal })
    open.value = true
  } catch (err) {
    if (err.name === 'AbortError') return
    results.value = []
    error.value = err.message ?? 'Search failed.'
    open.value = false
  } finally {
    busy.value = false
  }
}

function choose(place) {
  query.value = place.label
  results.value = []
  open.value = false
  active.value = -1
  emit('select', place)
}

function onKeydown(event) {
  if (event.key === 'ArrowDown' && results.value.length) {
    event.preventDefault()
    open.value = true
    active.value = (active.value + 1) % results.value.length
  } else if (event.key === 'ArrowUp' && results.value.length) {
    event.preventDefault()
    open.value = true
    active.value = active.value <= 0 ? results.value.length - 1 : active.value - 1
  } else if (event.key === 'Enter') {
    if (open.value && active.value >= 0) {
      event.preventDefault()
      choose(results.value[active.value])
    } else if (open.value && results.value.length === 1) {
      event.preventDefault()
      choose(results.value[0])
    }
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    open.value = false
    active.value = -1
  }
}

// Closed on blur after a tick, so a click on an option lands before the list
// disappears from under it.
function onBlur() {
  setTimeout(() => { open.value = false }, 150)
}

/** Lets the parent show a chosen place's name without reopening the list. */
function setText(text) {
  query.value = text ?? ''
  results.value = []
  open.value = false
}

defineExpose({ setText })

onBeforeUnmount(() => {
  clearTimeout(timer)
  controller?.abort()
})
</script>

<template>
  <div class="gr-address position-relative">
    <label class="form-label small mb-1" :for="`${uid}-input`">{{ label }}</label>
    <input
      :id="`${uid}-input`"
      v-model="query"
      class="form-control form-control-sm"
      type="text"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      aria-autocomplete="list"
      :aria-expanded="open && results.length > 0"
      :aria-controls="listId"
      :aria-activedescendant="active >= 0 ? optionId(active) : undefined"
      :aria-describedby="`${uid}-status`"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
      @focus="results.length && (open = true)"
    />
    <ul
      v-show="open && results.length"
      :id="listId"
      class="gr-address__list list-unstyled shadow-sm"
      role="listbox"
      :aria-label="`${label} suggestions`"
    >
      <li
        v-for="(place, index) in results"
        :id="optionId(index)"
        :key="place.id"
        role="option"
        class="gr-address__option"
        :class="{ 'is-active': index === active }"
        :aria-selected="index === active"
        @mousedown.prevent="choose(place)"
        @mousemove="active = index"
      >
        <span class="d-block">{{ place.name }}</span>
        <span class="d-block small text-body-secondary">{{ place.detail }}</span>
      </li>
    </ul>
    <p
      :id="`${uid}-status`"
      class="small mb-0 mt-1"
      :class="error ? 'text-danger' : 'visually-hidden'"
      role="status"
      aria-live="polite"
    >
      {{ statusText }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.gr-address__list {
  position: absolute;
  z-index: 20;
  inset-inline: 0;
  margin: 0.25rem 0 0;
  padding: 0.25rem 0;
  max-height: 16rem;
  overflow-y: auto;
  background: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color);
  border-radius: 0.375rem;
}

.gr-address__option {
  padding: 0.4rem 0.75rem;
  cursor: pointer;

  &.is-active {
    background: var(--gr-green-100);
    outline: 2px solid var(--gr-green-700);
    outline-offset: -2px;
  }
}
</style>
