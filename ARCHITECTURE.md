# Architecture

This document is for a reader who has never seen the codebase and wants to know whether the design holds up. It covers the domain model and the three clocks; the code layout is at the end.

Vocabulary, once: a **work package** is a scope of work under a CSI cost code (`10.28 Toilet Accessories`). A **submittal** is the product data a contractor sends the architect for approval before purchasing. **Lead time** is how long the vendor takes from PO to shipment, quoted in weeks. **OFCI** is *owner-furnished, contractor-installed* — the owner buys it, we put it up.

---

## 1. The one rule everything else falls out of

```
Buy-By Date = On-Site Required Date − (Lead Time × 7 days)
```

If it's needed on site August 20th and the vendor takes six weeks, you had to buy it by July 9th. Comparing that date to today produces the semaphore: **past → ORDER NOW**, **within the configurable window (default 7 days) → Order soon**, **beyond it → Planned**.

That's the whole arithmetic. Everything difficult in this domain is about the cases where the arithmetic *shouldn't run*, and that's what the rest of this document is about.

## 2. Status is derived, never stored

There is no `status` column in the data model and no `stage` enum. Both are computed:

```ts
itemStage(it) = it.installed ? 'installed'
              : !it.delivered ? 'pending'
              : it.siteDate  ? 'on-site'
              : 'warehouse'
```

An item cannot be in an impossible state — marked "installed" while flagged "not yet delivered" — because there is no second field to contradict the first. A new feature never needs a migration to backfill a status, and a stale status can't survive an edit to the date that produced it.

The cost is that the derivation has to be right, in one place, and stay tested. That's `src/store/logic.ts` and its test file.

## 3. The status cascade, and why the order is the design

`computeItem` runs a series of short-circuits. The order is not incidental — each position encodes a domain rule, and getting two of them backwards produces a plausible-looking board that's wrong:

```
installed              → 'installed'    wins over everything, including OFCI
OFCI                   → 'na'           before needs-data: never nag for a lead time
supplyOnly && on-site  → 'on-site'      the short cycle's terminal state
delivered / partial / ordered           already bought — the buy-by deadline is moot
no lead time or no on-site date
                       → 'needs-data'   refuse to guess
otherwise              → buy-by semaphore
```

Reading the interesting ones:

- **`installed` beats `OFCI`.** Owner-furnished material is outside our *procurement*, but we still install it, so it earns the terminal badge like anything else. Put OFCI first and every installed owner-furnished item silently reads "N/A".
- **`OFCI` beats `needs-data`.** An owner-furnished item has no lead time and never will. Below the needs-data check, it would nag forever for a number that doesn't exist.
- **`ordered` beats the semaphore.** Once there's a PO, the buy-by date is history. Leave it below and every purchased item keeps screaming ORDER NOW.
- **`needs-data` is a real state, not a blank.** With no lead time there is no buy-by, and the honest answer is "I can't tell you" — not a default of zero that would render as ORDER NOW and train the user to ignore red.

## 4. The three clocks

The core insight of the tool. A single item is subject to three independent deadlines, and each answers a different question:

| Clock | Question | Reads | Terminal |
|---|---|---|---|
| **Buy-by** (`computeItem`) | Do I need to *purchase* this? | on-site date, lead time | ordered |
| **Install urgency** (`installUrgency`) | Do I need to *put it up*? | on-site date, stage | installed |
| **Delivery watch** (`deliveryWatch`) | Did what I bought *actually arrive*? | PO, promised ship date | arrived |

The third one is the one spreadsheets never have, and it covers the gap between the PO and the loading dock — the stretch where an item looks completely healthy (it says "Ordered") while the vendor quietly misses the date they promised.

Two decisions in it are worth stating, because both are places the obvious implementation is wrong:

- **`late` is not a status.** It's a separate axis. An item that's late still shows `ORDERED` with a ⏰ beside it, because it *is* ordered — that's true and useful. Folding lateness into the status enum would mean an item is either late or ordered, which loses information and breaks every status filter.
- **`unknown` exists but never alerts.** An item bought with no promised ship date is missing information, not a healthy item, so it gets its own state. But alerting on it would drown three genuinely late deliveries under forty undated ones. A signal you learn to ignore is worse than no signal.

