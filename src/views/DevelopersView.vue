<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

import { useEventStore } from '@/stores/eventStore'
import { API_BASE, tryRequest } from '@/services/publicApi'

/**
 * Developer documentation for the public API (BR F.1 — API access).
 *
 * The reference a third party needs — endpoints, parameters, response shape,
 * limits, errors — plus a "Try it" panel that sends a real request to the live
 * API from this page and shows exactly what came back.
 */
const events = useEventStore()
onMounted(() => events.load())

const ENDPOINTS = [
  {
    id: 'events',
    method: 'GET',
    path: '/events',
    summary: 'List published planting days, earliest first. Drafts are never included.',
    params: [
      ['suburb', 'string', 'Exact suburb, any case — e.g. Braybrook'],
      ['site', 'string', 'Site id — e.g. site-03'],
      ['activity', 'string', 'Matches part of the activity — e.g. planting'],
      ['from', 'date', 'Only days on or after this date (YYYY-MM-DD)'],
      ['to', 'date', 'Only days on or before this date (YYYY-MM-DD)'],
      ['upcoming', 'boolean', 'true for days still to come, false for past days'],
      ['familyFriendly', 'boolean', 'true for days suitable for children'],
      ['limit', 'integer', 'Page size, 1–100 (default 20)'],
      ['offset', 'integer', 'Items to skip, for the next page (default 0)']
    ]
  },
  { id: 'event', method: 'GET', path: '/events/{id}', summary: 'One planting day by id.', params: [] },
  {
    id: 'sites',
    method: 'GET',
    path: '/sites',
    summary: 'Every planting site, with location, meeting point and species.',
    params: [['suburb', 'string', 'Exact suburb, any case']]
  },
  { id: 'site', method: 'GET', path: '/sites/{id}', summary: 'One planting site by id.', params: [] }
]

/* ---------- Try it ---------- */

const form = reactive({ endpoint: 'events', id: '', suburb: '', upcoming: true, familyFriendly: false, limit: 3 })
const result = ref(null)
const error = ref(null)
const sending = ref(false)

const suburbs = computed(() => [...new Set(events.sites.map((s) => s.suburb))].sort())
const eventIds = computed(() => events.events.filter((e) => e.status !== 'draft').map((e) => e.id))
const siteIds = computed(() => events.sites.map((s) => s.id))

const requestUrl = computed(() => {
  const params = new URLSearchParams()
  if (form.endpoint === 'events') {
    if (form.suburb) params.set('suburb', form.suburb)
    if (form.upcoming) params.set('upcoming', 'true')
    if (form.familyFriendly) params.set('familyFriendly', 'true')
    params.set('limit', String(form.limit))
  }
  if (form.endpoint === 'sites' && form.suburb) params.set('suburb', form.suburb)
  const path = {
    events: '/events',
    sites: '/sites',
    event: `/events/${form.id || eventIds.value[0] || 'evt-014'}`,
    site: `/sites/${form.id || siteIds.value[0] || 'site-01'}`
  }[form.endpoint]
  const query = params.toString()
  return `${API_BASE}${path}${query ? `?${query}` : ''}`
})

function onEndpointChange() {
  form.id = ''
  result.value = null
}

async function send() {
  sending.value = true
  error.value = null
  try {
    result.value = await tryRequest(requestUrl.value)
  } catch {
    error.value = 'The request could not be sent. Check your connection and try again.'
  } finally {
    sending.value = false
  }
}

const copied = ref('')
async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
    setTimeout(() => { copied.value = '' }, 2000)
  } catch {
    copied.value = ''
  }
}

const curlExample = computed(() => `curl "${requestUrl.value}"`)
const fetchExample = computed(() =>
  `const response = await fetch('${requestUrl.value}')\nconst { data, meta } = await response.json()`
)
</script>

