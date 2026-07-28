// logic.test.ts — the safety net for the domain math (SPEC-hardening §3).
//
// logic.ts is pure, so everything here runs without React, without a DOM and without a
// browser. Priorities follow §3.2: migrateDb first (it is the one that protects the
// user's data), then the computeItem short-circuit order, the delivery accumulators,
// the closing rules, backorders, submittals, the date traps and the import normalizers.
//
// The clock is frozen at 2026-07-15 10:00 LOCAL (TZ pinned to UTC-5 in vitest.config.ts)
// so buy-by cuts and the auto-stamped dates are deterministic.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db, DeliveryRecord, MaterialItem, ReportSnapshot } from './types';
import { VENDORS_SEED } from '../seed/catalogs';
import {
  addDays, addDeliveryTo, addInstallTo, applyItemPatch, clearDeliveriesFrom, awaitingInstall, backorderQty, closesAtSite, closingStage,
  computeItem, computeShipDate, daysLate, deliveryLogRows, deliveryTotals, deliveryWatch, diffDays, fmtDays, fmtFileStamp, fmtLong, fmtMDY,
  hasOpenBackorder, INSTALL_DEFAULTS, installCap, isClosed, isPartial, isPartiallyInstalled, itemDirty, itemStage, logDrivesStage, matchVendor,
  migrateDb, normalizeUm, normQty, parseISO, pendingInstallQty, prefixCompare, projectClosesAtSite, removeDeliveryFrom,
  removeInstallFrom, REPORT_FIELDS, snapshot, splitDescription, stagePatch, SUBMITTAL_DEFAULTS, submittalApproved,
  submittalBlockers, today, toISO, totalQty,
} from './logic';

const TODAY = '2026-07-15';

const FROZEN = new Date(2026, 6, 15, 10, 0, 0); // local parts, not UTC

beforeAll(() => vi.useFakeTimers());
// Re-frozen before EVERY test, not once: the date-trap test below moves the clock to
// 10:30pm, and if it restored the time itself a failure there would cascade into every
// test that stamps today() (which is exactly what happened the first time).
beforeEach(() => vi.setSystemTime(FROZEN));
afterAll(() => vi.useRealTimers());

/** A minimal published snapshot — every test overrides only what it is about. */
function snap(over: Partial<ReportSnapshot> = {}): ReportSnapshot {
  return {
    description: 'Grab bars, 42" stainless', qty: 10, um: 'ea', vendor: 'Northline Fixtures Co.', lead: '', onsite: '',
    submittal: 'Approved', delivered: false, ordered: false, po: '', poDate: '', shipDate: '',
    shipDateManual: false, notes: '', receivedQty: 0, receivedDate: '', fieldDate: '',
    ...INSTALL_DEFAULTS, ...SUBMITTAL_DEFAULTS, ...over,
  };
}

function item(over: Partial<MaterialItem> = {}): MaterialItem {
  return { id: 'ix1', wpId: 'wx1', deliveries: [], installations: [], report: null, ...snap(), ...over };
}

/* ============================================================ 1. migrateDb (§3.2.1) */

describe('migrateDb — a database saved by an old version must come back whole', () => {
  // Shaped like a v1.19 base: no install cycle, no supply-only, no partial-delivery
  // fields, thresholds still carrying the retired `buffer` and the old window of 25.
  const legacy = {
    projects: [{ id: 'pA', name: 'Northgate', gc: 'Turner' }],
    packages: [
      { id: 'wA', projectId: 'pA', prefix: '10.28', label: '10.28_ Toilet Accessories', reportSince: '2026-01-02 08:00' },
      { id: 'wB', projectId: 'pA', prefix: '6.83', label: '6.83_ FRP', reportSince: null },
    ],
    items: [
      {
        id: 'iA', wpId: 'wA', description: 'Grab bars', qty: 22, um: 'ea', vendor: 'Northline Fixtures Co.', lead: 3,
        onsite: '2026-10-10', submittal: 'Approved', delivered: true, ordered: true, po: 'PO-1',
        poDate: '2026-02-01', shipDate: '2026-02-22', shipDateManual: false, notes: 'legacy',
        report: { description: 'Grab bars', qty: 22, delivered: true },
      },
    ],
    catalog: [{ prefix: '99.99', label: '99.99_ Custom the user added' }],
    thresholds: { pA: { window: 25, buffer: 10 } },
  } as unknown as Db;

  const out = migrateDb(structuredClone(legacy));

  it('backfills the install cycle without inventing history', () => {
    const it0 = out.items[0];
    expect(it0.siteDate).toBe('');
    expect(it0.installed).toBe(false);
    expect(it0.installedDate).toBe('');
    // A legacy delivered item is "received, still in the warehouse" — exactly what it is.
    expect(itemStage(it0)).toBe('warehouse');
  });

  // Lote 44: a legacy `installed` item had ALL of it up — that is what the boolean has
  // always meant — so the backfill is the whole QTY. Zero would make every closed-out
  // item in the user's base suddenly read "0/22 installed" in the client report.
  it('backfills install quantities from what the boolean already meant', () => {
    const notInstalled = out.items[0];
    expect(notInstalled.installations).toEqual([]);
    expect(notInstalled.installedQty).toBe(0);
    const legacyInstalled = migrateDb(structuredClone({
      ...legacy,
      items: [{ ...legacy.items[0], installed: true, report: { ...legacy.items[0].report, installed: true, qty: 22 } }],
    } as unknown as Db)).items[0];
    expect(legacyInstalled.installedQty).toBe(22);
    expect(legacyInstalled.report!.installedQty).toBe(22);
  });

  it('backfills partial-delivery and submittal-component defaults', () => {
    const it0 = out.items[0];
    expect(it0.receivedQty).toBe(0);
    expect(it0.deliveries).toEqual([]);
    expect(it0.receivedDate).toBe(''); // '' = unknown, never fabricated
    expect(it0.fieldDate).toBe('');
    expect(it0.sampleReq).toBe(false);
    expect(it0.shopStatus).toBe('pending');
  });

  it('keeps every field the old version did have', () => {
    const it0 = out.items[0];
    expect(it0).toMatchObject({ id: 'iA', wpId: 'wA', qty: 22, po: 'PO-1', shipDate: '2026-02-22', notes: 'legacy', delivered: true });
  });

  it('migrates the report snapshot too, or the item reads as dirty forever', () => {
    const rep = out.items[0].report!;
    expect(rep.siteDate).toBe('');
    expect(rep.installed).toBe(false);
    expect(rep.receivedQty).toBe(0);
    expect(rep.qty).toBe(22);
  });

  it('defaults supply-only to false on projects and packages', () => {
    expect(out.projects[0].supplyOnly).toBe(false);
    expect(out.packages.every((p) => p.supplyOnly === false)).toBe(true);
  });

  it('keeps custom catalog entries and re-syncs the seeded ones', () => {
    expect(out.catalog.find((w) => w.prefix === '99.99')?.label).toBe('99.99_ Custom the user added');
    expect(out.catalog.find((w) => w.prefix === '10.28')?.label).toBe('10.28_ Toilet Accessories');
  });

  it('fills the vendor list when the old base had none', () => {
    expect(out.vendors.length).toBeGreaterThan(0);
    expect(out.vendors).toEqual(VENDORS_SEED);
  });

  it('moves the retired window of 25 to the current default and drops `buffer`', () => {
    expect(out.thresholds.pA).toEqual({ window: 7 });
  });

  it('keeps a window the user actually customized', () => {
    const custom = migrateDb({ ...structuredClone(legacy), thresholds: { pA: { window: 14 } } } as Db);
    expect(custom.thresholds.pA.window).toBe(14);
  });

  it('is idempotent — migrating twice changes nothing', () => {
    expect(migrateDb(structuredClone(out))).toEqual(out);
  });

  // Lote 42: the row's Received checkbox patched `delivered` straight through, and
  // applyItemPatch only re-derived the OFCI exemption when the patch touched `po` — so a
  // receipt could land on owner-furnished material. The write path is closed; these are
  // the rows it already stamped, which would otherwise keep counting as "in warehouse"
  // in Overview with no checkbox left to untick them.
  it('drops a receipt that landed on OFCI material, in the item AND its report', () => {
    const dirty = {
      ...structuredClone(legacy),
      items: [{
        ...structuredClone(legacy).items[0], id: 'iOfci', po: 'OFCI', delivered: true,
        receivedDate: '2026-03-04', siteDate: '2026-03-09', installed: true, installedDate: '2026-03-10',
        report: { ...structuredClone(legacy).items[0].report, po: 'OFCI', delivered: true, receivedDate: '2026-03-04' },
      }],
    } as unknown as Db;
    const fixed = migrateDb(dirty).items[0];
    expect(fixed).toMatchObject({ delivered: false, receivedDate: '', siteDate: '' });
    expect(fixed.report).toMatchObject({ delivered: false, receivedDate: '' });
    // Installing owner-furnished material is OUR scope — that stays exactly as it was.
    expect(fixed).toMatchObject({ installed: true, installedDate: '2026-03-10' });
    expect(itemStage(fixed)).toBe('installed');
  });

  it('leaves a normal delivered item alone — the fix is OFCI-only', () => {
    expect(out.items[0]).toMatchObject({ po: 'PO-1', delivered: true });
  });
});