## 5. Draft vs. report — the two-layer state

Every item carries its working values *and* a published `report` snapshot.

The material list edits the **draft**. The Overview board, the Submittals screen and the client PDF read the **report**. "Save to report" publishes a package and stamps it.

This exists because of how the job actually runs: the PM edits all week, and the GC reads the report. Without the split, a half-typed quantity on Tuesday is in the client's report on Tuesday. With it, a package that's been edited but not published visibly announces itself as having unpublished changes — and the board keeps telling the truth about the last thing that was actually agreed.

`REPORT_FIELDS` declares which fields are in the snapshot, and therefore which edits mark a package dirty. A field that should be published goes in it; one that's a private annotation (the row highlighter) deliberately does not.

**Constraint this imposes:** snapshot fields are flat scalars, never nested objects. Dirty-checking compares stringified values, so a change *inside* an object would be invisible. That's why the delivery and installation logs live on the item and only their totals are published — and it's a rule the type system doesn't enforce, so it's written down here and in the code.

## 6. Scope: supply-only vs. supply-and-install

Some packages we furnish but don't install. Those close when the material reaches the jobsite; the rest close when it's installed.

The flag lives on both the project and the package, and the resolution rule matters: **the project's flag is only a default and a grouping; the package's flag is the operative truth.** A project is rarely uniformly one or the other.

The wrinkle is that `computeItem` only ever sees an item snapshot — it can't look up the item's package. So the scope is *injected* through the config parameter by whoever calls it. That keeps the core a pure function of its inputs, at the price of every caller having to remember. The alternative (giving the engine access to the whole database) would be worse in a way that's harder to see and much harder to test.

## 7. The quantity chain

```
qty purchased  ≥  receivedQty arrived  ≥  installedQty installed
```

The second `≥` is a hard cap: **you cannot install what has not arrived.**

Each number has exactly one owner, never two. When the delivery log has entries, the log is authoritative and the manual checkbox is disabled with the reason shown. When it doesn't, the checkbox is. All-or-nothing, both ways — the failure mode of "both are sort of authoritative" is a number that reverts a second after you set it, which is how a user learns not to trust the tool.

The stage itself has **one writer**, `stagePatch`. Four different surfaces move material (a row checkbox, two popovers, a modal), and each used to make its own decisions about date stamping and OFCI. They now all funnel through one function, so those rules are decided once instead of three-quarters-consistently.

---

## Code layout

```
src/
  store/
    types.ts             the data model
    logic.ts             ← the domain engine. Pure functions. Start here.
    logic.test.ts        ← and here.
    AppContext.tsx       state + actions. The only place that writes.
    useApp.ts            the hook + action types (split out for fast-refresh)
    materialsImport.ts   CSV/XLSX parsing, fuzzy columns, work-package classification
    submittalCover.ts    AcroForm filling + generated continuation sheets (pdf-lib)
    persist.ts           localStorage
  seed/                  the demo database — invented data, computed dates
  screens/               Overview · Material List · Submittals
  components/            grid, design-system primitives, modals
scripts/
  build-submittal-template.mjs   authors the AcroForm PDF the app fills
```

**Reading order for a reviewer with ten minutes:** `logic.ts`'s `computeItem` and `deliveryWatch`, then `logic.test.ts`, then `seed/demoData.ts` to see the model exercised. The screens are rendering; the decisions are in those three files.

## Trade-offs I'd defend

- **No backend.** `localStorage` and a static build. It's the right call for a single-PM tool and the wrong one for a crew, and the moment it needs to be shared it needs auth, a server, and a conflict story — that's a rewrite of the state layer, not an addition to it.
- **Inline styles with CSS custom properties**, not a CSS framework. The app is a dense data grid with a lot of computed colour (status tints, dark mode); tokens in CSS and values in TS beats generating class names for the same thing.
- **Tests on the domain core, not on components.** Test count in a UI is easy to inflate and mostly re-asserts that React renders. The rules are where the bugs were, so that's where the tests are.
- **Comments that explain history.** Several say *"this already cost a bug."* They're maintenance notes, not decoration: they mark the places where the obvious simplification is the one that was already tried.
