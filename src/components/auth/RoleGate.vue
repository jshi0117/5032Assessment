<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'

/**
 * Shows its content only to the roles listed (BR C.2).
 *
 * The second of three layers, not the only one. The route guard keeps people
 * off whole pages; this keeps individual controls off a page they are otherwise
 * allowed on; the Firestore rules refuse the write regardless. Hiding a button
 * is presentation, never protection — anyone can call the function it would
 * have called.
 *
 * The `denied` slot is for the cases where saying nothing would be confusing,
 * such as an empty panel with no explanation for why it is empty.
 */
const props = defineProps({
  /** Roles allowed to see the content. Empty means any signed-in user. */
  roles: { type: Array, default: () => [] }
})

const auth = useAuthStore()

const allowed = computed(() => auth.hasRole(props.roles))
</script>

<template>
  <slot v-if="allowed" />
  <slot v-else name="denied" />
</template>