/* ================================================= 2. computeItem order (§3.2.2) */

describe('computeItem — the short-circuit order is the model', () => {
  it('installed wins over everything, OFCI included (we do install OFCI)', () => {
    expect(computeItem(snap({ installed: true, po: 'OFCI', delivered: false })).status).toBe('installed');
  });

  it('OFCI lands on na BEFORE needs-data — it never nags for lead or on-site', () => {
    const r = computeItem(snap({ po: 'ofci', lead: '', onsite: '' }));
    expect(r.status).toBe('na');
    expect(r.buyby).toBe('');
  });

  it('supply-only closes on site; the same item without the scope is just delivered', () => {
    const onSite = snap({ delivered: true, siteDate: '2026-07-10' });
    expect(computeItem(onSite, { window: 7, supplyOnly: true }).status).toBe('on-site');
    expect(computeItem(onSite, { window: 7 }).status).toBe('delivered');
  });

  it('supply-only does NOT close an item still in the warehouse', () => {
    expect(computeItem(snap({ delivered: true, siteDate: '' }), { window: 7, supplyOnly: true }).status).toBe('delivered');
  });

  it('delivered and partial short-circuit before the semaphore', () => {
    expect(computeItem(snap({ delivered: true })).status).toBe('delivered');
    expect(computeItem(snap({ qty: 10, receivedQty: 4 })).status).toBe('partial');
  });

  it('ordered has no buy-by — the purchase already happened', () => {
    const r = computeItem(snap({ ordered: true, lead: 6, onsite: '2026-08-14' }));
    expect(r.status).toBe('ordered');
    expect(r.buyby).toBe('');
    expect(r.days).toBeNull();
  });

  it('needs-data when lead or on-site is missing', () => {
    expect(computeItem(snap({ lead: '', onsite: '2026-08-14' })).status).toBe('needs-data');
    expect(computeItem(snap({ lead: 6, onsite: '' })).status).toBe('needs-data');
    expect(computeItem(snap({ lead: 'n/a', onsite: '2026-08-14' })).status).toBe('needs-data');
  });

  it('Buy-By = On-Site − Lead×7', () => {
    // 2026-08-14 − 6 weeks = 2026-07-03
    expect(computeItem(snap({ lead: 6, onsite: '2026-08-14' })).buyby).toBe('2026-07-03');
  });

  it('cuts order-now / order-soon / planned against the window', () => {
    const at = (buyby: string) => computeItem(snap({ lead: 1, onsite: toISO(addDays(parseISO(buyby), 7)) }));
    expect(at('2026-07-14').status).toBe('order-now');  // buy-by yesterday
    expect(at(TODAY).status).toBe('order-now');         // days === 0 is already NOW
    expect(at('2026-07-16').status).toBe('order-soon'); // 1 day out, inside the 7d window
    expect(at('2026-07-22').status).toBe('order-soon'); // exactly on the window edge
    expect(at('2026-07-23').status).toBe('planned');    // one day past it
  });

  it('honors a custom order-soon window', () => {
    const s = snap({ lead: 1, onsite: '2026-07-30' }); // buy-by 2026-07-23, 8 days out
    expect(computeItem(s, { window: 7 }).status).toBe('planned');
    expect(computeItem(s, { window: 14 }).status).toBe('order-soon');
  });

  it('reports submittal approval alongside the status', () => {
    expect(computeItem(snap({ lead: 1, onsite: '2026-08-30', submittal: 'Approved' })).approved).toBe(true);
    expect(computeItem(snap({ lead: 1, onsite: '2026-08-30', submittal: 'Pending' })).approved).toBe(false);
    expect(computeItem(snap({ lead: '', onsite: '', submittal: 'Pending' })).approved).toBe(false);
  });
});

/* ============================================ 3. deliveryTotals (§3.2.3) */