<template>
  <section class="gr-dev">
    <p class="text-body-secondary small mb-1">For developers</p>
    <h1 class="h3 mb-2">GreenRoots public API</h1>
    <p class="mb-4 gr-dev__lead">
      Read-only JSON access to published planting days and sites — for council dashboards, community
      newsletters or your own app. No key is needed.
    </p>

    <div class="row g-4">
      <!-- ============ Reference ============ -->
      <div class="col-lg-7">
        <section class="mb-4" aria-labelledby="dev-basics">
          <h2 id="dev-basics" class="h5">Basics</h2>
          <dl class="gr-dev__facts">
            <dt>Base URL</dt>
            <dd>
              <code class="text-break">{{ API_BASE }}</code>
              <button type="button" class="btn btn-link btn-sm p-0 ms-2 align-baseline" @click="copy(API_BASE, 'base')">
                {{ copied === 'base' ? 'Copied' : 'Copy' }}<span class="visually-hidden"> base URL</span>
              </button>
            </dd>
            <dt>Format</dt>
            <dd>JSON. Lists return <code>{ data, meta, links }</code>; single items <code>{ data }</code>.</dd>
            <dt>Rate limit</dt>
            <dd>60 requests a minute per client. Check <code>X-RateLimit-Remaining</code>; a <code>429</code> carries <code>Retry-After</code>.</dd>
            <dt>Caching</dt>
            <dd>Responses carry an <code>ETag</code>. Send it back as <code>If-None-Match</code> to get an empty <code>304</code> when nothing has changed.</dd>
            <dt>CORS</dt>
            <dd>Callable from any website — no credentials are involved.</dd>
            <dt>Versioning</dt>
            <dd>Breaking changes will ship as <code>/v2</code>; <code>/v1</code> keeps working.</dd>
            <dt>Machine-readable spec</dt>
            <dd>
              <a :href="`${API_BASE}/openapi.json`" target="_blank" rel="noopener noreferrer">
                OpenAPI 3.1 (openapi.json)<span class="visually-hidden"> — opens in a new tab</span>
              </a>
              — import into Postman, Swagger UI or a client generator.
            </dd>
          </dl>
        </section>

        <section class="mb-4" aria-labelledby="dev-endpoints">
          <h2 id="dev-endpoints" class="h5">Endpoints</h2>
          <article v-for="endpoint in ENDPOINTS" :key="endpoint.id" class="card mb-3">
            <div class="card-body">
              <h3 class="h6 mb-1">
                <span class="badge text-bg-success me-2">{{ endpoint.method }}</span>
                <code>{{ endpoint.path }}</code>
              </h3>
              <p class="small mb-2">{{ endpoint.summary }}</p>
              <div v-if="endpoint.params.length" class="table-responsive">
                <table class="table table-sm small mb-0">
                  <caption class="visually-hidden">Query parameters for {{ endpoint.path }}</caption>
                  <thead>
                    <tr><th scope="col">Parameter</th><th scope="col">Type</th><th scope="col">Meaning</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="[name, type, meaning] in endpoint.params" :key="name">
                      <th scope="row" class="fw-normal"><code>{{ name }}</code></th>
                      <td>{{ type }}</td>
                      <td>{{ meaning }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        </section>

        <section aria-labelledby="dev-errors">
          <h2 id="dev-errors" class="h5">Errors</h2>
          <p class="small">Every error has the same shape, and the message says what to change:</p>
          <pre class="gr-dev__code" tabindex="0" aria-label="Example error response"><code>{
  "error": {
    "status": 400,
    "code": "invalid_parameter",
    "message": "\"limit\" must be between 1 and 100."
  }
}</code></pre>
          <table class="table table-sm small">
            <caption class="visually-hidden">HTTP status codes</caption>
            <thead><tr><th scope="col">Status</th><th scope="col">When</th></tr></thead>
            <tbody>
              <tr><th scope="row" class="fw-normal"><code>400</code></th><td>A parameter is missing its format, out of range or unknown</td></tr>
              <tr><th scope="row" class="fw-normal"><code>404</code></th><td>No such path, planting day or site</td></tr>
              <tr><th scope="row" class="fw-normal"><code>405</code></th><td>Anything but GET — the API is read-only</td></tr>
              <tr><th scope="row" class="fw-normal"><code>429</code></th><td>Over the rate limit; wait for <code>Retry-After</code> seconds</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      <!-- ============ Try it ============ -->
      <div class="col-lg-5">
        <section class="card gr-dev__try" aria-labelledby="dev-try">
          <div class="card-body">
            <h2 id="dev-try" class="h5 mb-3">Try it</h2>
            <form novalidate @submit.prevent="send">
              <div class="mb-2">
                <label class="form-label small mb-1" for="try-endpoint">Endpoint</label>
                <select id="try-endpoint" v-model="form.endpoint" class="form-select form-select-sm" @change="onEndpointChange">
                  <option v-for="endpoint in ENDPOINTS" :key="endpoint.id" :value="endpoint.id">
                    GET {{ endpoint.path }}
                  </option>
                </select>
              </div>

              <div v-if="form.endpoint === 'event' || form.endpoint === 'site'" class="mb-2">
                <label class="form-label small mb-1" for="try-id">Id</label>
                <select id="try-id" v-model="form.id" class="form-select form-select-sm">
                  <option v-for="id in (form.endpoint === 'event' ? eventIds : siteIds)" :key="id" :value="id">{{ id }}</option>
                </select>
              </div>

              <div v-if="form.endpoint === 'events' || form.endpoint === 'sites'" class="mb-2">
                <label class="form-label small mb-1" for="try-suburb">suburb</label>
                <select id="try-suburb" v-model="form.suburb" class="form-select form-select-sm">
                  <option value="">(any)</option>
                  <option v-for="suburb in suburbs" :key="suburb" :value="suburb">{{ suburb }}</option>
                </select>
              </div>

              <template v-if="form.endpoint === 'events'">
                <div class="d-flex flex-wrap gap-3 mb-2">
                  <div class="form-check">
                    <input id="try-upcoming" v-model="form.upcoming" class="form-check-input" type="checkbox" />
                    <label class="form-check-label small" for="try-upcoming">upcoming=true</label>
                  </div>
                  <div class="form-check">
                    <input id="try-family" v-model="form.familyFriendly" class="form-check-input" type="checkbox" />
                    <label class="form-check-label small" for="try-family">familyFriendly=true</label>
                  </div>
                </div>
                <div class="mb-2">
                  <label class="form-label small mb-1" for="try-limit">limit</label>
                  <input id="try-limit" v-model.number="form.limit" class="form-control form-control-sm" type="number" min="1" max="100" />
                </div>
              </template>

              <p class="small mb-1 text-body-secondary">Request</p>
              <pre class="gr-dev__code gr-dev__url" tabindex="0" aria-label="Request URL"><code>GET {{ requestUrl }}</code></pre>

              <div class="d-flex gap-2 mb-3">
                <button type="submit" class="btn btn-primary btn-sm" :disabled="sending" :aria-busy="sending ? 'true' : undefined">
                  <span v-if="sending" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                  {{ sending ? 'Sending…' : 'Send request' }}
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" @click="copy(curlExample, 'curl')">
                  {{ copied === 'curl' ? 'Copied' : 'Copy as curl' }}
                </button>
              </div>
            </form>

            <p v-if="error" class="alert alert-danger small py-2" role="alert">{{ error }}</p>

            <div v-if="result" role="status" aria-live="polite">
              <p class="small mb-1">
                <span class="badge" :class="result.ok ? 'text-bg-success' : 'text-bg-danger'">{{ result.status }}</span>
                <span class="text-body-secondary ms-1">in {{ result.ms }} ms</span>
                <template v-if="result.body?.meta">
                  · {{ result.body.meta.count ?? result.body.data?.length }} of {{ result.body.meta.total }} shown
                </template>
              </p>
              <dl class="gr-dev__headers small mb-2">
                <template v-for="(value, name) in result.headers" :key="name">
                  <dt>{{ name }}</dt><dd>{{ value }}</dd>
                </template>
              </dl>
              <pre class="gr-dev__code gr-dev__response" tabindex="0" aria-label="Response body"><code>{{ JSON.stringify(result.body, null, 2) }}</code></pre>
            </div>

            <p class="small text-body-secondary mb-1 mt-3">The same request in JavaScript</p>
            <pre class="gr-dev__code" tabindex="0" aria-label="JavaScript example"><code>{{ fetchExample }}</code></pre>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.gr-dev__lead {
  max-width: 48rem;
}

.gr-dev__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.4rem 1rem;
  font-size: 0.9rem;

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
  }

  @media (max-width: 575.98px) {
    grid-template-columns: 1fr;

    dd {
      margin-bottom: 0.5rem;
    }
  }
}

.gr-dev__code {
  background: #f6f8f6;
  border: 1px solid var(--bs-border-color);
  border-radius: 0.375rem;
  padding: 0.75rem;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.gr-dev__url {
  margin-bottom: 0.75rem;
}

.gr-dev__response {
  max-height: 24rem;
  overflow: auto;
  white-space: pre;
  word-break: normal;
}

.gr-dev__headers {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0 0.75rem;

  dt {
    font-weight: 400;
    color: var(--bs-secondary-color);
    font-family: var(--bs-font-monospace);
  }

  dd {
    margin: 0;
    word-break: break-all;
  }
}

.gr-dev__try {
  @media (min-width: 992px) {
    position: sticky;
    top: 5rem;
  }
}
</style>
