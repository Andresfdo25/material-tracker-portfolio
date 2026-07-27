# Material Tracker

**A procurement tracker for construction specialty materials — it answers "what do I have to buy this week, and what did somebody promise me that hasn't shown up?"**

[**▶ Open the live demo**](https://material-tracker-portfolio.vercel.app) · no signup, loads with sample data, everything stays in your browser.

![React 19](https://img.shields.io/badge/React-19-087ea4) ![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178c6) ![Vite 8](https://img.shields.io/badge/Vite-8-646cff) ![Vitest](https://img.shields.io/badge/tests-128%20passing-4c9a2a) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## The problem

On a construction project, a specialty-materials PM is tracking a few hundred line items — toilet partitions, wall protection, lockers, window shades — each on its own schedule. A single item can be late for three completely different reasons, and the industry standard tool for all of it is a shared spreadsheet:

1. **You haven't bought it yet** and the lead time no longer fits before it's needed on site.
2. **You bought it, and the vendor's promised ship date came and went.**
3. **It arrived, it's sitting in the warehouse,** and the install date is next week.

A spreadsheet shows you one of those at a time, and only if you sort correctly. Miss any of the three and the trade shows up to a room with no material in it.

This app models all three as separate clocks over the same item, derives the status instead of storing it, and renders the answer as one board.

## What it does

| | |
|---|---|
| **Status board** | Every project, every package, one screen. Buy-by semaphore, late deliveries, install backlog, and what's blocked on submittal approval. |
| **Material list** | The spreadsheet the PM actually lives in — inline editing, bulk edits, drag-to-reorder, per-package publish. |
| **Three clocks** | Buy-by (do I need to purchase?), install urgency (do I need to put it up?), delivery watch (did the thing I bought actually arrive?). |
| **Draft vs. report** | Edits are a private working draft until you publish a package. The board and the client PDF read the published snapshot — so you can work mid-week without the GC seeing half-finished numbers. |
| **Materials import** | CSV/XLSX with fuzzy column matching and a reviewable, reassignable preview before anything is written. |
| **Submittal cover PDF** | Fills an AcroForm template with `pdf-lib`, spilling onto generated continuation sheets, entirely client-side. |
| **Client-ready report** | A print layout that produces the procurement log a GC expects, with an internal and a client version. |

## Architecture in one minute

No backend. React 19 + TypeScript on Vite, state in `localStorage`, and a **pure-functions domain core** (`src/store/logic.ts`) that the UI is a rendering of.

The design decision everything else follows from:

> **Status is derived, never stored.**

There is no `status` column and no `stage` enum. An item's stage is a function of the data:

```ts
itemStage(it) = it.installed ? 'installed'
              : !it.delivered ? 'pending'
              : it.siteDate  ? 'on-site'
              : 'warehouse'
```

The consequence is the point: **an item can never be in an impossible state**, because there is no state to get wrong. No status field to fall out of sync with the dates, and a new feature never needs a migration to backfill one.

The buy-by rule is one line — `Buy-By = On-Site Required − Lead Time × 7` — and the whole semaphore falls out of comparing it to today. Everything hard about the domain is in *which* short-circuits come first, and in what ordering, which is why the cascade is documented and tested rather than clever.

**[→ ARCHITECTURE.md](ARCHITECTURE.md)** walks the six domain concepts and the three clocks properly. It's the file to read if you want to know whether I can design a system, rather than whether I can wire a component.

## The test suite is the interesting part

**128 tests, all against the domain core.** Not snapshot tests of components — tests of the rules:

- The stage cascade, including every short-circuit and *why it's in that position*.
- The quantity chain: `qty` purchased ≥ `receivedQty` arrived ≥ `installedQty` installed. You can't install what didn't arrive.
- Owner-furnished (OFCI) and open-backorder items, which collapse onto a single axis and where four different UI surfaces used to disagree about what "not received" meant.
- Date traps. The suite pins `TZ=America/Bogota`, because `today()` must read *local* date parts while the date arithmetic stays UTC-anchored — and the two only disagree in a zone with an offset. The suite fails on the machine of anyone who "simplifies" that.
- The demo data itself, asserting that every status is on the board **and still is a year from now** (see below).
- The PDF template's field-name and geometry contract, by generating a real 3-page cover and reading it back.

## The demo data

Everything in the demo is invented: fictional projects, fictional general contractors, fictional vendors, fictional products. It lives in code (`src/seed/`) rather than in a JSON fixture precisely so it can't be mistaken for exported production data.

One detail worth calling out, because it's the kind of thing that separates a demo that works on the day you deploy it from one that still works in March. The seed dates aren't dates — they're **offsets expressed in the vocabulary of the rule they exercise**:

```ts
buyBy(6, -3)  // six-week lead time, buy-by landed three days ago → always ORDER NOW
buyBy(5,  4)  // buy-by four days out → always Order soon, inside the 7-day window
```

A hard-coded `2026-09-01` is honest for about six weeks; after that every buy-by is in the past, the board is uniformly red, and the semaphore — the thing the app exists to demonstrate — demonstrates nothing. There's a test that moves the clock a year forward and asserts the coverage is unchanged.

## Running it

```bash
npm install && npm run dev
```

```bash
npm test && npm run lint && npm run build
```

`npm run build:template` regenerates the AcroForm submittal template from `scripts/`.

## What I'd build next

Honest list, roughly in the order I'd actually do them:

- **Submittal reconciliation assistant.** The one I most want to build. A submittal is approved at the *product* level, and the dangerous part is the free-text note on an "Approved as Noted" stamp — *"approved, provide in Silver not White as submitted."* That sentence silently redefines what has to be purchased, and today somebody has to read every note by hand and remember to update the tracker. The design is an LLM extraction into a forced JSON schema, then a **deterministic** TypeScript diff against the material list — the model reads the note, plain code decides whether it's a discrepancy, and quantity changes surface as a suggestion requiring a click rather than a silent write. It needs a real hand-labelled eval set with per-category precision/recall before it's worth shipping, which is why it isn't in this build yet rather than being demoed on three happy-path PDFs.
- **Multi-user.** Everything here is single-profile `localStorage`. Real crews need shared state, which means a backend, auth, and — the actually hard part — a conflict story for two PMs editing the same package.
- **Vendor-side ingestion.** The delivery clock is only as good as the ship date somebody typed. Parsing order acknowledgements straight from vendor emails is where that data really lives.
- **Cut scope, not features.** The screens here are dense because the real users are, but the first-run experience deserves a narrower default view.

## How this was built

Spec-driven, with an LLM coding agent doing most of the typing.

The workflow: I write a numbered spec in English describing the behaviour and the open questions, the agent implements it in reviewed batches, and I do the QA against the running app. The domain calls — what a "stage" is, why OFCI collapses onto one axis, why a backorder blocks the receipt but not the install — are mine; that's the part that comes from having done this job, and it's the part no amount of prompting produces.

The comments in this codebase are the honest artifact of that process. Where one says *"this already cost a bug"*, it did — and the note is there so the next change doesn't re-earn it.

## License

MIT — see [LICENSE](LICENSE).