describe('deliveryTotals — a warehouse release is a movement, not a new receipt', () => {
  const log: DeliveryRecord[] = [
    { qty: 6, note: '', date: '2026-07-01', kind: 'wh-in' },
    { qty: 4, note: '', date: '2026-07-02', kind: 'site' },
    { qty: 6, note: '', date: '2026-07-03', kind: 'wh-out' },
    { qty: 2, note: '', date: '2026-07-04', kind: 'stock' },
  ];

  it('wh-out never adds to received', () => {
    // 6 in + 4 site + 2 stock = 12 received; the 6 released were already counted.
    expect(deliveryTotals(log).received).toBe(12);
  });

  it('keeps the four accumulators apart', () => {
    expect(deliveryTotals(log)).toEqual({ received: 12, onSite: 12, warehouse: 0, stock: 2 });
  });

  it('a warehouse arrival with no release is not on site', () => {
    expect(deliveryTotals([{ qty: 5, note: '', date: '2026-07-01', kind: 'wh-in' }]))
      .toEqual({ received: 5, onSite: 0, warehouse: 5, stock: 0 });
  });

  it('legacy entries with no kind count once, as a plain receipt', () => {
    expect(deliveryTotals([{ qty: 3, note: '', date: '2026-01-01' }, { qty: 2, note: '', date: '2026-01-02' }]))
      .toEqual({ received: 5, onSite: 0, warehouse: 0, stock: 0 });
  });

  it('an empty log is all zeros', () => {
    expect(deliveryTotals([])).toEqual({ received: 0, onSite: 0, warehouse: 0, stock: 0 });
  });

  it('logDrivesStage flips only once an entry carries a kind', () => {
    expect(logDrivesStage([])).toBe(false);
    expect(logDrivesStage([{ qty: 3, note: '', date: '2026-01-01' }])).toBe(false);
    expect(logDrivesStage(log)).toBe(true);
  });

  it('an item on site by its stage fields, with no movements logged, is fully on site', () => {
    // The lote 35.2 bug: the totals were read even when the log owned nothing, so an
    // item already at the jobsite still showed its whole QTY as pending.
    const it = snap({ qty: 10, delivered: true, siteDate: '2026-07-10' });
    const owns = logDrivesStage([]);
    const onSiteShown = owns ? deliveryTotals([]).onSite : (itemStage(it) === 'on-site' || itemStage(it) === 'installed' ? totalQty(it)! : 0);
    expect(onSiteShown).toBe(10);
    expect(totalQty(it)! - onSiteShown).toBe(0);
  });
});

describe('deliveryLogRows — what the PDF prints, which is not just it.deliveries', () => {
  it('registered entries win and are printed one by one', () => {
    const rows = deliveryLogRows(item({
      qty: 10,
      deliveries: [{ qty: 4, note: 'inv 12', date: '2026-07-02', kind: 'site' }, { qty: 6, note: '', date: '2026-07-03', kind: 'wh-in' }],
      delivered: true, siteDate: '2026-07-03',
    }));
    expect(rows.map((r) => [r.qty, r.kind, r.date, r.synthetic]))
      .toEqual([[4, 'site', '2026-07-02', false], [6, 'wh-in', '2026-07-03', false]]);
  });

  it('an item moved with the stage buttons still gets a row', () => {
    // The stage and the log are two different writers and only the log fills
    // `deliveries`, so the exported block used to be silent about material every other
    // screen already showed as delivered.
    expect(deliveryLogRows(item({ qty: 8, delivered: true, siteDate: '2026-05-25', receivedDate: '2026-07-21' })))
      .toEqual([{ qty: 8, kind: 'site', date: '2026-05-25', synthetic: true }]);
  });

  it('received but not on site yet is a plain receipt, dated by the receipt', () => {
    expect(deliveryLogRows(item({ qty: 8, delivered: true, receivedDate: '2026-07-21' })))
      .toEqual([{ qty: 8, kind: undefined, date: '2026-07-21', synthetic: true }]);
  });

  it('an open partial with no log moves only what arrived', () => {
    expect(deliveryLogRows(item({ qty: 10, receivedQty: 4, receivedDate: '2026-07-21' })))
      .toEqual([{ qty: 4, kind: undefined, date: '2026-07-21', synthetic: true }]);
  });

  it('a non-numeric QTY prints its own text instead of a number', () => {
    expect(deliveryLogRows(item({ qty: '1 lot', delivered: true, siteDate: '2026-05-25' }))[0].qty).toBe('1 lot');
  });

  it('nothing received, nothing printed', () => {
    expect(deliveryLogRows(item({ qty: 10 }))).toEqual([]);
  });

  it('OFCI never shows up: we never received it', () => {
    // It cannot even reach `delivered` through stagePatch — but migrated data did.
    expect(deliveryLogRows(item({ qty: 10, po: 'OFCI', delivered: true, siteDate: '2026-05-25' }))).toEqual([]);
  });

  it('never both: entries are the detail, so no summary row is added next to them', () => {
    const rows = deliveryLogRows(item({
      qty: 10, delivered: true, siteDate: '2026-07-03',
      deliveries: [{ qty: 10, note: '', date: '2026-07-03', kind: 'site' }],
    }));
    expect(rows).toHaveLength(1);
  });
});

/* ============================================ 4. closing and waiting (§3.2.4) */

