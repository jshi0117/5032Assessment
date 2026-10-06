<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import { useEmailStore } from '@/stores/emailStore'
import { useEventStore } from '@/stores/eventStore'
import BaseAlert from '@/components/base/BaseAlert.vue'
import { formatDateLong, formatTimeRange } from '@/utils/format'

/**
 * Compose an email to volunteers (BR D.2), sent by a Cloud Function (BR E.1).
 *
 * Built so a coordinator can do the common job — "here are the details for
 * Saturday" — in a few seconds: choosing a planting day fills in a subject and
 * a message and attaches its briefing PDF and calendar invite, generated on
 * the server. Anything can then be edited, and files added.
 *
 * Every rule the server enforces is also checked here as the user types, so
 * the Send button only enables when the server will accept the message. A
 * live preview shows exactly what recipients will receive, and the draft is
 * kept in this browser so a refresh or a wrong click loses nothing.
 */
const auth = useAuthStore()
const email = useEmailStore()
const events = useEventStore()
const route = useRoute()

const LIMITS = email.limits
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/

const form = reactive({
  to: [],
  subject: '',
  message: '',
  eventId: '',
  attachBriefing: true,
  copyToSelf: true
})
const files = ref([])
const recipientInput = ref('')
const fileError = ref(null)
const sendError = ref(null)
const sent = ref(null)
const draftSavedAt = ref(null)
const editedByHand = reactive({ subject: false, message: false })
const resultBox = ref(null)
const fileInput = ref(null)

onMounted(() => events.load())

/* ---------- Planting days and templates ---------- */

const plantingDays = computed(() =>
  events.events
    .filter((e) => !e.isPast && !['draft', 'cancelled'].includes(e.status))
    .filter((e) => auth.isAdmin || e.coordinatorId === auth.volunteerId)
    .sort((a, b) => a.date.localeCompare(b.date))
)

const chosenDay = computed(() => events.eventById(form.eventId))

const senderName = computed(() => auth.displayName || 'Your coordinator')

function templateFor(day) {
  return {
    subject: `Planting day: ${day.title}, ${formatDateLong(day.date)}`,
    message: [
      'Hi everyone,',
      '',
      `Thanks for signing up for ${day.title} on ${formatDateLong(day.date)}, ${formatTimeRange(day.startTime, day.endTime)}.`,
      '',
      `We meet at ${day.site.meetingPoint}. The attached briefing has what to bring and how to get there, and the calendar invite will remind you the evening before.`,
      '',
      'Reply to this email if you have any questions.',
      '',
      `See you there,\n${senderName.value}`
    ].join('\n')
  }
}

// Choosing a day fills in what the user has not written themselves; it never
// overwrites text they have typed.
watch(() => form.eventId, () => {
  const day = chosenDay.value
  if (!day || !plantingDays.value.some((d) => d.id === day.id)) return
  const template = templateFor(day)
  if (!editedByHand.subject || !form.subject.trim()) form.subject = template.subject
  if (!editedByHand.message || !form.message.trim()) form.message = template.message
  form.attachBriefing = true
})

/* ---------- Recipients ---------- */

function addRecipients(raw) {
  const candidates = String(raw).split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  for (const address of candidates) {
    if (!form.to.includes(address)) form.to.push(address)
  }
  recipientInput.value = ''
}

function onRecipientKey(event) {
  if (['Enter', ',', ';', 'Tab'].includes(event.key) && recipientInput.value.trim()) {
    if (event.key !== 'Tab') event.preventDefault()
    addRecipients(recipientInput.value)
  } else if (event.key === 'Backspace' && !recipientInput.value && form.to.length) {
    form.to.pop()
  }
}

function onRecipientPaste(event) {
  const text = event.clipboardData?.getData('text') ?? ''
  if (/[\s,;]/.test(text.trim())) {
    event.preventDefault()
    addRecipients(text)
  }
}

