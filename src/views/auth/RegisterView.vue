<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import { useForm } from '@/composables/useForm'
import { describeAuthError } from '@/services/authService'
import AuthCard from '@/components/auth/AuthCard.vue'
import PasswordMeter from '@/components/auth/PasswordMeter.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseAlert from '@/components/base/BaseAlert.vue'
import {
  required, email as emailFormat, minLength, maxLength,
  strongPassword, matches, accepted
} from '@/utils/validators'

/**
 * Account registration (BR C.1).
 *
 * The form collects no role. Every account is created as a volunteer by
 * authService; a role field here — even a hidden one — would let anyone sign up
 * as an administrator, since everything on this page is under the visitor's
 * control. Promotion is an administrator action (BR C.2).
 */
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

/** Where to land after signing up, preserved from the guard that sent us here. */
const redirect = computed(() => {
  const target = route.query.redirect
  // Only same-site paths are followed. Accepting an arbitrary value would turn
  // this into an open redirect: a link to /register?redirect=https://evil… that
  // sends the user off-site straight after they have typed a password.
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? target
    : '/'
})

const form = useForm({
  initialValues: {
    firstName: '',
    lastName: '',
    emailAddress: '',
    password: '',
    confirmPassword: '',
    suburb: '',
    agree: false
  },
  schema: {
    firstName: [required('First name'), minLength(2, 'First name'), maxLength(40, 'First name')],
    lastName: [required('Last name'), minLength(2, 'Last name'), maxLength(40, 'Last name')],
    emailAddress: [required('Email address'), emailFormat(), maxLength(120, 'Email address')],
    password: [required('Password'), strongPassword()],
    confirmPassword: [
      required('Confirm password'),
      matches('password', 'Confirm password', 'the password')
    ],
    suburb: [maxLength(60, 'Suburb')],
    agree: [accepted('You need to agree to the code of conduct before joining.')]
  },
  async onSubmit(values) {
    try {
      await auth.register({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.emailAddress.trim(),
        password: values.password,
        suburb: values.suburb.trim()
      })
    } catch (err) {
      // Rethrown as a readable message so useForm can surface it; the Firebase
      // code itself means nothing to the person reading the screen.
      throw new Error(describeAuthError(err))
    }
    router.replace(redirect.value)
  }
})
</script>

<template>
  <AuthCard
    title="Create your account"
    subtitle="An account keeps your planting-day registrations together and lets you rate the days you attend."
  >
    <BaseAlert v-if="form.submitError.value" variant="danger" title="Could not create your account">
      {{ form.submitError.value }}
    </BaseAlert>

    <form novalidate @submit.prevent="form.handleSubmit">
      <div class="row g-0 gx-3">
        <div class="col-sm-6">
          <BaseInput
            label="First name"
            name="firstName"
            autocomplete="given-name"
            required
            v-bind="form.fieldProps('firstName')"
          />
        </div>
        <div class="col-sm-6">
          <BaseInput
            label="Last name"
            name="lastName"
            autocomplete="family-name"
            required
            v-bind="form.fieldProps('lastName')"
          />
        </div>
      </div>

      <BaseInput
        label="Email address"
        name="emailAddress"
        type="email"
        autocomplete="email"
        required
        hint="You will sign in with this address."
        v-bind="form.fieldProps('emailAddress')"
      />

      <BaseInput
        label="Suburb"
        name="suburb"
        autocomplete="address-level2"
        hint="Optional — helps us suggest planting days near you."
        v-bind="form.fieldProps('suburb')"
      />

      <BaseInput
        label="Password"
        name="password"
        type="password"
        autocomplete="new-password"
        required
        hint="At least 8 characters, including a letter and a number."
        v-bind="form.fieldProps('password')"
      />
      <PasswordMeter :password="form.values.password" />

      <BaseInput
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autocomplete="new-password"
        required
        v-bind="form.fieldProps('confirmPassword')"
      />

      <div class="form-check mb-3">
        <input
          id="field-agree"
          class="form-check-input"
          :class="{ 'is-invalid': form.errorFor('agree') }"
          type="checkbox"
          :checked="form.values.agree"
          :aria-invalid="form.errorFor('agree') ? 'true' : undefined"
          aria-describedby="agree-error"
          @change="form.values.agree = $event.target.checked"
          @blur="form.handleBlur('agree')"
        />
        <label class="form-check-label" for="field-agree">
          I agree to the volunteer code of conduct
          <span class="text-danger" aria-hidden="true">*</span>
          <span class="visually-hidden">(required)</span>
        </label>
        <p v-if="form.errorFor('agree')" id="agree-error" class="invalid-feedback d-block mb-0">
          <span aria-hidden="true">&#9888;</span> {{ form.errorFor('agree') }}
        </p>
      </div>

      <BaseButton
        type="submit"
        block
        :loading="form.submitting.value"
        loading-text="Creating your account…"
      >
        Create account
      </BaseButton>
    </form>

    <template #footer>
      Already have an account?
      <RouterLink :to="{ name: 'login', query: route.query }">Sign in</RouterLink>
    </template>
  </AuthCard>
</template>