describe('closesAtSite / projectClosesAtSite / isClosed / awaitingInstall', () => {
  it('the package wins, the project is only the fallback', () => {
    expect(closesAtSite({ supplyOnly: true }, { supplyOnly: false })).toBe(true);
    expect(closesAtSite({ supplyOnly: false }, { supplyOnly: true })).toBe(false);
    expect(closesAtSite({}, { supplyOnly: true })).toBe(true); // package predates the flag
    expect(closesAtSite(undefined, undefined)).toBe(false);
  });

  it('a project groups as supply-only by its own flag', () => {
    expect(projectClosesAtSite({ supplyOnly: true }, [{ supplyOnly: false }])).toBe(true);
  });

  it('…or when every one of its packages is marked (the retrofit path)', () => {
    expect(projectClosesAtSite({ supplyOnly: false }, [{ supplyOnly: true }, { supplyOnly: true }])).toBe(true);
  });

  it('a mixed project keeps its own flag, and no packages is not supply-only', () => {
    expect(projectClosesAtSite({ supplyOnly: false }, [{ supplyOnly: true }, { supplyOnly: false }])).toBe(false);
    expect(projectClosesAtSite({ supplyOnly: false }, [])).toBe(false);
  });

  it('closingStage names the last stage of each scope', () => {
    expect(closingStage(true)).toBe('on-site');
    expect(closingStage(false)).toBe('installed');
  });

  it('isClosed: supply-only closes on site, supply-and-install only when installed', () => {
    const onSite = snap({ delivered: true, siteDate: '2026-07-10' });
    expect(isClosed(onSite, true)).toBe(true);
    expect(isClosed(onSite, false)).toBe(false);
    expect(isClosed(snap({ delivered: true, installed: true }), false)).toBe(true);
    // Installed still closes a supply-only item — we got to install it after all.
    expect(isClosed(snap({ delivered: true, siteDate: '', installed: true }), true)).toBe(true);
  });

  it('awaitingInstall: received but not closed, one stage earlier for supply-only', () => {
    const warehouse = snap({ delivered: true });
    const onSite = snap({ delivered: true, siteDate: '2026-07-10' });
    expect(awaitingInstall(warehouse, false)).toBe(true);
    expect(awaitingInstall(warehouse, true)).toBe(true);
    expect(awaitingInstall(onSite, false)).toBe(true);
    expect(awaitingInstall(onSite, true)).toBe(false); // done — nobody on our side installs it
    expect(awaitingInstall(snap({ delivered: false }), false)).toBe(false);
  });

  it('itemStage derives the stage, so no impossible state exists', () => {
    expect(itemStage(snap({ delivered: false }))).toBe('pending');
    expect(itemStage(snap({ delivered: true }))).toBe('warehouse');
    expect(itemStage(snap({ delivered: true, siteDate: '2026-07-10' }))).toBe('on-site');
    expect(itemStage(snap({ delivered: false, installed: true }))).toBe('installed');
  });
});

/* ================================================== 5. backorders (§3.2.5) */

describe('backorder math', () => {
  it('backorderQty = QTY − received, floored at 0', () => {
    expect(backorderQty({ qty: 10, receivedQty: 4 })).toBe(6);
    expect(backorderQty({ qty: 10, receivedQty: 10 })).toBe(0);
    expect(backorderQty({ qty: 10, receivedQty: 14 })).toBe(0); // over-delivery is not negative
  });

  it('a non-numeric QTY has no backorder to track', () => {
    expect(totalQty({ qty: 'lot' })).toBeNull();
    expect(totalQty({ qty: 0 })).toBeNull();
    expect(backorderQty({ qty: 'lot', receivedQty: 4 })).toBeNull();
    expect(hasOpenBackorder({ qty: 'lot', receivedQty: 4 })).toBe(false);
    expect(isPartial({ qty: 'lot', receivedQty: 4, delivered: false })).toBe(false);
  });

  it('isPartial only while something arrived and something is missing', () => {
    expect(isPartial({ qty: 10, receivedQty: 4, delivered: false })).toBe(true);
    expect(isPartial({ qty: 10, receivedQty: 0, delivered: false })).toBe(false);
    expect(isPartial({ qty: 10, receivedQty: 4, delivered: true })).toBe(false);
    expect(isPartial({ qty: 10, receivedQty: 10, delivered: false })).toBe(false);
  });

  it('hasOpenBackorder is what locks the Received checkbox (not the install)', () => {
    expect(hasOpenBackorder({ qty: 10, receivedQty: 4 })).toBe(true);
    expect(hasOpenBackorder({ qty: 10, receivedQty: 10 })).toBe(false);
    expect(hasOpenBackorder({ qty: 10, receivedQty: 0 })).toBe(false);
  });
});

/* ================================================== 6. submittals (§3.2.6) */

describe('submittalApproved / submittalBlockers', () => {
  it('product data alone decides when nothing else is required', () => {
    ['Approved', 'Appr. as Noted', 'N/A'].forEach((s) => expect(submittalApproved(snap({ submittal: s }))).toBe(true));
    ['Pending', 'In Review', 'Revise & Resubmit'].forEach((s) => expect(submittalApproved(snap({ submittal: s }))).toBe(false));
  });

  it('a required component that is not approved blocks the whole item', () => {
    expect(submittalApproved(snap({ submittal: 'Approved', shopReq: true, shopStatus: 'pending' }))).toBe(false);
    expect(submittalApproved(snap({ submittal: 'Approved', shopReq: true, shopStatus: 'approved' }))).toBe(true);
  });

  it('a component that is NOT required is ignored whatever its status', () => {
    expect(submittalApproved(snap({ submittal: 'Approved', sampleReq: false, sampleStatus: 'revise' }))).toBe(true);
  });

  it('blockers name every open front, product data included', () => {
    const blocked = snap({
      submittal: 'Pending', sampleReq: true, sampleStatus: 'pending', shopReq: true, shopStatus: 'revise',
      fieldReq: true, fieldStatus: 'approved', otherReq: true, otherStatus: 'pending', otherNote: ' Fire rating ',
    });
    expect(submittalBlockers(blocked)).toEqual(['Product data', 'Samples', 'Shop drawings', 'Other (Fire rating)']);
  });

  it('"Other" with no note still reads', () => {
    expect(submittalBlockers(snap({ otherReq: true, otherStatus: 'pending', otherNote: '   ' }))).toEqual(['Other']);
  });

  it('nothing blocking is an empty list', () => {
    expect(submittalBlockers(snap({ submittal: 'N/A' }))).toEqual([]);
  });
});

/* ======================================================== 7. date traps (§3.2.7) */

describe('dates — today() is LOCAL, the math is UTC, and it must stay that way', () => {
  it('today() reads local parts (UTC would already be tomorrow after 7pm)', () => {
    vi.setSystemTime(new Date(2026, 6, 15, 22, 30)); // 10:30pm local = 03:30 UTC on the 16th
    expect(today()).toBe('2026-07-15');
    expect(toISO(new Date())).toBe('2026-07-16'); // the exact bug, pinned
  });

  it('parseISO/toISO/addDays are UTC-anchored on purpose — do not "fix" them', () => {
    expect(parseISO('2026-07-15').getUTCDate()).toBe(15);
    expect(toISO(parseISO('2026-07-15'))).toBe('2026-07-15');
    expect(toISO(addDays(parseISO('2026-07-15'), 1))).toBe('2026-07-16');
  });

  it('addDays crosses months, years and a leap day without drifting', () => {
    expect(toISO(addDays(parseISO('2026-07-31'), 1))).toBe('2026-08-01');
    expect(toISO(addDays(parseISO('2026-12-31'), 1))).toBe('2027-01-01');
    expect(toISO(addDays(parseISO('2028-02-28'), 1))).toBe('2028-02-29');
    expect(toISO(addDays(parseISO('2026-07-15'), -42))).toBe('2026-06-03');
  });

  it('diffDays is a − b in whole days', () => {
    expect(diffDays('2026-07-20', TODAY)).toBe(5);
    expect(diffDays(TODAY, '2026-07-20')).toBe(-5);
    expect(diffDays(TODAY, TODAY)).toBe(0);
  });

  it('fmtDays reads like a human', () => {
    expect(fmtDays(0)).toBe('today');
    expect(fmtDays(-3)).toBe('3d ago');
    expect(fmtDays(5)).toBe('in 5d');
  });

  it('fmtMDY / fmtFileStamp / fmtLong', () => {
    expect(fmtMDY('2026-07-15')).toBe('07/15/2026');
    expect(fmtMDY('')).toBe('');
    expect(fmtFileStamp('2026-07-15')).toBe('07152026');
    expect(fmtFileStamp('')).toBe('');
    expect(fmtLong('2026-07-15')).toBe('Wednesday, July 15, 2026');
  });

  it('computeShipDate = PO date + lead weeks, and null without both', () => {
    expect(computeShipDate('2026-07-15', 4)).toBe('2026-08-12');
    expect(computeShipDate('', 4)).toBeNull();
    expect(computeShipDate('2026-07-15', '')).toBeNull();
    expect(computeShipDate('2026-07-15', 'soon')).toBeNull();
  });
});

