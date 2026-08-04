// demoData.ts — the database a first-time visitor lands on.
//
// EVERYTHING HERE IS INVENTED. Three fictional projects, fictional general contractors,
// fictional vendors (see catalogs.ts), fictional products. No part of it is derived from
// a real job. It lives in code rather than in a .json fixture precisely so it can't be
// mistaken for exported production data.
//
// ---------------------------------------------------------------------------------
// Why the dates are computed instead of written down
// ---------------------------------------------------------------------------------
// A demo that hard-codes "2026-09-01" is honest for about six weeks. After that every
// buy-by date is in the past, the whole board turns red, and the semaphore — the thing
// the app exists to show — demonstrates nothing. So every date here is expressed as an
// OFFSET FROM TODAY, in the vocabulary of the domain rule it is exercising:
//
//     buyBy(lead, +4)  →  an on-site date whose buy-by lands 4 days from now
//
// Buy-By = On-Site Req. − Lead × 7, so an item whose buy-by is −3 is always ORDER NOW
// and one at +4 is always Order soon (inside the default 7-day window), whether the page
// is opened today or a year from now. The board stays legible forever, and it is the
// same arithmetic `computeItem` runs — if the rule changed, this file would drift with it.
//
// ---------------------------------------------------------------------------------
// What the data is designed to cover
// ---------------------------------------------------------------------------------
// Every status the engine can produce is present on load, so the Overview board is never
// half-empty: order-now, order-soon, planned, needs-data, ordered, partial (open
// backorder), delivered, on-site, installed and na (OFCI). Two of the three clocks that
// aren't the buy-by clock are represented too — a late delivery (promised ship date
// already passed) and a partially installed item — and one package is supply-only, so
// it closes at 'on-site' rather than at 'installed'.
//
// Both states of the field-measure milestone are seeded as well (ARCHITECTURE.md §8): one
// package whose visit date has passed with nobody confirming it, so its ◆ is pinned to
// today and pulsing, and one whose visit is still ahead. Without them the timeline legend
// would name a marker the board never shows.
import {
  addDays, DEFAULT_THRESHOLDS, INSTALL_DEFAULTS, INSTALL_WINDOW_DEFAULTS, parseISO, snapshot, SUBMITTAL_DEFAULTS, toISO, today,
} from '../store/logic';
import type { Db, MaterialItem } from '../store/types';
import { VENDORS_SEED, WP_CATALOG } from './catalogs';

let _id = 0;
const uid = (p: string) => `${p}${++_id}`;

/** ISO date `n` days from today (negative = in the past). */
const day = (n: number) => toISO(addDays(parseISO(today()), n));

/** The on-site date that puts this item's BUY-BY exactly `offset` days from today.
 * Buy-By = On-Site − Lead×7, so On-Site = today + offset + Lead×7. Reading
 * `buyBy(6, -3)` as "six-week lead, buy-by was three days ago" is the whole point —
 * it says which cell of the semaphore the row is meant to land in. */
const buyBy = (leadWeeks: number, offset: number) => day(offset + leadWeeks * 7);

function mk(fields: Partial<MaterialItem> & Pick<MaterialItem, 'wpId' | 'description'>, published: boolean): MaterialItem {
  const it = {
    id: uid('i'), delivered: false, ordered: false, po: '', poDate: '', shipDate: '', shipDateManual: false, notes: '',
    qty: '', um: 'ea', vendor: '', lead: '', onsite: '', submittal: 'Pending', receivedQty: 0, deliveries: [], installations: [], receivedDate: '', fieldDate: '',
    ...INSTALL_DEFAULTS,
    ...INSTALL_WINDOW_DEFAULTS,
    ...SUBMITTAL_DEFAULTS,
    ...fields,
  } as MaterialItem;
  it.report = published ? snapshot(it) : null;
  return it;
}

