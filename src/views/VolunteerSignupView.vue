<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useEventStore } from '@/stores/eventStore'
import { useForm } from '@/composables/useForm'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseAlert from '@/components/base/BaseAlert.vue'
import { formatDateMedium, formatSpots, formatTimeRange, formatStatus } from '@/utils/format'
import {
  required, email as emailFormat, auMobile, minLength, maxLength,
  numberRange, atMost, matches, accepted
} from '@/utils/validators'

/**
 * Volunteer registration for a planting day (BR B.1).
 *
 * Carries all five kinds of validation the brief asks for, plus a sixth check
 * the form cannot make on its own: places requested against places actually
 * left, which eventService re-tests against live data on write.
 */
const route = useRoute()
const store = useEventStore()

const confirmation = ref(null)
const cancelled = ref(false)
const cancelling = ref(false)
const cancelError = ref(null)

onMounted(() => store.load())

/** Only events a person could actually join. */
const openEvents = computed(() =>
  store.upcoming.filter((e) => e.status === 'open' && !e.isFull)
)

const eventOptions = computed(() =>
  openEvents.value.map((e) => ({
    value: e.id,
    label: `${e.title} — ${formatDateMedium(e.date)} (${formatSpots(e.spotsLeft)})`
  }))
)

const suburbOptions = computed(() => store.suburbs)

const form = useForm({
  initialValues: {
    eventId: '',
    fullName: '',
    emailAddress: '',
    confirmEmail: '',
    phone: '',
    suburb: '',
    places: 1,
    notes: '',
    agree: false
  },
  schema: {
    // 1 — presence
    eventId: [required('Planting day')],
    fullName: [required('Full name'), minLength(2, 'Full name'), maxLength(60, 'Full name')],
    // 2 — format
    emailAddress: [required('Email address'), emailFormat()],
    // 5 — cross-field
    confirmEmail: [
      required('Confirm email address'),
      matches('emailAddress', 'Confirm email address', 'the email address above')
    ],
    phone: [required('Mobile number'), auMobile()],
    suburb: [required('Suburb')],
    // 4 — numeric range, with a ceiling read at validation time
    places: [
      required('Number of places'),
      numberRange(1, 10, 'Number of places'),
      // Declares the dependency so changing the planting day re-checks the
      // places field — otherwise the error text keeps quoting the old capacity.
      atMost(() => selectedEvent.value?.spotsLeft ?? 10, 'Number of places', ['eventId'])
    ],
    // 3 — length
    notes: [maxLength(200, 'Notes')],
    agree: [accepted('Please agree to the volunteer code of conduct before continuing.')]
  },
  onSubmit: async (values) => {
    // No accounts yet (BR C.1), so a registration is keyed by email address.
    const volunteerId = `guest:${values.emailAddress.trim().toLowerCase()}`
    // Only the id and the places booked are persisted; see eventService for why
    // the rest of the contact details are deliberately not stored on the device.
    const updated = await store.register(values.eventId, volunteerId, {
      places: Number(values.places)
    })
    confirmation.value = {
      eventId: updated.id,
      volunteerId,
      name: values.fullName.trim(),
      places: Number(values.places)
    }
    cancelled.value = false
  }
})

/** Read from the store rather than kept as a snapshot, so the numbers on the
 *  confirmation stay correct after an undo. */
const confirmedEvent = computed(() =>
  confirmation.value ? store.eventById(confirmation.value.eventId) : null
)

const selectedEvent = computed(() =>
  form.values.eventId ? store.eventById(form.values.eventId) : null
)

/**
 * Pre-selects the planting day when arriving from an event page.
 *
 * The id has to be one of the options actually offered: a link to a cancelled,
 * full or past event would otherwise select a value the dropdown does not
 * contain, leaving the field looking chosen but failing only on submit.
 */
const unavailableDeepLink = ref(null)

watch(
  () => [route.query.event, store.loaded],
  () => {
    const requested = route.query.event
    if (!requested || form.values.eventId) return

    if (openEvents.value.some((e) => e.id === requested)) {
      form.values.eventId = requested
      unavailableDeepLink.value = null
    } else if (store.eventById(requested)) {
      unavailableDeepLink.value = store.eventById(requested)
    }
  },
  { immediate: true }
)

const placesHint = computed(() =>
  selectedEvent.value
    ? `${formatSpots(selectedEvent.value.spotsLeft)} on this planting day.`
    : 'Between 1 and 10.'
)