/* ============================================== 8. import normalizers (§3.2.8) */

describe('normalizers the materials import depends on', () => {
  it('normQty keeps at most 2 decimals and passes non-numbers through', () => {
    expect(normQty('12.345')).toBe(12.35);
    expect(normQty(12.344)).toBe(12.34);
    expect(normQty('  8 ')).toBe(8);
    expect(normQty('')).toBe('');
    expect(normQty('lot')).toBe('lot');
  });

  it('normalizeUm folds free text onto the catalog', () => {
    expect(normalizeUm('Each')).toBe('ea');
    expect(normalizeUm('SQ. FT.')).toBe('sf');
    expect(normalizeUm('Lin. Ft.')).toBe('lf');
    expect(normalizeUm('')).toBe('ea');          // blank defaults to each
    expect(normalizeUm('barrels')).toBe('barrels'); // unknown passes through, nothing is lost
  });

  it('matchVendor canonicalizes casing, then matches by containment, longest first', () => {
    const vendors = ['Northline', 'Northline Fixtures Co.', 'Ironwood Wall Systems'];
    expect(matchVendor('NORTHLINE', vendors)).toBe('Northline');
    expect(matchVendor('Northline Fixtures Co., Inc.', vendors)).toBe('Northline Fixtures Co.');
    expect(matchVendor('Acme Supply', vendors)).toBe('Acme Supply'); // unknown is kept verbatim
    expect(matchVendor('   ', vendors)).toBe('');
  });

  it('prefixCompare orders cost codes numerically, not as text', () => {
    const sorted = ['10.51', '6.83', '10.00_06', '10.21', '9.72'].sort(prefixCompare);
    expect(sorted).toEqual(['6.83', '9.72', '10.00_06', '10.21', '10.51']);
  });

  it('splitDescription splits on the FIRST pipe only', () => {
    expect(splitDescription('TA-5 | Grab bar | 42"')).toEqual({ ref: 'TA-5', product: 'Grab bar | 42"' });
    expect(splitDescription('Grab bar, 42-in')).toEqual({ ref: '', product: 'Grab bar, 42-in' });
    expect(splitDescription('TA-5 |   ')).toEqual({ ref: '', product: 'TA-5 |' }); // empty product = no ref
    expect(splitDescription(' Multi\n line   text ')).toEqual({ ref: '', product: 'Multi line text' });
  });
});

/* ================================ 9. applyItemPatch — the cascades (§3.3) */

describe('applyItemPatch — every cascade the grid relies on', () => {
  it('a PO# orders the item, clearing it reverts to draft', () => {
    expect(applyItemPatch(item(), { po: 'PO-1234' }).ordered).toBe(true);
    expect(applyItemPatch(item({ po: 'PO-1234', ordered: true }), { po: '' }).ordered).toBe(false);
  });

  it('"From Stock" skips straight to delivered and stamps today', () => {
    const out = applyItemPatch(item(), { po: 'from stock' });
    expect(out).toMatchObject({ ordered: true, delivered: true, receivedDate: TODAY });
  });

  it('OFCI drops the item out of procurement and forces submittal N/A', () => {
    const out = applyItemPatch(item({ ordered: true, delivered: true, submittal: 'Approved' }), { po: 'OFCI' });
    expect(out).toMatchObject({ ordered: false, delivered: false, submittal: 'N/A' });
  });

  it('PO date and lead auto-fill the ship date, until the user overrides it', () => {
    const auto = applyItemPatch(item({ lead: 4 }), { poDate: '2026-07-15' });
    expect(auto.shipDate).toBe('2026-08-12');
    expect(auto.shipDateManual).toBe(false);
    const manual = applyItemPatch(auto, { shipDate: '2026-09-01' });
    expect(manual.shipDateManual).toBe(true);
    // Once overridden, a new PO date must not stomp on the user's value.
    expect(applyItemPatch(manual, { poDate: '2026-07-20' }).shipDate).toBe('2026-09-01');
  });

  it('an open backorder blocks Received — the item is not fully here', () => {
    const partial = item({ qty: 10, receivedQty: 4 });
    expect(applyItemPatch(partial, { delivered: true }).delivered).toBe(false);
  });

  // Batch 43: the vendor sends half the order and the rest slips, so the PM puts up what
  // arrived instead of leaving the crew idle. The install goes through; the RECEIPT does
  // not, or the backorder (and the form for registering the rest) would vanish.
  it('an open backorder no longer blocks Installed, and no receipt is back-filled', () => {
    const partial = item({ qty: 10, receivedQty: 4 });
    const out = applyItemPatch(partial, { installed: true });
    expect(out).toMatchObject({ installed: true, installedDate: TODAY, delivered: false, receivedDate: '' });
    expect(backorderQty(out)).toBe(6);
  });

  it('marking installed back-fills the receipt (material shipped straight to site)', () => {
    const out = applyItemPatch(item(), { installed: true });
    expect(out).toMatchObject({ installed: true, delivered: true, receivedDate: TODAY, installedDate: TODAY });
  });

  it('…except for OFCI, which closes installed with delivered still false', () => {
    const out = applyItemPatch(item({ po: 'OFCI' }), { installed: true });
    expect(out).toMatchObject({ installed: true, delivered: false, installedDate: TODAY });
  });

  it('un-receiving invalidates everything downstream', () => {
    const onSite = item({ delivered: true, receivedDate: '2026-07-01', siteDate: '2026-07-05', installed: true, installedDate: '2026-07-08' });
    expect(applyItemPatch(onSite, { delivered: false })).toMatchObject({
      delivered: false, receivedDate: '', siteDate: '', installed: false, installedDate: '',
    });
  });

  it('a receivedDate that comes in the patch is respected, not overwritten', () => {
    expect(applyItemPatch(item(), { delivered: true, receivedDate: '2026-06-01' }).receivedDate).toBe('2026-06-01');
  });

  it('qty is normalized on the way in', () => {
    expect(applyItemPatch(item(), { qty: '12.345' }).qty).toBe(12.35);
  });

  it('leaves untouched fields alone', () => {
    const before = item({ notes: 'keep me', vendor: 'Northline Fixtures Co.' });
    const after = applyItemPatch(before, { description: 'New description' });
    expect(after).toMatchObject({ notes: 'keep me', vendor: 'Northline Fixtures Co.', description: 'New description' });
  });
});

