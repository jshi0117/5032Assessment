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