/**
 * Undoes the registration just made.
 *
 * Possible without accounts because the record was created moments ago in this
 * same view, so its id is known — no guessing at who the visitor is.
 */
async function undoRegistration() {
  cancelling.value = true
  cancelError.value = null
  try {
    await store.cancelRegistration(confirmation.value.eventId, confirmation.value.volunteerId)
    cancelled.value = true
  } catch (err) {
    // Storage can refuse the write; saying nothing would show the place as
    // released while it is still booked after a reload.
    cancelError.value = err.message ?? 'That registration could not be cancelled.'
  } finally {
    cancelling.value = false
  }
}

function startAnother() {
  confirmation.value = null
  cancelled.value = false
  form.reset()
}
</script>

<template>
  <section>
    <header class="mb-4">
      <h1 class="h3 mb-2">Volunteer sign-up</h1>
      <p class="text-body-secondary mb-0">
        Register for a planting day. No experience is needed, and tools are
        provided at most sites.
      </p>
    </header>

    <!-- Confirmation replaces the form once a registration is stored -->
    <div v-if="confirmation" class="row">
      <div class="col-12 col-lg-8 col-xxl-6">
        <!-- Undone -->
        <template v-if="cancelled">
          <BaseAlert variant="secondary" title="Registration cancelled">
            <p class="mb-0">
              Your place at <strong>{{ confirmedEvent?.title }}</strong> has been
              released. Nothing is booked in your name for this planting day.
            </p>
          </BaseAlert>
          <BaseButton variant="primary" @click="startAnother">
            Register again
          </BaseButton>
        </template>

        <!-- Registered -->
        <template v-else>
          <BaseAlert variant="success" title="You're registered">
            <p class="mb-2">
              Thanks {{ confirmation.name }} — we've saved
              {{ confirmation.places }}
              {{ confirmation.places === 1 ? 'place' : 'places' }} for you at
              <strong>{{ confirmedEvent?.title }}</strong> on
              {{ formatDateMedium(confirmedEvent?.date) }}.
            </p>
            <p class="mb-0">
              Meet at {{ confirmedEvent?.site?.meetingPoint }}. Your registration
              is stored on this device, so it will still be here if you refresh
              or come back later.
            </p>
          </BaseAlert>

          <BaseAlert v-if="cancelError" variant="danger" title="We couldn't cancel that">
            {{ cancelError }}
          </BaseAlert>

          <!-- The running total, so the effect of registering is visible -->
          <div v-if="confirmedEvent" class="card mb-3">
            <div class="card-body">
              <h2 class="h6 text-uppercase text-body-secondary mb-3">
                This planting day now
              </h2>
              <p class="h5 mb-1">
                {{ confirmedEvent.registered }} of {{ confirmedEvent.capacity }}
                places taken
              </p>
              <p class="small text-body-secondary mb-3">
                {{ formatSpots(confirmedEvent.spotsLeft) }}
              </p>
              <div
                class="progress"
                role="img"
                :aria-label="`${confirmedEvent.registered} of ${confirmedEvent.capacity} places taken`"
              >
                <div
                  class="progress-bar"
                  :style="{ width: `${Math.round((confirmedEvent.registered / confirmedEvent.capacity) * 100)}%` }"
                ></div>
              </div>
            </div>
          </div>

          <div class="d-flex flex-column flex-sm-row flex-wrap gap-2">
            <RouterLink
              class="btn btn-primary"
              :to="{ name: 'event-detail', params: { id: confirmation.eventId } }"
            >
              View planting day
            </RouterLink>
            <BaseButton variant="outline-secondary" @click="startAnother">
              Register for another day
            </BaseButton>
            <BaseButton
              variant="outline-danger"
              :loading="cancelling"
              loading-text="Cancelling…"
              @click="undoRegistration"
            >
              Cancel this registration
            </BaseButton>
          </div>
        </template>
      </div>
    </div>

    <div v-else class="row g-4">
      <div class="col-12 col-lg-7">
        <form class="gr-signup-form" novalidate @submit.prevent="form.handleSubmit">
          <BaseAlert
            v-if="unavailableDeepLink"
            variant="warning"
            title="That planting day isn't open"
          >
            {{ unavailableDeepLink.title }} can no longer be joined
            ({{ formatStatus(unavailableDeepLink.displayStatus).toLowerCase() }}).
            Choose another planting day below.
          </BaseAlert>

          <BaseAlert v-if="form.submitError.value" variant="danger" title="We couldn't save that">
            {{ form.submitError.value }}
          </BaseAlert>

          <BaseSelect
            label="Planting day"
            name="eventId"
            required
            :options="eventOptions"
            placeholder="Choose a planting day…"
            v-bind="form.fieldProps('eventId')"
          />

          <BaseInput
            label="Full name"
            name="fullName"
            required
            autocomplete="name"
            v-bind="form.fieldProps('fullName')"
          />

          <BaseInput
            label="Email address"
            name="emailAddress"
            type="email"
            required
            autocomplete="email"
            hint="We'll send the site briefing here."
            v-bind="form.fieldProps('emailAddress')"
          />

          <BaseInput
            label="Confirm email address"
            name="confirmEmail"
            type="email"
            required
            v-bind="form.fieldProps('confirmEmail')"
          />

          <BaseInput
            label="Mobile number"
            name="phone"
            type="tel"
            required
            autocomplete="tel"
            placeholder="0412 345 678"
            v-bind="form.fieldProps('phone')"
          />

          <BaseSelect
            label="Suburb"
            name="suburb"
            required
            :options="suburbOptions"
            v-bind="form.fieldProps('suburb')"
          />

          <BaseInput
            label="Number of places"
            name="places"
            type="number"
            required
            min="1"
            max="10"
            :hint="placesHint"
            v-bind="form.fieldProps('places')"
          />

          <BaseInput
            label="Anything we should know? (optional)"
            name="notes"
            :hint="`${String(form.values.notes || '').length} of 200 characters`"
            v-bind="form.fieldProps('notes')"
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
            <p
              v-if="form.errorFor('agree')"
              id="agree-error"
              class="invalid-feedback d-block mb-0"
            >
              <span aria-hidden="true">&#9888;</span> {{ form.errorFor('agree') }}
            </p>
          </div>

          <!--
            Deliberately not disabled while the form is invalid. A disabled
            submit gives no reason for being disabled; leaving it active lets
            handleSubmit mark every field touched, reveal all the errors at once
            and move focus to the first one.
          -->
          <BaseButton
            type="submit"
            block
            :loading="form.submitting.value"
            loading-text="Saving your place…"
          >
            Register for this planting day
          </BaseButton>

          <p class="form-text mt-2 mb-0">
            Fields marked <span aria-hidden="true">*</span
            ><span class="visually-hidden">with an asterisk</span> are required.
          </p>
        </form>
      </div>

      <!-- Live summary of the chosen day -->
      <aside class="col-12 col-lg-5">
        <div class="card gr-summary" :class="{ 'gr-summary--empty': !selectedEvent }">
          <div class="card-body">
            <h2 class="h6 text-uppercase text-body-secondary mb-3">
              Your planting day
            </h2>

            <template v-if="selectedEvent">
              <p class="fw-semibold mb-1">{{ selectedEvent.title }}</p>
              <p class="small text-body-secondary mb-3">
                {{ formatDateMedium(selectedEvent.date) }} ·
                {{ formatTimeRange(selectedEvent.startTime, selectedEvent.endTime) }}
              </p>

              <dl class="row small mb-0">
                <dt class="col-5 fw-normal text-body-secondary">Meet at</dt>
                <dd class="col-7 mb-2">{{ selectedEvent.site?.meetingPoint }}</dd>

                <dt class="col-5 fw-normal text-body-secondary">Suburb</dt>
                <dd class="col-7 mb-2">
                  {{ selectedEvent.site?.suburb }} {{ selectedEvent.site?.postcode }}
                </dd>

                <dt class="col-5 fw-normal text-body-secondary">Places left</dt>
                <dd class="col-7 mb-2 fw-semibold">
                  {{ formatSpots(selectedEvent.spotsLeft) }}
                </dd>

                <dt class="col-5 fw-normal text-body-secondary">Planting</dt>
                <dd class="col-7 mb-0">
                  {{ (selectedEvent.site?.species ?? []).join(', ') }}
                </dd>
              </dl>
            </template>
            <p v-else class="small text-body-secondary mb-0">
              Choose a planting day above and its meeting point, suburb and
              remaining places will appear here.
            </p>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints' as bp;

/*
 * A text input wider than about 35rem is harder to scan, not easier, so the
 * form is capped even though its column is wider.
 */
.gr-signup-form {
  max-width: 34rem;
}

.gr-summary {
  @include bp.up(lg) {
    position: sticky;
    top: 5rem;
  }
}

/* The empty state is the same card, drawn as an outline so it reads as a
   placeholder rather than as missing content. */
.gr-summary--empty {
  border-style: dashed;
  background-color: transparent;
}
</style>