const invalidRecipients = computed(() => form.to.filter((a) => !EMAIL.test(a)))
const removeRecipient = (address) => { form.to = form.to.filter((a) => a !== address) }

/* ---------- Files ---------- */

const totalBytes = computed(() => files.value.reduce((sum, f) => sum + f.size, 0))
const attachmentCount = computed(() => files.value.length + (form.eventId && form.attachBriefing ? 2 : 0))

const formatBytes = (bytes) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`

function onFilesChosen(event) {
  fileError.value = null
  for (const file of event.target.files ?? []) {
    const extension = file.name.split('.').pop().toLowerCase()
    const allowed = email.attachmentTypes[file.type]
    if (!allowed || !allowed.includes(extension)) {
      fileError.value = `${file.name}: only PDF, PNG, JPG, CSV, TXT and ICS files can be attached.`
    } else if (files.value.length >= LIMITS.attachments) {
      fileError.value = `You can attach up to ${LIMITS.attachments} files.`
    } else if (totalBytes.value + file.size > LIMITS.attachmentBytes) {
      fileError.value = `${file.name} would take the attachments over 4 MB.`
    } else if (!files.value.some((f) => f.name === file.name && f.size === file.size)) {
      files.value.push(file)
    }
  }
  // Cleared so choosing the same file again after removing it still fires.
  event.target.value = ''
}

const removeFile = (file) => { files.value = files.value.filter((f) => f !== file) }

/* ---------- Validation ---------- */

const problems = computed(() => {
  const list = []
  if (!form.to.length) list.push('Add at least one recipient.')
  if (invalidRecipients.value.length) list.push(`Fix ${invalidRecipients.value.length === 1 ? 'the address' : 'the addresses'} marked in red.`)
  if (form.to.length > LIMITS.recipients) list.push(`Send to ${LIMITS.recipients} people or fewer at a time.`)
  if (!form.subject.trim()) list.push('Add a subject.')
  if (form.subject.length > LIMITS.subject) list.push(`Shorten the subject to ${LIMITS.subject} characters.`)
  if (!form.message.trim()) list.push('Write a message.')
  if (form.message.length > LIMITS.message) list.push(`Shorten the message to ${LIMITS.message} characters.`)
  if (!attachmentCount.value) list.push('Attach a planting day briefing or a file.')
  return list
})

const recipientTotal = computed(() =>
  form.to.length + (form.copyToSelf && !form.to.includes(auth.account?.email?.toLowerCase()) ? 1 : 0)
)

/* ---------- Draft ---------- */

const draftKey = computed(() => `compose-draft:${auth.account?.uid ?? 'anon'}`)

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey.value) ?? 'null')
    if (saved && typeof saved === 'object') {
      Object.assign(form, {
        to: Array.isArray(saved.to) ? saved.to.filter((a) => typeof a === 'string').slice(0, 50) : [],
        subject: String(saved.subject ?? ''),
        message: String(saved.message ?? ''),
        eventId: String(saved.eventId ?? ''),
        attachBriefing: saved.attachBriefing !== false,
        copyToSelf: saved.copyToSelf !== false
      })
      editedByHand.subject = Boolean(form.subject)
      editedByHand.message = Boolean(form.message)
      return true
    }
  } catch {
    // Unreadable or blocked storage: start with an empty form.
  }
  return false
}

let saveTimer = null
watch(form, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(draftKey.value, JSON.stringify(form))
      draftSavedAt.value = new Date()
    } catch {
      draftSavedAt.value = null
    }
  }, 600)
}, { deep: true })

function discardDraft() {
  try { localStorage.removeItem(draftKey.value) } catch { /* nothing to remove */ }
  Object.assign(form, { to: [], subject: '', message: '', eventId: '', attachBriefing: true, copyToSelf: true })
  files.value = []
  editedByHand.subject = editedByHand.message = false
  draftSavedAt.value = null
}

const savedLabel = computed(() =>
  draftSavedAt.value
    ? `Draft saved at ${draftSavedAt.value.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
    : ''
)

