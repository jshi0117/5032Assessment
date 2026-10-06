<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import { useEmailStore } from '@/stores/emailStore'

/**
 * "Email me these details" (BR D.2).
 *
 * One press: a Cloud Function emails the signed-in user the planting day's
 * briefing as a PDF and a calendar invitation (.ics). There is no address to
 * type — it always goes to the account's own address, which the panel shows
 * before sending so nobody wonders where it went.
 */
const props = defineProps({
  eventId: { type: String, required: true }
})

const auth = useAuthStore()
const email = useEmailStore()
const route = useRoute()

const result = ref(null)
const error = ref(null)

const busy = computed(() => email.sendingDetailsFor === props.eventId)

async function send() {
  result.value = null
  error.value = null
  try {
    result.value = await email.emailEventDetails(props.eventId)
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <div class="gr-email-details">
    <template v-if="auth.isAuthenticated">
      <button
        type="button"
        class="btn btn-outline-primary btn-sm"
        :disabled="busy"
        :aria-busy="busy ? 'true' : undefined"
        @click="send"
      >
        <span v-if="busy" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
        {{ busy ? 'Sending…' : 'Email me these details' }}
      </button>
      <p class="form-text mb-0">
        Sends the briefing (PDF) and a calendar invite to {{ auth.account?.email }}.
      </p>
    </template>
    <p v-else class="small mb-0">
      <RouterLink :to="{ name: 'login', query: { redirect: route.fullPath } }">Sign in</RouterLink>
      to email yourself the briefing and a calendar invite.
    </p>

    <!-- Both outcomes are announced: success politely, failure assertively. -->
    <p v-if="result" class="alert alert-success small py-2 mt-2 mb-0" role="status">
      Sent to {{ result.sentTo }} with {{ result.attachments.length }} attachments. It can take a minute
      to arrive — check your junk folder if it does not.
    </p>
    <p v-if="error" class="alert alert-danger small py-2 mt-2 mb-0" role="alert">{{ error }}</p>
  </div>
</template>
