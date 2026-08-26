<script setup>
import { computed } from 'vue'

/**
 * Inline message block.
 *
 * `role` defaults to the right value for the variant: errors interrupt with
 * role="alert", everything else is announced politely as role="status".
 */
const props = defineProps({
  variant: { type: String, default: 'secondary' },
  title: { type: String, default: null },
  dismissible: { type: Boolean, default: false }
})

defineEmits(['dismiss'])

const role = computed(() => (props.variant === 'danger' ? 'alert' : 'status'))

const ICONS = {
  success: '✓',
  danger: '⚠',
  warning: '⚠',
  info: 'ℹ',
  secondary: 'ℹ'
}

const icon = computed(() => ICONS[props.variant] ?? ICONS.secondary)
</script>

<template>
  <div
    class="alert d-flex gap-2"
    :class="[`alert-${variant}`, dismissible ? 'alert-dismissible' : null]"
    :role="role"
  >
    <span aria-hidden="true">{{ icon }}</span>
    <div class="flex-grow-1">
      <p v-if="title" class="fw-semibold mb-1">{{ title }}</p>
      <div class="small mb-0"><slot /></div>
    </div>
    <button
      v-if="dismissible"
      type="button"
      class="btn-close"
      aria-label="Dismiss message"
      @click="$emit('dismiss')"
    ></button>
  </div>
</template>
