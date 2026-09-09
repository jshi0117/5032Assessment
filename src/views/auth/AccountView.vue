<script setup>
import { computed, ref } from 'vue'

import { useAuthStore } from '@/stores/authStore'
import { useForm } from '@/composables/useForm'
import { describeAuthError } from '@/services/authService'
import PasswordMeter from '@/components/auth/PasswordMeter.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseAlert from '@/components/base/BaseAlert.vue'
import {
  required, maxLength, strongPassword, matches, differsFrom
} from '@/utils/validators'

/**
 * The signed-in user's own account settings (BR C.1 — account management).
 *
 * Only what the account owner may change about themselves lives here. The role
 * is shown but not editable: changing it is an administrator action, and the
 * Firestore rules refuse it from this side regardless of what the page offers.
 */
const auth = useAuthStore()

const changed = ref(false)

const ROLE_LABELS = {
  volunteer: 'Volunteer',
  coordinator: 'Coordinator',
  admin: 'Administrator'
}

const roleLabel = computed(() => ROLE_LABELS[auth.role] ?? 'Volunteer')

const ROLE_NOTES = {
  volunteer: 'You can register for planting days and rate the ones you attend.',
  coordinator: 'You can also manage the planting days you run.',
  admin: 'You can manage every planting day and every account.'
}

const roleNote = computed(() => ROLE_NOTES[auth.role] ?? ROLE_NOTES.volunteer)

const form = useForm({
  initialValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  schema: {
    currentPassword: [required('Current password'), maxLength(128, 'Current password')],
    newPassword: [
      required('New password'),
      strongPassword('New password'),
      // Firebase would accept a change to the same value; saying "your password
      // was changed" when nothing changed is worse than refusing it.
      differsFrom('currentPassword', 'New password', 'your current password')
    ],
    confirmPassword: [
      required('Confirm new password'),
      matches('newPassword', 'Confirm new password', 'the new password')
    ]
  },
  async onSubmit(values) {
    changed.value = false
    try {
      await auth.changePassword(values.currentPassword, values.newPassword)
    } catch (err) {
      throw new Error(
        describeAuthError(err, {
          // The email is not in question on this form, so the shared wording
          // for these codes would point at the wrong field.
          'auth/wrong-password': 'Your current password is not correct.',
          'auth/invalid-credential': 'Your current password is not correct.',
          'auth/too-many-requests':
            'Too many attempts. Wait a few minutes before trying again.'
        })
      )
    }
    changed.value = true
    // Nothing on screen should still hold the old or the new password.
    form.reset()
  }
})
</script>

<template>
  <div class="container gr-account-page">
    <h1 class="h3 mb-1">Your account</h1>
    <p class="text-body-secondary mb-4">Manage how you sign in to GreenRoots Melbourne.</p>

    <div class="row g-4">
      <div class="col-lg-5">
        <section class="card h-100" aria-labelledby="details-heading">
          <div class="card-body">
            <h2 id="details-heading" class="h6 mb-3">Your details</h2>
            <dl class="row mb-0 small">
              <dt class="col-5 text-body-secondary fw-normal">Name</dt>
              <dd class="col-7">{{ auth.displayName }}</dd>

              <dt class="col-5 text-body-secondary fw-normal">Email</dt>
              <dd class="col-7 text-break">{{ auth.account?.email }}</dd>

              <dt class="col-5 text-body-secondary fw-normal">Suburb</dt>
              <dd class="col-7">{{ auth.profile?.suburb || '—' }}</dd>

              <dt class="col-5 text-body-secondary fw-normal">Role</dt>
              <dd class="col-7">
                <span class="badge text-bg-light">{{ roleLabel }}</span>
              </dd>
            </dl>
            <p class="form-text mt-3 mb-0">{{ roleNote }}</p>
            <p class="form-text mb-0">
              Only a coordinator can change your role.
            </p>
          </div>
        </section>
      </div>

      <div class="col-lg-7">
        <section class="card" aria-labelledby="password-heading">
          <div class="card-body">
            <h2 id="password-heading" class="h6 mb-3">Change your password</h2>

            <BaseAlert v-if="changed" variant="success" title="Password changed">
              Use your new password the next time you sign in.
            </BaseAlert>

            <BaseAlert
              v-if="form.submitError.value"
              variant="danger"
              title="Could not change your password"
            >
              {{ form.submitError.value }}
            </BaseAlert>

            <form novalidate @submit.prevent="form.handleSubmit">
              <BaseInput
                label="Current password"
                name="currentPassword"
                type="password"
                autocomplete="current-password"
                required
                hint="Confirming this stops someone at an unattended screen from locking you out of your own account."
                v-bind="form.fieldProps('currentPassword')"
              />

              <BaseInput
                label="New password"
                name="newPassword"
                type="password"
                autocomplete="new-password"
                required
                hint="At least 8 characters, including a letter and a number."
                v-bind="form.fieldProps('newPassword')"
              />
              <PasswordMeter :password="form.values.newPassword" />

              <BaseInput
                label="Confirm new password"
                name="confirmPassword"
                type="password"
                autocomplete="new-password"
                required
                v-bind="form.fieldProps('confirmPassword')"
              />

              <BaseButton
                type="submit"
                :loading="form.submitting.value"
                loading-text="Changing your password…"
              >
                Change password
              </BaseButton>
            </form>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gr-account-page {
  padding-block: 2rem 4rem;
}
</style>