onMounted(() => {
  const restored = loadDraft()
  // ?event=evt-010 from a planting day pre-selects it, unless a draft is
  // already about another one.
  const fromLink = typeof route.query.event === 'string' ? route.query.event : ''
  if (fromLink && (!restored || !form.eventId)) form.eventId = fromLink
})

// Once the planting days have loaded, drop a choice that is not one of them —
// a day that has since finished, or one this coordinator does not run —
// rather than silently attaching its briefing.
watch(plantingDays, (days) => {
  if (events.loaded && form.eventId && !days.some((d) => d.id === form.eventId)) form.eventId = ''
}, { immediate: true })

/* ---------- Send ---------- */

async function send() {
  if (recipientInput.value.trim()) addRecipients(recipientInput.value)
  if (problems.value.length) return
  sendError.value = null
  sent.value = null
  try {
    const result = await email.sendComposed({
      to: form.to,
      subject: form.subject,
      message: form.message,
      eventId: form.eventId && form.attachBriefing ? form.eventId : undefined,
      files: files.value,
      copyToSelf: form.copyToSelf
    })
    sent.value = result
    discardDraft()
  } catch (err) {
    sendError.value = err.message
  }
  await nextTick()
  // Focus moves to the outcome so a keyboard or screen reader user hears it.
  resultBox.value?.focus()
}
</script>