export function buildDb(): Db {
  _id = 0;

  // Ids deliberately don't start at 'p1'. The app's `activeProjectId` default used to be
  // the literal 'p1', and a seed that matched it once masked a real bug where the project
  // picker silently fell through to the first project instead of the selected one.
  const projects = [
    { id: 'pr-north', name: 'Northgate Medical Fit-Out', gc: 'Vantree Builders' },
    { id: 'pr-river', name: 'Riverside Clinic — Phase 2', gc: 'Halston Construction Group' },
    // Supply-only: we furnish the material, somebody else installs it, so its packages
    // close at 'on-site' instead of at 'installed'.
    { id: 'pr-brook', name: 'Brookfield Elementary Addition', gc: 'Cordell & Sons', supplyOnly: true },
  ];

  const stamp = `${day(-2)} 09:15`;
  const packages = [
    { id: 'wp-n-comp', projectId: 'pr-north', prefix: '10.21', label: '10.21_ Toilet Compartments', reportSince: stamp },
    { id: 'wp-n-frp', projectId: 'pr-north', prefix: '6.83', label: '6.83_ FRP', reportSince: stamp },
    { id: 'wp-n-acc', projectId: 'pr-north', prefix: '10.28', label: '10.28_ Toilet Accessories', reportSince: stamp },
    { id: 'wp-r-lock', projectId: 'pr-river', prefix: '10.51', label: '10.51_ Lockers and Mailboxes', reportSince: stamp },
    { id: 'wp-r-acc', projectId: 'pr-river', prefix: '10.28', label: '10.28_ Toilet Accessories', reportSince: stamp },
    { id: 'wp-r-fire', projectId: 'pr-river', prefix: '10.44', label: '10.44_ Fire Protection Specialties', reportSince: stamp },
    { id: 'wp-b-shade', projectId: 'pr-brook', prefix: '12.24', label: '12.24_ Window Shades', reportSince: stamp, supplyOnly: true },
    { id: 'wp-b-prot', projectId: 'pr-brook', prefix: '10.26', label: '10.26_ Wall Protection', reportSince: stamp, supplyOnly: true },
  ];

  const items = [
    /* ---------------------------------------------- Northgate · 10.21 Compartments */
    // This package also carries the OVERDUE FIELD-MEASURE VISIT (ARCHITECTURE.md §8):
    // partitions are cut to the opening, so somebody has to go measure before anything is
    // fabricated. `fieldDate` is five days ago and nobody has confirmed the measurements,
    // so the ◆ doesn't drop off the timeline — it pins itself onto today's line and
    // pulses. One date per package, which is how the toolbar stamps it.
    //
    // ORDER NOW, and blocked by an unapproved submittal on top of it — the worst cell on
    // the board and the one the Overview headline is built to surface. This is also the
    // row where the field measure is a declared submittal blocker (`fieldReq`), so the
    // Blocked-by-submittal breakdown names it.
    mk({
      wpId: 'wp-n-comp', description: 'Toilet partitions — HDPE, floor-mounted, powder-coat', qty: 14, um: 'ea',
      vendor: 'Harlow Partition Co.', lead: 6, onsite: buyBy(6, -3), submittal: 'In Review',
      fieldDate: day(-5), fieldReq: true, fieldStatus: 'pending' as const,
      notes: 'Colour to match architect’s finish schedule. Field measure still not taken.',
    }, true),
    // Order soon — buy-by inside the default 7-day window. Same scheduled visit, but the
    // component is NOT required here (standard sizes, the measure doesn't gate the order).
    // The visit is still open and still holds the ◆ on the board: "required" answers
    // whether it blocks the purchase, never whether anyone went to site.
    mk({
      wpId: 'wp-n-comp', description: 'Urinal privacy screens, wall-hung, 24"', qty: 6, um: 'ea',
      vendor: 'Harlow Partition Co.', lead: 5, onsite: buyBy(5, 4), submittal: 'Approved',
      fieldDate: day(-5),
    }, true),
    // Planned — comfortably ahead, nothing to do yet.
    mk({
      wpId: 'wp-n-comp', description: 'Headrail-braced pilasters, floor-anchored', qty: 8, um: 'ea',
      vendor: 'Thornbury Metalcraft', lead: 5, onsite: buyBy(5, 74), submittal: 'Approved',
      fieldDate: day(-5),
    }, true),

    /* ------------------------------------------------------- Northgate · 6.83 FRP */
    // Ordered and LATE: the vendor promised a ship date that has already passed. This is
    // the third clock — nothing about it is visible in the buy-by semaphore, which still
    // just says "Ordered".
    mk({
      wpId: 'wp-n-frp', description: 'FRP wall panels, 4×8, pebbled white', qty: 320, um: 'sf',
      vendor: 'Meridian Panel Works', lead: 4, onsite: day(30), submittal: 'Approved',
      ordered: true, po: 'PO-4471', poDate: day(-38), shipDate: day(-9), shipDateManual: true,
      notes: 'Vendor confirmed dock date, then missed it. Chasing.',
    }, true),
    // Ordered, on schedule — the healthy version of the row above.
    mk({
      wpId: 'wp-n-frp', description: 'FRP division bars + edge trim, colour-matched', qty: 140, um: 'lf',
      vendor: 'Meridian Panel Works', lead: 4, onsite: day(30), submittal: 'Approved',
      ordered: true, po: 'PO-4472', poDate: day(-6), shipDate: day(22),
    }, true),

    /* ----------------------------------------------- Northgate · 10.28 Accessories */
    // PARTIAL — 16 of 22 arrived, 6 still on backorder. An open backorder collapses the
    // row onto a single axis (installed or not): it cannot be marked simply "received".
    mk({
      wpId: 'wp-n-acc', description: 'Grab bars, 42" stainless, ADA', qty: 22, um: 'ea',
      vendor: 'Northline Fixtures Co.', lead: 3, onsite: day(45), submittal: 'Approved',
      ordered: true, po: 'PO-4468', poDate: day(-24), shipDate: day(-11),
      receivedQty: 16, receivedDate: day(-11),
      deliveries: [{ qty: 16, note: 'Partial — 6 on backorder, vendor ETA next month', date: day(-11), kind: 'wh-in' as const }],
      notes: 'Backorder: 6 ea.',
    }, true),
    // NEEDS DATA — no lead time and no on-site date, so there is no buy-by to compute.
    // The engine refuses to guess; the row asks for the two numbers instead.
    mk({
      wpId: 'wp-n-acc', description: 'Surface-mount soap dispensers', qty: 18, um: 'ea',
      vendor: 'Beckhorn Washroom Systems', lead: '', onsite: '', submittal: 'Pending',
    }, true),
    // DELIVERED, sitting in the warehouse waiting on the install crew.
    mk({
      wpId: 'wp-n-acc', description: 'Framed mirrors, 24×36, stainless frame', qty: 12, um: 'ea',
      vendor: 'Saltmarsh Glass & Mirror', lead: 2, onsite: day(12), submittal: 'N/A',
      ordered: true, po: 'PO-4459', poDate: day(-31), shipDate: day(-14),
      delivered: true, receivedQty: 12, receivedDate: day(-14),
    }, true),
    // OFCI — owner-furnished, contractor-installed. Out of our procurement flow entirely:
    // status N/A, no buy-by, no lead time demanded. We still install it.
    mk({
      wpId: 'wp-n-acc', description: 'Baby changing stations (owner-furnished)', qty: 4, um: 'ea',
      vendor: '', lead: '', onsite: day(20), submittal: 'N/A', po: 'OFCI',
      notes: 'Owner is buying these direct — we install only.',
    }, true),

    /* --------------------------------------------------- Riverside · 10.51 Lockers */
    // INSTALLED — terminal state, closes the lifecycle.
    mk({
      wpId: 'wp-r-lock', description: 'Single-tier lockers, 12×18×72, powder-coat', qty: 30, um: 'ea',
      vendor: 'Pelham Locker Works', lead: 8, onsite: day(-20), submittal: 'Appr. as Noted',
      ordered: true, po: 'PO-4402', poDate: day(-84), shipDate: day(-27),
      delivered: true, receivedQty: 30, receivedDate: day(-27),
      installed: true, installedDate: day(-16), installedQty: 30, siteDate: day(-19),
      installations: [{ qty: 30, note: 'Full bank, corridor B', date: day(-16) }],
    }, true),
    // PARTIALLY INSTALLED — 8 of 20 up. `installedQty` is driven by the log, not by the
    // boolean, and the client PDF prints it as "8/20 installed".
    mk({
      wpId: 'wp-r-lock', description: 'Locker benches, 6′ hardwood on pedestals', qty: 20, um: 'ea',
      vendor: 'Eastvale Millwork', lead: 6, onsite: day(-6), submittal: 'Approved',
      ordered: true, po: 'PO-4410', poDate: day(-60), shipDate: day(-18),
      delivered: true, receivedQty: 20, receivedDate: day(-18), siteDate: day(-9), installedQty: 8,
      installations: [
        { qty: 5, note: 'Locker room A', date: day(-7) },
        { qty: 3, note: 'Locker room B — rest blocked by flooring', date: day(-3) },
      ],
    }, true),

    /* ----------------------------------------------- Riverside · 10.28 Accessories */
    mk({
      wpId: 'wp-r-acc', description: 'Grab bars, 42" stainless, ADA', qty: 16, um: 'ea',
      vendor: 'Northline Fixtures Co.', lead: 3, onsite: buyBy(3, -1), submittal: 'Pending',
      notes: 'Same product as Northgate — submittal not started here.',
    }, true),
    // Approved product data, but the samples component is still outstanding: the item is
    // "Blocked by submittal" even though the main status line says Approved.
    mk({
      wpId: 'wp-r-acc', description: 'Recessed paper towel / waste combination unit', qty: 9, um: 'ea',
      vendor: 'Beckhorn Washroom Systems', lead: 4, onsite: buyBy(4, 5), submittal: 'Approved',
      sampleReq: true, sampleStatus: 'pending' as const,
    }, true),

    /* ------------------------------------------------------ Riverside · 10.44 Fire */
    // Revise & Resubmit — the submittal was rejected and the item is still slated to be
    // bought as-is. Buy-by has already passed, which is what makes it urgent.
    mk({
      wpId: 'wp-r-fire', description: 'Fire extinguisher cabinets, semi-recessed, 2.5 lb', qty: 8, um: 'ea',
      vendor: 'Fenwick Safety Group', lead: 5, onsite: buyBy(5, -6), submittal: 'Revise & Resubmit',
      notes: 'A/E wants a different door style — resubmit before releasing the PO.',
    }, true),
    mk({
      wpId: 'wp-r-fire', description: 'Fire extinguishers, 2A:10B:C, with brackets', qty: 8, um: 'ea',
      vendor: 'Fenwick Safety Group', lead: 2, onsite: buyBy(2, 40), submittal: 'Approved',
    }, true),

    /* ------------------------------------- Brookfield (supply only) · 12.24 Shades */
    // ON-SITE — the terminal badge for a supply-only package. Identical data on a
    // supply-and-install package would read "in warehouse, awaiting installation";
    // here reaching the jobsite IS the end of the line.
    mk({
      wpId: 'wp-b-shade', description: 'Manual roller shades, 3% openness, classroom wing', qty: 46, um: 'ea',
      vendor: 'Juniper Shade & Drapery', lead: 7, onsite: day(-4), submittal: 'Approved',
      ordered: true, po: 'PO-4388', poDate: day(-70), shipDate: day(-12),
      delivered: true, receivedQty: 46, receivedDate: day(-12), siteDate: day(-4),
      notes: 'Released to the GC’s installer on site.',
    }, true),
    mk({
      wpId: 'wp-b-shade', description: 'Blackout shades, media room', qty: 6, um: 'ea',
      vendor: 'Juniper Shade & Drapery', lead: 7, onsite: buyBy(7, 3), submittal: 'In Review',
    }, true),

    /* ------------------------------ Brookfield (supply only) · 10.26 Wall Protection */
    // The healthy half of the field-measure story: a visit still ahead of us, so its ◆
    // sits on its own date instead of pinned to today. Both rows carry it — one visit per
    // package — and the draft row below already says what it's for.
    mk({
      wpId: 'wp-b-prot', description: 'Corner guards, stainless, 4′ — corridors', qty: 64, um: 'ea',
      vendor: 'Ironwood Wall Systems', lead: 4, onsite: buyBy(4, 21), submittal: 'Approved',
      fieldDate: day(9),
    }, true),
    // Unpublished draft: edited but never saved to the report, so the package shows the
    // "unpublished changes" state and Overview still reports the old snapshot.
    mk({
      wpId: 'wp-b-prot', description: 'Crash rails, vinyl on aluminium retainer', qty: 210, um: 'lf',
      vendor: 'Ironwood Wall Systems', lead: 4, onsite: buyBy(4, 12), submittal: 'Pending',
      fieldDate: day(9),
      notes: 'Quantity still being verified against the field measure.',
    }, false),
  ];

  return {
    projects,
    packages,
    items,
    catalog: WP_CATALOG.map((w) => ({ ...w })),
    vendors: [...VENDORS_SEED],
    thresholds: Object.fromEntries(projects.map((p) => [p.id, { ...DEFAULT_THRESHOLDS }])),
  };
}
