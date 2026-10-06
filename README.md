# GreenRoots Melbourne

A FIT5032 coursework app for browsing local planting events and registering as a volunteer. Events can be searched and filtered, with event details and registrations stored in the browser.

Built with Vue 3, Vue Router, Pinia, Bootstrap and Vite.

## Run locally

```sh
npm install
npm run dev
```

## Production build

```sh
npm run build
npm run preview
```

## Interactive tables and export (BR D.3 / E.4)

- **Volunteer roster** (`/manage/volunteers`, 200 mock records) and **planting
  days** (`/manage`) use [DataTables](https://datatables.net) via
  `datatables.net-vue3`, with the ColumnControl extension for a search box
  under every column heading. Planting days open their sign-ups as DataTables
  child rows. Shared wrapper: `src/components/base/DataTablesTable.vue`.
- **Accounts** (`/admin/users`) has role and volunteer-link dropdowns inside its
  cells, so it uses a Vue table (`src/components/base/InteractiveTable.vue`)
  with the same features.

All three tables support search across all columns, search within one column,
sorting on any column and 10 rows per page. Each can export the rows that match
its current search and sort, across all pages, as CSV or PDF
(`src/utils/exporters.js`, PDF via jsPDF).

## Planting map (BR E.2)

`/map` uses Mapbox (mapbox-gl JS, Geocoding v6, Directions v5). Add a public
token to `.env.local` as `VITE_MAPBOX_TOKEN=pk.…` and restrict it to the
site's URLs in the Mapbox account.

1. **Geospatial site search** — start from the device location or a searched
   address (autocomplete), then filter sites by suburb, species, month,
   family-friendliness and distance radius; results are sorted nearest first and
   the list and map markers stay in sync.
2. **Trip planning** — walking, cycling and driving routes compared side by
   side, the chosen route drawn on the map with turn-by-turn steps, and a
   "leave by" time to arrive before the planting day starts. Public transport
   links out to Google Maps.

Planting days link to the map with `?site=<id>`.

## Email and Cloud Functions (BR D.2 / E.1)

Email is sent by Firebase Cloud Functions (`functions/`, region
`australia-southeast1`) through SendGrid, so the API key never reaches the
browser.

- **`emailEventDetails`** — "Email me these details" on a planting day sends
  the signed-in user a PDF briefing and an `.ics` calendar invite, to their own
  address only.
- **`sendComposedEmail`** — coordinators and administrators compose an email at
  `/manage/email`: recipients, subject, message, the planting day's briefing
  and invite, and uploaded files (PDF/PNG/JPG/CSV/TXT/ICS, 4 MB). Each
  recipient gets a separate copy; replies go to the coordinator.

Both check sign-in and role on the server, validate every field, and limit how
many emails an account can send per hour (`mailQuota` in Firestore).

### Set up and deploy

```sh
npx firebase login
npx firebase functions:secrets:set SENDGRID_API_KEY   # paste the SendGrid key
cp functions/.env.example functions/.env.project-5032assessment   # set MAIL_FROM, APP_URL
npx firebase deploy --only functions
```

Functions need the Firebase Blaze plan. Server tests: `npm --prefix functions test`.