<template>
  <div class="container gr-compose">
    <p class="text-body-secondary small mb-1">{{ auth.isAdmin ? 'Administrator' : 'Coordinator' }}</p>
    <div class="d-flex flex-wrap align-items-baseline justify-content-between gap-2 mb-1">
      <h1 class="h3 mb-0">Email volunteers</h1>
      <span class="small text-body-secondary" aria-live="polite">{{ savedLabel }}</span>
    </div>
    <p class="text-body-secondary mb-4">
      Each person gets their own copy, so nobody sees the other addresses. Replies come
      straight to {{ auth.account?.email }}.
    </p>

    <div ref="resultBox" tabindex="-1" class="gr-compose__result">
      <BaseAlert v-if="sent" variant="success" title="Email sent">
        Sent to {{ sent.recipients }} {{ sent.recipients === 1 ? 'person' : 'people' }} with
        {{ sent.attachments.length }} attachment{{ sent.attachments.length === 1 ? '' : 's' }}:
        {{ sent.attachments.join(', ') }}.
      </BaseAlert>
      <BaseAlert v-if="sendError" variant="danger" title="Not sent">
        {{ sendError }} Your message is still here.
      </BaseAlert>
    </div>

    <div class="row g-4">
      <!-- ============ Form ============ -->
      <form class="col-lg-7" novalidate @submit.prevent="send">
        <!-- Planting day -->
        <div class="mb-3">
          <label class="form-label" for="compose-event">Planting day</label>
          <select id="compose-event" v-model="form.eventId" class="form-select" aria-describedby="compose-event-hint">
            <option value="">None — I'll write my own</option>
            <option v-for="day in plantingDays" :key="day.id" :value="day.id">
              {{ formatDateLong(day.date) }} — {{ day.title }}
            </option>
          </select>
          <p id="compose-event-hint" class="form-text mb-0">
            Fills in a subject and message, and attaches the day's briefing and calendar invite.
          </p>
        </div>

        <!-- Recipients -->
        <div class="mb-3">
          <label class="form-label" for="compose-to">To</label>
          <div class="gr-compose__to form-control" :class="{ 'is-invalid': invalidRecipients.length }">
            <ul v-if="form.to.length" class="list-unstyled d-flex flex-wrap gap-1 mb-1" aria-label="Recipients">
              <li
                v-for="address in form.to"
                :key="address"
                class="badge rounded-pill d-inline-flex align-items-center gap-1"
                :class="invalidRecipients.includes(address) ? 'text-bg-danger' : 'text-bg-light border'"
              >
                <span>{{ address }}</span>
                <span v-if="invalidRecipients.includes(address)" class="visually-hidden">(not a valid address)</span>
                <button
                  type="button"
                  class="btn-close gr-compose__chip-close"
                  :aria-label="`Remove ${address}`"
                  @click="removeRecipient(address)"
                ></button>
              </li>
            </ul>
            <input
              id="compose-to"
              v-model="recipientInput"
              class="gr-compose__to-input"
              type="text"
              inputmode="email"
              autocomplete="off"
              aria-describedby="compose-to-hint"
              :placeholder="form.to.length ? 'Add another…' : 'name@example.com'"
              @keydown="onRecipientKey"
              @paste="onRecipientPaste"
              @blur="recipientInput.trim() && addRecipients(recipientInput)"
            />
          </div>
          <p id="compose-to-hint" class="form-text mb-0">
            Press Enter or comma after each address, or paste a list.
            {{ form.to.length }} of {{ LIMITS.recipients }}.
          </p>
        </div>

        <!-- Subject -->
        <div class="mb-3">
          <label class="form-label" for="compose-subject">Subject</label>
          <input
            id="compose-subject"
            v-model="form.subject"
            class="form-control"
            type="text"
            :maxlength="LIMITS.subject"
            aria-describedby="compose-subject-count"
            @input="editedByHand.subject = true"
          />
          <p id="compose-subject-count" class="form-text text-end mb-0">
            {{ form.subject.length }} / {{ LIMITS.subject }}
          </p>
        </div>

        <!-- Message -->
        <div class="mb-3">
          <label class="form-label" for="compose-message">Message</label>
          <textarea
            id="compose-message"
            v-model="form.message"
            class="form-control"
            rows="10"
            :maxlength="LIMITS.message"
            aria-describedby="compose-message-count"
            @input="editedByHand.message = true"
          ></textarea>
          <p id="compose-message-count" class="form-text text-end mb-0">
            {{ form.message.length }} / {{ LIMITS.message }}
          </p>
        </div>

        <!-- Attachments -->
        <fieldset class="mb-3">
          <legend class="form-label fs-6 mb-2">Attachments</legend>
          <div class="form-check mb-2">
            <input
              id="compose-briefing"
              v-model="form.attachBriefing"
              class="form-check-input"
              type="checkbox"
              :disabled="!form.eventId"
            />
            <label class="form-check-label" for="compose-briefing">
              Planting day briefing (PDF) and calendar invite (.ics)
              <span v-if="!form.eventId" class="text-body-secondary">— choose a planting day first</span>
            </label>
          </div>

          <label class="btn btn-sm btn-outline-secondary" for="compose-files">Add files…</label>
          <input
            id="compose-files"
            ref="fileInput"
            class="visually-hidden gr-compose__file"
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.ics,application/pdf,image/png,image/jpeg,text/csv,text/plain,text/calendar"
            aria-describedby="compose-files-hint"
            @change="onFilesChosen"
          />
          <p id="compose-files-hint" class="form-text mb-2">
            PDF, PNG, JPG, CSV, TXT or ICS · up to {{ LIMITS.attachments }} files, 4 MB in total.
            Tip: export the volunteer roster as CSV and attach it here.
          </p>
          <p v-if="fileError" class="small text-danger mb-2" role="alert">{{ fileError }}</p>
          <ul v-if="files.length" class="list-group list-group-flush small mb-0">
            <li v-for="file in files" :key="file.name + file.size" class="list-group-item d-flex align-items-center gap-2 px-0">
              <span class="text-truncate">{{ file.name }}</span>
              <span class="text-body-secondary text-nowrap">{{ formatBytes(file.size) }}</span>
              <button type="button" class="btn btn-sm btn-link text-danger ms-auto p-0" @click="removeFile(file)">
                Remove<span class="visually-hidden"> {{ file.name }}</span>
              </button>
            </li>
          </ul>
        </fieldset>

        <div class="form-check mb-3">
          <input id="compose-copy" v-model="form.copyToSelf" class="form-check-input" type="checkbox" />
          <label class="form-check-label" for="compose-copy">Send me a copy</label>
        </div>

        <div v-if="problems.length && (form.to.length || form.subject || form.message)" class="small text-body-secondary mb-2" id="compose-problems">
          <p class="mb-1">Before you can send:</p>
          <ul class="mb-0">
            <li v-for="problem in problems" :key="problem">{{ problem }}</li>
          </ul>
        </div>

        <div class="d-flex flex-wrap gap-2 align-items-center">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="email.composing || problems.length > 0"
            :aria-busy="email.composing ? 'true' : undefined"
            :aria-describedby="problems.length ? 'compose-problems' : undefined"
          >
            <span v-if="email.composing" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
            {{
              email.composing
                ? 'Sending…'
                : `Send to ${recipientTotal} ${recipientTotal === 1 ? 'person' : 'people'}`
            }}
          </button>
          <button type="button" class="btn btn-outline-secondary" :disabled="email.composing" @click="discardDraft">
            Discard draft
          </button>
        </div>
      </form>

      <!-- ============ Preview ============ -->
      <aside class="col-lg-5" aria-labelledby="preview-heading">
        <h2 id="preview-heading" class="h6 text-body-secondary mb-2">Preview</h2>
        <div class="card gr-compose__preview">
          <div class="card-body small">
            <dl class="gr-compose__headers mb-3">
              <dt>From</dt><dd>GreenRoots Melbourne</dd>
              <dt>Reply to</dt><dd>{{ auth.account?.email }}</dd>
              <dt>To</dt><dd>Each recipient separately</dd>
              <dt>Subject</dt><dd class="fw-semibold">{{ form.subject || '—' }}</dd>
            </dl>
            <div class="gr-compose__body">{{ form.message || 'Your message will appear here.' }}</div>
            <p class="text-body-secondary mt-3 mb-2">
              — Sent by {{ senderName }} through GreenRoots Melbourne.
            </p>
            <p v-if="attachmentCount" class="mb-0">
              <span class="fw-semibold">{{ attachmentCount }} attachment{{ attachmentCount === 1 ? '' : 's' }}:</span>
              <template v-if="chosenDay && form.attachBriefing"> briefing PDF, calendar invite</template><template v-if="chosenDay && form.attachBriefing && files.length">,</template>
              {{ files.map((f) => f.name).join(', ') }}
            </p>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gr-compose {
  padding-block: 2rem 4rem;
}

.gr-compose__result:focus {
  outline: none;
}

.gr-compose__to {
  cursor: text;

  &:focus-within {
    border-color: var(--gr-green-700);
    box-shadow: 0 0 0 0.25rem rgba(46, 125, 50, 0.25);
  }
}

.gr-compose__to-input {
  width: 100%;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
}

.gr-compose__chip-close {
  width: 0.5rem;
  height: 0.5rem;
  padding: 0.2rem;
  background-size: 0.5rem;
}

// The real file input is visually hidden but still focusable; its <label>
// is the visible button, so focus on the input outlines that button.
label[for='compose-files']:has(+ .gr-compose__file:focus-visible) {
  outline: 3px solid var(--gr-green-700);
  outline-offset: 2px;
}

.gr-compose__preview {
  @media (min-width: 992px) {
    position: sticky;
    top: 5rem;
  }
}

.gr-compose__headers {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  margin: 0;

  dt {
    font-weight: 400;
    color: var(--bs-secondary-color);
  }

  dd {
    margin: 0;
    word-break: break-word;
  }
}

.gr-compose__body {
  white-space: pre-wrap;
  border-top: 1px solid var(--bs-border-color);
  padding-top: 0.75rem;
}
</style>
