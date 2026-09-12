<script setup>
import { computed, ref, watch } from 'vue'

import { useAuthStore } from '@/stores/authStore'
import { useForm } from '@/composables/useForm'
import { describeAuthError } from '@/services/authService'
import PasswordMeter from '@/components/auth/PasswordMeter.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseAlert from '@/components/base/BaseAlert.vue'
import {
  required, minLength, maxLength, strongPassword, matches, differsFrom
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
const detailsSaved = ref(false)

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

/**
 * Editing your own name and suburb.
 *
 * The fields the account holder owns, and only those. There is no role field
 * and no email field: the role belongs to an administrator, and changing the
 * sign-in address is a credential change that has to go through Firebase
 * Authentication with its own verification, not a profile edit. The Firestore
 * rules refuse a write that touches either, so the omission is enforced rather
 * than merely respected.
 */
const detailsForm = useForm({
  initialValues: {
    firstName: auth.profile?.firstName ?? '',
    lastName: auth.profile?.lastName ?? '',
    suburb: auth.profile?.suburb ?? ''
  },
  schema: {
    firstName: [required('First name'), minLength(2, 'First name'), maxLength(40, 'First name')],
    lastName: [required('Last name'), minLength(2, 'Last name'), maxLength(40, 'Last name')],
    suburb: [maxLength(60, 'Suburb')]
  },
  async onSubmit(values) {
    detailsSaved.value = false
    try {
      await auth.updateProfileDetails({
        firstName: values.firstName,
        lastName: values.lastName,
        suburb: values.suburb
      })
    } catch (err) {
      throw new Error(
        describeAuthError(err, {
          'permission-denied': 'You do not have permission to change those details.'
        })
      )
    }
    // Sanitising happens at the write boundary, so the stored value can differ
    // from what was typed — collapsed spacing, for one. Putting the saved
    // version back in the fields keeps the form honest about what was kept.
    detailsForm.reset({
      firstName: auth.profile?.firstName ?? '',
      lastName: auth.profile?.lastName ?? '',
      suburb: auth.profile?.suburb ?? ''
    })
    detailsSaved.value = true
  }
})

/**
 * The profile can arrive after this page has mounted — a hard refresh has to
 * wait for Firebase to restore the session first. Filling the form then would
 * overwrite whatever the user had already typed, so it only refills while the
 * form is still untouched.
 */
watch(
  () => auth.profile,
  (profile) => {
    if (!profile) return
    if (Object.keys(detailsForm.touched).length) return
    detailsForm.reset({
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      suburb: profile.suburb ?? ''
    })
    detailsSaved.value = false
  }
)

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

            <BaseAlert v-if="detailsSaved" variant="success" title="Details saved">
              Your name and suburb have been updated.
            </BaseAlert>

            <BaseAlert
              v-if="detailsForm.submitError.value"
              variant="danger"
              title="Could not save your details"
            >
              {{ detailsForm.submitError.value }}
            </BaseAlert>

            <form novalidate @submit.prevent="detailsForm.handleSubmit">
              <BaseInput
                label="First name"
                name="firstName"
                autocomplete="given-name"
                required
                v-bind="detailsForm.fieldProps('firstName')"
              />

              <BaseInput
                label="Last name"
                name="lastName"
                autocomplete="family-name"
                required
                v-bind="detailsForm.fieldProps('lastName')"
              />

              <BaseInput
                label="Suburb"
                name="suburb"
                autocomplete="address-level2"
                hint="Optional — helps us suggest planting days near you."
                v-bind="detailsForm.fieldProps('suburb')"
              />

              <BaseButton
                type="submit"
                :loading="detailsForm.submitting.value"
                loading-text="Saving…"
              >
                Save details
              </BaseButton>
            </form>

            <hr />

            <dl class="row mb-0 small">
              <!-- Read-only on purpose: see the comment on detailsForm. -->
              <dt class="col-5 text-body-secondary fw-normal">Email</dt>
              <dd class="col-7 text-break mb-2">{{ auth.account?.email }}</dd>

              <dt class="col-5 text-body-secondary fw-normal">Role</dt>
              <dd class="col-7 mb-0">
                <span class="badge text-bg-light">{{ roleLabel }}</span>
              </dd>
            </dl>
            <p class="form-text mt-2 mb-0">{{ roleNote }}</p>
            <p class="form-text mb-0">
              Your sign-in address and your role cannot be changed here. Ask an
              administrator to change your role.
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
