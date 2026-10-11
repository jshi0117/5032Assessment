/**
 * OpenAPI 3.1 description of the public API, served at /v1/openapi.json, so
 * it can be loaded into Swagger UI, Postman or a client generator.
 */
export function openApiSpec(baseUrl) {
  const errorRef = { $ref: '#/components/responses/Error' }
  const dateParam = (name, description) => ({
    name, in: 'query', description, schema: { type: 'string', format: 'date', example: '2026-11-01' }
  })
  return {
    openapi: '3.1.0',
    info: {
      title: 'GreenRoots Melbourne public API',
      version: '1.0.0',
      description:
        'Read-only access to published community planting days and planting sites in Melbourne\'s west and north. ' +
        'No key is needed. Limited to 60 requests a minute per client; responses carry ETags for conditional requests.'
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/events': {
        get: {
          summary: 'List planting days',
          description: 'Published planting days, earliest first. Drafts are never included.',
          parameters: [
            { name: 'suburb', in: 'query', schema: { type: 'string' }, example: 'Braybrook' },
            { name: 'site', in: 'query', schema: { type: 'string' }, example: 'site-03' },
            { name: 'activity', in: 'query', description: 'Matches part of the activity, e.g. "planting".', schema: { type: 'string' } },
            dateParam('from', 'Only days on or after this date.'),
            dateParam('to', 'Only days on or before this date.'),
            { name: 'upcoming', in: 'query', schema: { type: 'boolean' } },
            { name: 'familyFriendly', in: 'query', schema: { type: 'boolean' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } }
          ],
          responses: {
            200: {
              description: 'A page of planting days',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/EventList' } } }
            },
            400: errorRef,
            429: errorRef
          }
        }
      },
      '/events/{id}': {
        get: {
          summary: 'Get one planting day',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'evt-014' }],
          responses: {
            200: { description: 'The planting day', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Event' } } } } } },
            404: errorRef
          }
        }
      },
      '/sites': {
        get: {
          summary: 'List planting sites',
          parameters: [{ name: 'suburb', in: 'query', schema: { type: 'string' } }],
          responses: { 200: { description: 'Planting sites', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Site' } } } } } } } }
        }
      },
      '/sites/{id}': {
        get: {
          summary: 'Get one planting site',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'site-06' }],
          responses: {
            200: { description: 'The site', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Site' } } } } } },
            404: errorRef
          }
        }
      }
    },
    components: {
      schemas: {
        Event: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            activity: { type: 'string' },
            status: { type: 'string', enum: ['open', 'full', 'cancelled', 'completed'] },
            date: { type: 'string', format: 'date' },
            startTime: { type: 'string', example: '09:00' },
            endTime: { type: 'string', example: '12:00' },
            timezone: { type: 'string', example: 'Australia/Melbourne' },
            capacity: { type: 'integer' },
            registered: { type: 'integer' },
            spotsLeft: { type: 'integer' },
            familyFriendly: { type: 'boolean' },
            rating: {
              type: ['object', 'null'],
              properties: { average: { type: 'number' }, count: { type: 'integer' } }
            },
            site: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, suburb: { type: 'string' }, href: { type: 'string' } } }
          }
        },
        EventList: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { $ref: '#/components/schemas/Event' } },
            meta: { type: 'object', properties: { total: { type: 'integer' }, count: { type: 'integer' }, limit: { type: 'integer' }, offset: { type: 'integer' } } },
            links: { type: 'object', properties: { self: { type: 'string' }, next: { type: ['string', 'null'] }, prev: { type: ['string', 'null'] } } }
          }
        },
        Site: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            suburb: { type: 'string' },
            location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
            meetingPoint: { type: 'string' },
            species: { type: 'array', items: { type: 'string' } }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'object', properties: { status: { type: 'integer' }, code: { type: 'string' }, message: { type: 'string' } } }
          }
        }
      },
      responses: {
        Error: { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
      }
    }
  }
}
