<script setup>
import { computed } from 'vue'

/**
 * Button with a busy state.
 *
 * While loading the control stays in the tab order but is disabled, and the
 * change is announced rather than shown only as a spinner.
 */
const props = defineProps({
  type: { type: String, default: 'button' },
  variant: { type: String, default: 'primary' },
  size: { type: String, default: null },
  block: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  loadingText: { type: String, default: 'Working…' },
  disabled: { type: Boolean, default: false }
})

defineEmits(['click'])

const classes = computed(() => [
  'btn',
  `btn-${props.variant}`,
  props.size ? `btn-${props.size}` : null,
  props.block ? 'w-100' : null
])
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
    @click="$emit('click', $event)"
  >
    <span
      v-if="loading"
      class="spinner-border spinner-border-sm me-2"
      aria-hidden="true"
    ></span>
    <span v-if="loading">{{ loadingText }}</span>
    <slot v-else />
  </button>
</template>