/* ==================== 10. the consolidated stage writer (SPEC-hardening §8) */

// Before the consolidation the same "mark as 🏭 / 📍 / 🔩" existed three times: the two
// popovers built a patch with `stagePatch`, the modal hand-wrote its own, and the delivery
// log re-derived the fields inside AppContext. These tests pin the three rules that the
// three implementations used to disagree on, plus the arbitration that only one of them
// enforced.
describe('stagePatch — one writer, one set of rules', () => {
  it('an explicit date wins over the stamp the item already has', () => {
    const it = item({ delivered: true, siteDate: '2026-07-01' });
    expect(stagePatch('on-site', '2026-07-20', it).siteDate).toBe('2026-07-20');
    expect(stagePatch('installed', '2026-07-20', it).installedDate).toBe('2026-07-20');
  });

  it('a blank date preserves the existing stamp instead of overwriting it with today', () => {
    const it = item({ delivered: true, siteDate: '2026-07-01', installedDate: '2026-07-02' });
    expect(stagePatch('on-site', '', it).siteDate).toBe('2026-07-01');
    expect(stagePatch('installed', '', it).installedDate).toBe('2026-07-02');
  });

  it('a blank date on an unstamped item falls back to today', () => {
    expect(stagePatch('on-site', '', item()).siteDate).toBe(TODAY);
    expect(stagePatch('installed', '', item()).installedDate).toBe(TODAY);
  });

  it('warehouse writes the received date only when one was given', () => {
    expect(stagePatch('warehouse', '', item())).toEqual({ delivered: true, siteDate: '', installed: false });
    expect(stagePatch('warehouse', '2026-07-10', item())).toMatchObject({ receivedDate: '2026-07-10' });
  });

  it('never marks OFCI material as received — it is out of our procurement flow', () => {
    const ofci = item({ po: 'OFCI' });
    expect(stagePatch('warehouse', '', ofci)).not.toHaveProperty('delivered');
    expect(stagePatch('on-site', '', ofci)).not.toHaveProperty('delivered');
    expect(stagePatch('warehouse', '2026-07-14', ofci)).not.toHaveProperty('receivedDate');
    // …but installing it still closes the lifecycle (we do install owner-furnished work).
    expect(stagePatch('installed', '', ofci)).toMatchObject({ installed: true });
  });

  // The OFCI row tracks ONE thing — installed or not (SPEC-delivery-watch §8) — so
  // 'pending' has to be the way back out of 🔩. It used to return {}, which left the
  // un-install reachable only by clicking 🏭, a stage OFCI can never actually be in.
  it('on OFCI, pending means NOT INSTALLED — the 🚚 ↔ 🔩 pair is exhaustive', () => {
    const ofci = item({ po: 'OFCI' });
    expect(stagePatch('pending', '', ofci)).toEqual({ installed: false });
    const installed = applyItemPatch(ofci, stagePatch('installed', '2026-07-10', ofci));
    expect(installed).toMatchObject({ installed: true, installedDate: '2026-07-10', delivered: false });
    const back = applyItemPatch(installed, stagePatch('pending', '', installed));
    expect(back).toMatchObject({ installed: false, installedDate: '', delivered: false, receivedDate: '' });
  });

  // A partially delivered item lands on the SAME one axis as an OFCI row (batch 43): the
  // install is open to it but the receipt is not, so 🏭 / 📍 — which both read `delivered`
  // — are unreachable and 'pending' has to mean "not installed", or 🔩 is a one-way door.
  it('on a partially delivered item, pending means NOT INSTALLED and no receipt is written', () => {
    const partial = item({ qty: 10, receivedQty: 4 });
    expect(stagePatch('pending', '', partial)).toEqual({ installed: false });
    expect(stagePatch('warehouse', '2026-07-14', partial)).not.toHaveProperty('delivered');
    expect(stagePatch('warehouse', '2026-07-14', partial)).not.toHaveProperty('receivedDate');
    const installed = applyItemPatch(partial, stagePatch('installed', '2026-07-10', partial));
    expect(installed).toMatchObject({ installed: true, installedDate: '2026-07-10', delivered: false });
    const back = applyItemPatch(installed, stagePatch('pending', '', installed));
    expect(back).toMatchObject({ installed: false, installedDate: '', delivered: false });
    expect(backorderQty(back)).toBe(6);
  });

  it('pending un-receives, and applyItemPatch invalidates everything downstream', () => {
    const onSite = item({ delivered: true, receivedDate: '2026-07-01', siteDate: '2026-07-05' });
    const out = applyItemPatch(onSite, stagePatch('pending', '', onSite));
    expect(out).toMatchObject({ delivered: false, receivedDate: '', siteDate: '', installed: false });
  });

  it('refuses the write once the delivery log owns the stage', () => {
    const logged = item({ deliveries: [{ qty: 4, note: '', date: '2026-07-01', kind: 'wh-in' }] });
    expect(stagePatch('on-site', '2026-07-20', logged)).toEqual({});
    expect(stagePatch('installed', '', logged)).toEqual({});
    expect(stagePatch('pending', '', logged)).toEqual({});
  });

  // The bug the arbitration rule existed for but only the modal enforced: a manual
  // on-site write landed, and the next warehouse entry silently pulled the item back to
  // 🏭 because siteDateFromLog recomputed it. Now the manual write never lands.
  it('so a later log entry can no longer silently revert a manual stage', () => {
    const logged = item({ qty: 10, deliveries: [{ qty: 4, note: '', date: '2026-07-01', kind: 'wh-in' }] });
    const afterManual = applyItemPatch(logged, stagePatch('on-site', '2026-07-20', logged));
    expect(itemStage(afterManual)).toBe(itemStage(logged));
    expect(addDeliveryTo(afterManual, { qty: 3, note: '', date: '2026-07-21', kind: 'wh-in' }).siteDate).toBe('');
  });

  it('a plain legacy receipt (no kind) does NOT hand the stage to the log', () => {
    const plain = item({ deliveries: [{ qty: 4, note: '', date: '2026-07-01' }] });
    expect(stagePatch('installed', '', plain)).toMatchObject({ installed: true });
  });
});

