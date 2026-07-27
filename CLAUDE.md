# Working notes for coding agents

Read [ARCHITECTURE.md](ARCHITECTURE.md) first — the domain model, the status cascade and the three clocks live there and are not repeated here. This file is the operational stuff: commands, invariants that are easy to break, and how to verify.

## Commands

```bash
npm run dev              # http://localhost:5173
npm run build            # tsc -b && vite build
npm run lint             # oxlint — zero warnings is the baseline, not the goal
npm test                 # vitest run
npm run build:template   # regenerates src/assets/submittal-cover.pdf
```

**All four of build / lint / test must pass before anything is done.** `npm test` is the safety net for `src/store/logic.ts`; if you touched that file and didn't run it, you aren't finished.

## Invariants

Break one of these and the failure is subtle rather than loud.

- **No `status` or `stage` field, ever.** Both are derived (ARCHITECTURE.md §2). Adding one reintroduces the class of bug the design exists to prevent.
- **`ReportSnapshot` fields are flat scalars.** Dirty-checking stringifies, so a change inside a nested object is invisible. Arrays of records (`deliveries`, `installations`) live on `MaterialItem` and publish only their totals.
- **A new publishable field must be added to `REPORT_FIELDS`.** One that shouldn't be published (private annotations) must not be.
- **Every model change goes through `migrateDb()` with a default.** A user's data is in their own `localStorage`; a missing default breaks the app for them and only for them.
- **Nothing writes `delivered`, `siteDate` or `installed` except `stagePatch`.** Move material via `actions.setItemStage`. Patching those fields directly bypasses the OFCI exemption, the date-stamp preservation and the delivery-log arbitration.
- **`AppContext.tsx` exports only `AppProvider`.** The hook, context and types are in `useApp.ts`; exporting a non-component from the `.tsx` brings back a fast-refresh warning.
- **The `received` column key does not get renamed** even when its label changes — it would orphan the persisted column state in every existing browser.
- **`today()` / `now()` read local date parts; `toISO` / `parseISO` / `addDays` stay UTC-anchored.** These look inconsistent and are not: the first is a clock reading, the rest are arithmetic on ISO strings. The test suite pins `TZ=America/Bogota` so the difference is actually exercised — don't "simplify" either side.
- **The seed's dates are offsets from today, not literals** (`src/seed/demoData.ts`). A hard-coded date turns the whole demo board red within weeks. There's a test that moves the clock a year forward to catch it.
- **`scripts/build-submittal-template.mjs` and `src/store/submittalCover.ts` are one contract** in two files — field names and page geometry. Change either and change both; `submittalCover.test.ts` will tell you if you didn't.
- **CSS:** never mix the `border` shorthand with a dynamic `borderColor` (React warns); no `overflow-x: auto` on `.main` (it breaks the sticky toolbar); any `position: fixed` popover hanging off a sticky `<th>` must be portaled to `document.body`, since a sticky cell is its own stacking context and the popover will be painted under the next column.

## Verifying

1. `npm run build && npm run lint && npm test`.
2. For UI work, run the dev server and check it — including **dark mode** (`data-theme="dark"` on `<html>`) and a **fresh tab** (a stale HMR session produces `useEffect changed size between renders` warnings that aren't real bugs).
3. For a refactor that shouldn't change rendering: capture `document.querySelector('.app').innerHTML` plus every input's `value`/`checked`, `git stash`, reload, compare, `git stash pop`. Byte-identical means the render didn't change.
4. Synthetic `PointerEvent`s can't be captured — stub `Element.prototype.setPointerCapture` to test a drag.

## This is a public repo

It's a portfolio build. Everything in `src/seed/` is invented, and it stays that way: no real vendor, project, address, contact or pricing data enters this repository, in code, comments, commit messages or fixtures.
