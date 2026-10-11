<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useAuthStore } from '@/stores/authStore'
import { describeAuthError } from '@/services/authService'

/**
 * "Verify your email address" (BR D.1).
 *
 * Shown under the header to anyone signed in with an unverified address —
 * which, because Google verifies its own, means a password account that has
 * not yet followed the link. Verification is what proves the address belongs
 * to the person using it, and the email features require it on the server.
 *
 * The banner checks again by itself when the tab regains focus, which is
 * what happens after someone clicks the link in another tab and comes back,
 * so they rarely need the "I've verified" button at all.
 */
const auth = useAuthStore()

const status = ref('')
const error = ref(null)
const sending = ref(false)
const checking = ref(false)
const cooldown = ref(0)
let timer = null

const visible = computed(() => auth.needsVerification)

function startCooldown(seconds = 60) {
  cooldown.value = seconds
  clearInterval(timer)
  timer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0) clearInterval(timer)
  }, 1000)
}

async function resend() {
  sending.value = true
  error.value = null
  status.value = ''
  try {
    await auth.resendVerification()
    status.value = `Sent. Check ${auth.account?.email} — and the junk folder.`
    // Firebase limits how often this can be sent; the countdown says so up
    // front instead of letting a second click fail with "too many requests".
    startCooldown()
  } catch (err) {
    error.value = describeAuthError(err)
  } finally {
    sending.value = false
  }
}

async function check({ quiet = false } = {}) {
  if (!auth.needsVerification) return
  checking.value = !quiet
  error.value = null
  try {
    const verified = await auth.refreshVerification()
    if (!verified && !quiet) status.value = 'Not verified yet. Open the link in the email, then try again.'
  } catch (err) {
    if (!quiet) error.value = describeAuthError(err)
  } finally {
    checking.value = false
  }
}

const onFocus = () => { if (document.visibilityState === 'visible') check({ quiet: true }) }

onMounted(() => document.addEventListener('visibilitychange', onFocus))
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onFocus)
  clearInterval(timer)
})
</script>

<template>
  <div v-if="visible" class="gr-verify border-bottom" role="region" aria-label="Email verification">
    <div class="gr-verify__inner d-flex flex-wrap align-items-center gap-2">
      <p class="mb-0 me-auto small">
        <strong>Verify your email address.</strong>
        We sent a link to {{ auth.account?.email }}. Until you follow it, you can't email
        yourself planting day details or send email to volunteers.
      </p>
      <button
        type="button"
        class="btn btn-sm btn-outline-primary"
        :disabled="sending || cooldown > 0"
        :aria-busy="sending ? 'true' : undefined"
        @click="resend"
      >
        {{ sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email' }}
      </button>
      <button
        type="button"
        class="btn btn-sm btn-primary"
        :disabled="checking"
        :aria-busy="checking ? 'true' : undefined"
        @click="check()"
      >
        {{ checking ? 'Checking…' : "I've verified" }}
      </button>
    </div>
    <p v-if="status || error" class="gr-verify__inner small mb-0 pb-2" :class="error ? 'text-danger' : ''" role="status">
      {{ error || status }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.gr-verify {
  background: #fff8e1;
}

.gr-verify__inner {
  max-width: var(--gr-container-max);
  margin-inline: auto;
  padding: 0.6rem 1rem;
}
</style>