describe('the delivery log as the other stage writer', () => {
  const ten = () => item({ qty: 10 });

  it('completing the ordered QTY receives the item and stamps the date', () => {
    const out = addDeliveryTo(ten(), { qty: 10, note: 'INV-1', date: '2026-07-10' });
    expect(out).toMatchObject({ delivered: true, receivedQty: 10, receivedDate: TODAY });
  });

  it('a partial entry never un-receives an item the PM ticked by hand', () => {
    const ticked = item({ qty: 10, delivered: true, receivedDate: '2026-07-01' });
    expect(addDeliveryTo(ticked, { qty: 2, note: '', date: '2026-07-10' }).delivered).toBe(true);
  });

  it('the whole QTY reaching the site derives the on-site date from the last leg', () => {
    const out = addDeliveryTo(ten(), { qty: 10, note: '', date: '2026-07-09', kind: 'site' });
    expect(out.siteDate).toBe('2026-07-09');
    expect(itemStage(out)).toBe('on-site');
  });

  it('a warehouse arrival is received but NOT on site', () => {
    const out = addDeliveryTo(ten(), { qty: 10, note: '', date: '2026-07-09', kind: 'wh-in' });
    expect(out).toMatchObject({ delivered: true, siteDate: '' });
    expect(itemStage(out)).toBe('warehouse');
  });

  it('a release moves material already counted — it never receives twice', () => {
    const arrived = addDeliveryTo(ten(), { qty: 10, note: '', date: '2026-07-09', kind: 'wh-in' });
    const released = addDeliveryTo(arrived, { qty: 10, note: '', date: '2026-07-12', kind: 'wh-out' });
    expect(released.receivedQty).toBe(10);
    expect(itemStage(released)).toBe('on-site');
    expect(released.siteDate).toBe('2026-07-12');
  });

  it('ignores an entry with no quantity', () => {
    expect(addDeliveryTo(ten(), { qty: 0, note: '', date: '2026-07-09' }).deliveries).toHaveLength(0);
  });

  it('removing an entry reopens the delivery and invalidates what was downstream', () => {
    const full = addDeliveryTo(ten(), { qty: 10, note: '', date: '2026-07-09', kind: 'site' });
    const installed = applyItemPatch(full, { installed: true });
    expect(installed).toMatchObject({ installed: true, installedDate: TODAY });
    const out = removeDeliveryFrom(installed, 0);
    expect(out).toMatchObject({
      delivered: false, receivedQty: 0, receivedDate: '', siteDate: '', installed: false, installedDate: '',
    });
  });

  it('removing one of several entries only drops the item back to partial', () => {
    const a = addDeliveryTo(ten(), { qty: 6, note: '', date: '2026-07-09' });
    const b = addDeliveryTo(a, { qty: 4, note: '', date: '2026-07-10' });
    expect(b.delivered).toBe(true);
    const out = removeDeliveryFrom(b, 1);
    expect(out).toMatchObject({ delivered: false, receivedQty: 6 });
    expect(isPartial(out)).toBe(true);
  });
});

describe('clearDeliveriesFrom — the escape hatch for "I logged this wrong from scratch"', () => {
  it('wipes the log and goes back to not received', () => {
    const partial = item({ qty: 10, receivedQty: 3, deliveries: [{ qty: 3, note: 'oops', date: '2026-07-10' }] });
    expect(clearDeliveriesFrom(partial)).toMatchObject({ deliveries: [], receivedQty: 0, delivered: false, receivedDate: '' });
  });

  it('also unwinds on-site / installed if the log was the only thing holding them up', () => {
    const full = addDeliveryTo(item({ qty: 10 }), { qty: 10, note: '', date: '2026-07-09', kind: 'site' });
    const installed = applyItemPatch(full, { installed: true });
    expect(installed.installed).toBe(true);
    expect(clearDeliveriesFrom(installed)).toMatchObject({ installed: false, installedDate: '', siteDate: '', delivered: false });
  });

  it('is a no-op on an item with no deliveries', () => {
    const clean = item();
    expect(clearDeliveriesFrom(clean)).toMatchObject({ deliveries: [], receivedQty: 0, delivered: false });
  });
});

/* ============================================ 11. delivery watch (SPEC-delivery-watch) */

// The third clock: "did it arrive?". Same shape as the computeItem block above — the
// SHORT-CIRCUIT ORDER *is* the model, so it gets tested before any single verdict, and
// the date cuts are read off the frozen clock rather than computed by hand.
describe('deliveryWatch — the order of the short-circuit is the model', () => {
  // Bought, promised for the 1st, still not here on the 15th: the case the clock exists for.
  const ordered = (over: Partial<ReportSnapshot> = {}) => snap({ ordered: true, po: 'PO-778', shipDate: '2026-07-01', ...over });

  it('arrived wins over a promised date that already passed', () => {
    expect(deliveryWatch(ordered({ delivered: true }))).toBe('arrived');
    expect(deliveryWatch(ordered({ installed: true }))).toBe('arrived');
  });

  it('OFCI is not ours to chase, even bought and overdue on paper', () => {
    expect(deliveryWatch(ordered({ po: 'OFCI' }))).toBe('na');
    expect(deliveryWatch(ordered({ po: 'ofci' }))).toBe('na');
  });

  it('a ship date without a PO is junk, not an alert', () => {
    expect(deliveryWatch(ordered({ ordered: false, po: '' }))).toBe('na');
  });

  it('bought with no promised date is unknown — the print report calls it "Confirm Date"', () => {
    expect(deliveryWatch(ordered({ shipDate: '' }))).toBe('unknown');
  });

  it('the cut is exact: today is DUE, yesterday is LATE', () => {
    expect(deliveryWatch(ordered({ shipDate: TODAY }))).toBe('due');
    expect(deliveryWatch(ordered({ shipDate: '2026-07-14' }))).toBe('late');
  });

  it('the window is the order-soon threshold, and its edge counts as due', () => {
    expect(deliveryWatch(ordered({ shipDate: '2026-07-22' }))).toBe('due');       // today + 7
    expect(deliveryWatch(ordered({ shipDate: '2026-07-23' }))).toBe('scheduled'); // today + 8
    // No second threshold: a widened window moves this cut and nothing else.
    expect(deliveryWatch(ordered({ shipDate: '2026-07-23' }), { window: 14 })).toBe('due');
  });

  it('a partial delivery is not an arrival — material is still owed', () => {
    expect(deliveryWatch(ordered({ receivedQty: 4, qty: 10 }))).toBe('late');
  });

  // Batch 43 opened the install to partially delivered items, which made "installed" a
  // reachable state with material still owed. The half that never showed up is exactly
  // what this clock exists to chase, so 🔩 must not silence it.
  it('installing what arrived does not stop the clock on what did not', () => {
    expect(deliveryWatch(ordered({ receivedQty: 4, qty: 10, installed: true }))).toBe('late');
    // …and it goes quiet the moment the backorder closes.
    expect(deliveryWatch(ordered({ receivedQty: 10, qty: 10, installed: true }))).toBe('arrived');
  });

  it('daysLate counts calendar days, and only once the date has passed', () => {
    expect(daysLate({ shipDate: '2026-07-01' })).toBe(14);
    expect(daysLate({ shipDate: TODAY })).toBe(null);      // due, not late
    expect(daysLate({ shipDate: '2026-08-01' })).toBe(null);
    expect(daysLate({ shipDate: '' })).toBe(null);
  });
});

