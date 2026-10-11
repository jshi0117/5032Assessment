# Accessibility (BR E.3) — WCAG 2.1 AA

GreenRoots Melbourne targets **WCAG 2.1 Level AA**. This file records how that
was checked and what was found and fixed.

## How it was tested

**Automated — axe-core 4.14** (the engine behind Lighthouse and
accessibilitychecker-style scanners), run in the browser against every route
with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and
`best-practice`:

- Public: `/`, `/events`, `/events/:id`, `/map`, `/volunteer`, `/login`,
  `/register`, `/forgot-password`, `/forbidden`, the 404 page
- Signed in: `/account`, `/manage`, `/manage/volunteers`, `/manage/email`,
  `/admin`, `/admin/users`
- Interactive states as well as first load: forms submitted empty (error
  messages shown), the map with a site popup, the address suggestion list and
  a planned route, the planting-day table with a sign-ups row expanded.

**Manual** — the criteria automated tools cannot judge:

| Check | Criterion | How |
|---|---|---|
| Keyboard only | 2.1.1, 2.1.2 | Tab / Shift-Tab / Enter / arrows through every control, including map markers, table sort and per-column search, the address combobox and travel-mode radio group |
| Focus visible | 2.4.7 | Computed style of every focused element while tabbing |
| Focus order and management | 2.4.3, 3.2.1 | Route changes move focus to `<main>`; send/save results receive focus |
| Reflow at 320 px | 1.4.10 | Page width measured on every route at a 320 px viewport |
| Non-text contrast | 1.4.11 | Border contrast of every input type measured against its background |
| Text spacing | 1.4.12 | WCAG text-spacing values injected; clipped text searched for |
| Input purpose | 1.3.5 | `autocomplete` on every field that collects the user's own details |
| Language and titles | 3.1.1, 2.4.2 | `lang="en-AU"`; a distinct `<title>` per route |
| Motion | 2.3.3 | Map camera moves and transitions respect `prefers-reduced-motion` |

## Result

**0 axe violations on every route and state listed above**, after the fixes
below.

## Issues found and fixed

| Issue | Criterion | Fix |
|---|---|---|
| Input and select borders were 1.3:1 against white (Bootstrap `#dee2e6`), so an empty field was hard to see | 1.4.11 | Borders of inputs, selects and checkboxes raised to `#868e96` (3.3:1), including the DataTables / ColumnControl search boxes |
| Footer links were 4.44:1 on the footer background | 1.4.3 | Use the body's secondary colour, as the footer's other text does |
| Map markers were announced as images: mapbox-gl adds `role="img"` to any marker without a role, which also made `aria-pressed` invalid | 4.1.2 | Markers are `<button role="button">` |
| ColumnControl's "how to match" `<select>` sits at opacity 0 over an icon, so keyboard focus on it was invisible | 2.4.7 | The focus ring is drawn on the icon whenever the select has focus |
| ColumnControl's search inputs and "how to match" selects had no accessible name | 4.1.2, 1.3.1 | `aria-label` added to each ("Search Name", "How to match Name") |
| At 320 px the accounts page scrolled sideways: screen-reader-only labels inside the scrolling table escaped it | 1.4.10 | Table scroll containers are positioned, which keeps them inside |
| "Confirm email" had no `autocomplete` | 1.3.5 | `autocomplete="email"` |

## Design decisions worth knowing

- **Skip link** to `#main-content` on every page; `<main>` takes focus after
  each route change so screen-reader and keyboard users start at the new
  content.
- **Every map feature is also in the list beside it.** The list is the
  accessible alternative to the map; markers are labelled buttons ("Cruickshank
  Park, 4.0 km away, next planting Sat 31 Oct 2026").
- **Live regions** announce search result counts, table sort and filter
  results, routes found, and email outcomes.
- **Data tables** have captions, `scope`d headers, `aria-sort`, and labelled
  per-column search. They may scroll horizontally inside their own box at
  narrow widths, which 1.4.10 allows for data tables.
- **Generated PDFs** (table exports and emailed briefings) are tagged with a
  title and language.

## Known limitations

- The event-card description is clamped to three lines to keep cards level.
  The full text is on the event page the card links to, and screen readers
  read all of it.
- The map canvas itself is a picture of streets; it cannot be made fully
  accessible, which is why every site, distance and direction is also given
  as text.
- Automated tools find roughly a third of WCAG issues. The manual checks above
  cover keyboard, focus, reflow, contrast and spacing; a test with a real
  screen reader (VoiceOver / NVDA) is still worth doing before release.
