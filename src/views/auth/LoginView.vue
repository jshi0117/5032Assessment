<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import { useForm } from '@/composables/useForm'
import { describeAuthError } from '@/services/authService'
import AuthCard from '@/components/auth/AuthCard.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseAlert from '@/components/base/BaseAlert.vue'
import { required, email as emailFormat, maxLength } from '@/utils/validators'

/**
 * Sign-in (BR C.1).
 *
 * The password field carries presence and length rules only. A strength rule
 * here would be wrong twice over: it would reject a valid older password, and
 * it would tell an attacker what the password policy is before they have an
 * account.
 */
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const redirect = computed(() => {
  const target = route.query.redirect
  // Same-site paths only — see RegisterView for why.
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? target
    : '/'
})

/** Set when a guard sent the visitor here, so the page can say why. */
const wasRedirected = computed(() => typeof route.query.redirect === 'string')

const form = useForm({
  initialValues: { emailAddress: '', password: '' },
  schema: {
    emailAddress: [required('Email address'), emailFormat(), maxLength(120, 'Email address')],
    password: [required('Password'), maxLength(128, 'Password')]
  },
  async onSubmit(values) {
    try {
      await auth.login(values.emailAddress.trim(), values.password)
    } catch (err) {
      throw new Error(describeAuthError(err))
    }
    router.replace(redirect.value)
  }
})
</script>

<template>
  <AuthCard title="Sign in" subtitle="Welcome back to GreenRoots Melbourne.">
    <BaseAlert v-if="wasRedirected" variant="info">
      Sign in to continue to that page.
    </BaseAlert>

    <BaseAlert v-if="form.submitError.value" variant="danger" title="Could not sign you in">
      {{ form.submitError.value }}
    </BaseAlert>

    <form novalidate @submit.prevent="form.handleSubmit">
      <BaseInput
        label="Email address"
        name="emailAddress"
        type="email"
        autocomplete="email"
        required
        v-bind="form.fieldProps('emailAddress')"
      />

      <BaseInput
        label="Password"
        name="password"
        type="password"
        autocomplete="current-password"
        required
        v-bind="form.fieldProps('password')"
      />

      <p class="small mb-3">
        <RouterLink :to="{ name: 'forgot-password' }">Forgotten your password?</RouterLink>
      </p>

      <BaseButton
        type="submit"
        block
        :loading="form.submitting.value"
        loading-text="Signing you in…"
      >
        Sign in
      </BaseButton>
    </form>

    <template #footer>
      New to GreenRoots?
      <RouterLink :to="{ name: 'register', query: route.query }">Create an account</RouterLink>
    </template>
  </AuthCard>
</template>