/* ============================================ 12. install quantities (SPEC-install-qty) */

// The chain is qty ≥ receivedQty ≥ installedQty, and the whole point of the feature is
// the second ">=": you cannot put up what has not arrived. Two owners of the number,
// never both — the LOG when it has entries, the BOOLEAN when it doesn't — so the tests
// are grouped that way.
describe('installCap — you cannot install what has not arrived', () => {
  it('caps at what was received while a backorder is open', () => {
    expect(installCap({ qty: 10, receivedQty: 4, delivered: false })).toBe(4);
  });

  it('a fully received item can install everything', () => {
    expect(installCap({ qty: 10, receivedQty: 10, delivered: true })).toBe(10);
  });

  // Ticking Received in the grid never logs entries, so receivedQty stays 0 while the
  // whole QTY is in fact here — same reading `receivedShown` takes in the modal.
  it('an item ticked Received by hand has all of it here, receivedQty 0 or not', () => {
    expect(installCap({ qty: 10, receivedQty: 0, delivered: true })).toBe(10);
  });

  it('nothing received, nothing to install', () => {
    expect(installCap({ qty: 10, receivedQty: 0, delivered: false })).toBe(0);
  });

  it('a non-numeric QTY has no quantities at all — only the boolean lives there', () => {
    expect(installCap({ qty: 'lot', receivedQty: 4, delivered: true })).toBe(null);
    expect(pendingInstallQty({ qty: 'lot', receivedQty: 4, delivered: true, installedQty: 0 })).toBe(null);
  });
});

describe('install quantities — the log owns the number, or the boolean does', () => {
  const received = (over: Partial<MaterialItem> = {}) => item({ qty: 10, receivedQty: 10, delivered: true, receivedDate: '2026-07-05', ...over });

  it('with no log, 🔩 means ALL of it', () => {
    const out = applyItemPatch(received(), { installed: true });
    expect(out).toMatchObject({ installed: true, installedQty: 10, installedDate: TODAY });
    expect(isPartiallyInstalled(out)).toBe(false);
  });

  it('un-installing puts the number back to zero — no orphan count, no orphan date', () => {
    const on = applyItemPatch(received(), { installed: true });
    expect(applyItemPatch(on, { installed: false })).toMatchObject({ installed: false, installedQty: 0, installedDate: '' });
  });

  it('a non-numeric QTY keeps the boolean and never invents a count', () => {
    const out = applyItemPatch(received({ qty: 'lot' }), { installed: true });
    expect(out).toMatchObject({ installed: true, installedQty: 0 });
  });

  it('entries add up, and the item stays OPEN until they reach the QTY', () => {
    let out = addInstallTo(received(), { qty: 3, note: 'crew A', date: '2026-07-10' });
    expect(out).toMatchObject({ installedQty: 3, installed: false });
    expect(isPartiallyInstalled(out)).toBe(true);
    out = addInstallTo(out, { qty: 2, note: 'crew A', date: '2026-07-14' });
    expect(out).toMatchObject({ installedQty: 5, installed: false });
    expect(pendingInstallQty(out)).toBe(5);
  });

  // The crew finished on the 18th; the PM types it in on the 25th. The stamp is the
  // work, not the paperwork — same rule siteDateFromLog follows.
  it('the entry that reaches the QTY closes the item, stamped with the LAST leg', () => {
    let out = addInstallTo(received(), { qty: 6, note: '', date: '2026-07-10' });
    out = addInstallTo(out, { qty: 4, note: '', date: '2026-07-18' });
    expect(out).toMatchObject({ installedQty: 10, installed: true, installedDate: '2026-07-18' });
    expect(isPartiallyInstalled(out)).toBe(false);
  });

  it('an entry never records more than what arrived', () => {
    const partial = item({ qty: 10, receivedQty: 4, delivered: false });
    const out = addInstallTo(partial, { qty: 9, note: 'optimistic', date: '2026-07-10' });
    expect(out.installedQty).toBe(4);
    expect(out.installations[0].qty).toBe(4);
    expect(out.installed).toBe(false); // 4 of 10 — the other 6 never even shipped
    expect(addInstallTo(out, { qty: 1, note: '', date: '2026-07-11' }).installations).toHaveLength(1);
  });

  it('undoing an entry reopens the install', () => {
    let out = addInstallTo(received(), { qty: 10, note: '', date: '2026-07-10' });
    expect(out.installed).toBe(true);
    out = removeInstallFrom(out, 0);
    expect(out).toMatchObject({ installedQty: 0, installed: false, installedDate: '', installations: [] });
  });

  // The units were never here, so they were never installed. Leaving the entries behind
  // would let them re-derive the install right back on the next patch.
  it('un-receiving wipes the installation log with everything else downstream', () => {
    const up = addInstallTo(received(), { qty: 10, note: '', date: '2026-07-10' });
    expect(applyItemPatch(up, { delivered: false })).toMatchObject({
      delivered: false, installed: false, installedQty: 0, installations: [], siteDate: '',
    });
  });

  it('installedQty is published — the client report reads it off the snapshot', () => {
    expect(REPORT_FIELDS).toContain('installedQty');
    const up = addInstallTo(received({ report: snap({ qty: 10 }) }), { qty: 3, note: '', date: '2026-07-10' });
    expect(itemDirty(up)).toBe(true);
    expect(snapshot(up).installedQty).toBe(3);
  });
});
