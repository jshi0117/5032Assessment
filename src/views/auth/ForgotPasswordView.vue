<script setup>
import { useAuthStore } from '@/stores/authStore'
import { useForm } from '@/composables/useForm'
import { describeAuthError } from '@/services/authService'
import AuthCard from '@/components/auth/AuthCard.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseAlert from '@/components/base/BaseAlert.vue'
import { required, email as emailFormat, maxLength } from '@/utils/validators'

/**
 * Password reset request (BR C.1 — account management).
 *
 * The confirmation is deliberately the same whether or not the address has an
 * account. Saying "no account found" would make this form a way of discovering
 * which addresses are registered here, which is a disclosure the reset feature
 * does not need to make; authService swallows that error for the same reason.
 */
const auth = useAuthStore()

const form = useForm({
  initialValues: { emailAddress: '' },
  schema: {
    emailAddress: [required('Email address'), emailFormat(), maxLength(120, 'Email address')]
  },
  async onSubmit(values) {
    try {
      await auth.requestPasswordReset(values.emailAddress.trim())
    } catch (err) {
      throw new Error(describeAuthError(err))
    }
  }
})
</script>

<template>
  <AuthCard
    title="Reset your password"
    subtitle="We will email you a link to choose a new one."
  >
    <BaseAlert v-if="form.submitted.value" variant="success" title="Check your inbox">
      If an account exists for that address, a reset link is on its way. The link
      expires after an hour.
    </BaseAlert>

    <template v-else>
      <BaseAlert v-if="form.submitError.value" variant="danger" title="Could not send the email">
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

        <BaseButton
          type="submit"
          block
          :loading="form.submitting.value"
          loading-text="Sending…"
        >
          Send reset link
        </BaseButton>
      </form>
    </template>

    <template #footer>
      <RouterLink :to="{ name: 'login' }">Back to sign in</RouterLink>
    </template>
  </AuthCard>
</template>
