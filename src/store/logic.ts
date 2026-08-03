// logic.ts — the domain engine: the buy-by / install / delivery clocks, the status
// cascade, the draft-vs-report layering, the stage writer and the import normalizers.
// Pure functions only — AppContext owns the state, this file owns the rules, and
// logic.test.ts covers it. Row classification lives in `materialsImport.ts` (specific
// to that import) and the demo database in `../seed/demoData.ts`.
import { VENDORS_SEED, WP_CATALOG } from '../seed/catalogs';
import type { Cfg, ComputedItem, Db, DeliveryKind, DeliveryRecord, InstallRecord, ItemStage, ItemStatus, MaterialItem, Project, ReportSnapshot, SubmittalCompStatus, Thresholds, WorkPackage } from './types';

/* ----------------------------------------------------------------- date utils */
// Real "today" — this is a live tracker, not a frozen demo, so buy-by dates and the
// semaphore recompute against the machine's actual current date. Built from LOCAL
// date parts: toISO(new Date()) would give the UTC date, which is already tomorrow
// after 7pm for a UTC-5 user. (toISO/parseISO/addDays stay UTC-anchored — that's
// self-consistent date MATH on ISO strings, not a "now" reading.)
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseISO(s: string): Date {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toISO(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}
export function addDays(dt: Date, n: number): Date {
  const d = new Date(dt);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);
}
export function fmtDays(n: number): string {
  if (n === 0) return 'today';
  if (n < 0) return `${-n}d ago`;
  return `in ${n}d`;
}
/** Strict MM/DD/YYYY display format (Buy-By, PDF export dates). */
export function fmtMDY(iso: string): string {
  const [y, m, d] = String(iso ?? '').split('-');
  if (!y || !m || !d) return iso ?? '';
  return `${m}/${d}/${y}`;
}

/** Compact MMDDYYYY stamp — the exported PDF's default filename ("…- 07222026"). */
export function fmtFileStamp(iso: string): string {
  const [y, m, d] = String(iso ?? '').split('-');
  return y && m && d ? `${m}${d}${y}` : '';
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Long human date, e.g. "Wednesday, July 15, 2026" (full weekday + full month). */
export function fmtLong(iso: string): string {
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return iso ?? '';
  return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Spec / Arq Ref. | Item Description" convention (Lote 22): the part before the
 * first "|" is the architect's spec/plan reference. The pipe was chosen over the
 * hyphen because hyphens occur naturally inside item names ("42-in", "TA-5") and
 * misclassified refs. No pipe → no ref, the whole text is the product (ref = '').
 * Newlines collapse — the cover's fields are single-line. */
export function splitDescription(desc: string): { ref: string; product: string } {
  const clean = String(desc ?? '').replace(/\s+/g, ' ').trim();
  const i = clean.indexOf('|');
  if (i >= 0) {
    const product = clean.slice(i + 1).trim();
    if (product) return { ref: clean.slice(0, i).trim(), product };
  }
  return { ref: '', product: clean };
}

/** QTY normalizer — numeric quantities carry at most 2 decimals (import and manual
 * entry both funnel through this) so QTY never overflows into the U/M column. */
export function normQty(v: number | string): number | string {
  const s = String(v ?? '').trim();
  if (s === '') return '';
  const n = Number(s);
  if (!isFinite(n)) return s;
  return Math.round(n * 100) / 100;
}

/** Numeric-aware cost-code prefix order: 6.83 < 9.72 < 10.00_06 < 10.21 < 10.51. */
export function prefixCompare(a: string, b: string): number {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/* ----------------------------------------------------------------- catalogs */
export const SUBMITTALS = ['Pending', 'In Review', 'Approved', 'Appr. as Noted', 'Revise & Resubmit', 'N/A'];
export const APPROVED = new Set(['Approved', 'Appr. as Noted', 'N/A']);
/** Product-data submittal blocked = Pending / In Review / Revise & Resubmit. */
export function submittalBlocked(status: string): boolean {
  return !APPROVED.has(status);
}

/* ---- Submittal-cycle components (Breakdown Submittals) ---- */
export const SUB_STATUSES: SubmittalCompStatus[] = ['pending', 'approved', 'revise'];
export const SUB_STATUS_LABEL: Record<SubmittalCompStatus, string> = { pending: 'Pending', approved: 'Approved', revise: 'Revise & Resubmit' };
/** Default (no extra components required) — spread into every new/migrated item. */
export const SUBMITTAL_DEFAULTS = {
  sampleReq: false, sampleStatus: 'pending', shopReq: false, shopStatus: 'pending', fieldReq: false, fieldStatus: 'pending', otherReq: false, otherStatus: 'pending', otherNote: '',
} satisfies Pick<ReportSnapshot, 'sampleReq' | 'sampleStatus' | 'shopReq' | 'shopStatus' | 'fieldReq' | 'fieldStatus' | 'otherReq' | 'otherStatus' | 'otherNote'>;

type SubR = Pick<ReportSnapshot, 'submittal' | 'sampleReq' | 'sampleStatus' | 'shopReq' | 'shopStatus' | 'fieldReq' | 'fieldStatus' | 'otherReq' | 'otherStatus' | 'otherNote'>;
/** True only when product data AND every required component are approved. */
export function submittalApproved(r: SubR): boolean {
  if (!APPROVED.has(r.submittal)) return false;
  if (r.sampleReq && r.sampleStatus !== 'approved') return false;
  if (r.shopReq && r.shopStatus !== 'approved') return false;
  if (r.fieldReq && r.fieldStatus !== 'approved') return false;
  if (r.otherReq && r.otherStatus !== 'approved') return false;
  return true;
}
/** The specific components still blocking the order, for the alerts. */
export function submittalBlockers(r: SubR): string[] {
  const out: string[] = [];
  if (!APPROVED.has(r.submittal)) out.push('Product data');
  if (r.sampleReq && r.sampleStatus !== 'approved') out.push('Samples');
  if (r.shopReq && r.shopStatus !== 'approved') out.push('Shop drawings');
  if (r.fieldReq && r.fieldStatus !== 'approved') out.push('Field measurements');
  if (r.otherReq && r.otherStatus !== 'approved') out.push(r.otherNote.trim() ? `Other (${r.otherNote.trim()})` : 'Other');
  return out;
}
/** A scheduled field-measure visit that nobody has confirmed yet. The date is a PLAN,
 * not a record: it says when we mean to go, never that we went. The one thing that says
 * the measurements were actually taken is the Field measurements component reading
 * Approved — so until it does, the visit is still open and its ◆ stays on the Overview
 * timeline, pinned to today once the date is past. `fieldReq` deliberately does NOT gate
 * this: an unrequired component is one that doesn't block the ORDER, which has nothing to
 * do with whether the crew went out. */
export function fieldMeasurePending(r: Pick<ReportSnapshot, 'fieldDate' | 'fieldStatus'>): boolean {
  return !!r.fieldDate && r.fieldStatus !== 'approved';
}
/** Item still awaiting submittal approval — drives the optional client-PDF summary:
 * not yet delivered and at least one submittal component (product data, samples, shop
 * drawings, field measurements, other) unapproved. */
export function pendingSubmittalApproval(it: ReportSnapshot): boolean {
  return !it.delivered && submittalBlockers(it).length > 0;
}
/** Install-cycle defaults — spread into every new/migrated item (see itemStage). */
export const INSTALL_DEFAULTS = {
  siteDate: '', installed: false, installedDate: '', installedQty: 0,
} satisfies Pick<ReportSnapshot, 'siteDate' | 'installed' | 'installedDate' | 'installedQty'>;

export const UNITS = ['ea', 'sf', 'lf', 'sy', 'ls', 'gal', 'set', 'sheet', 'in'];

/* U/M normalization — imports arrive with free-text units ("Each", "SQ FT", "Lin. Ft.");
 * everything maps onto the UNITS catalog so the list stays uniform. */
const UM_SYNONYMS: Record<string, string> = {
  ea: 'ea', each: 'ea', unit: 'ea', units: 'ea', pc: 'ea', pcs: 'ea', piece: 'ea', pieces: 'ea',
  sf: 'sf', 'sq ft': 'sf', sqft: 'sf', 'square feet': 'sf', 'square foot': 'sf', ft2: 'sf',
  lf: 'lf', 'lin ft': 'lf', 'linear ft': 'lf', 'linear feet': 'lf', 'linear foot': 'lf',
  sy: 'sy', 'sq yd': 'sy', sqyd: 'sy', 'square yard': 'sy', 'square yards': 'sy',
  ls: 'ls', 'lump sum': 'ls', lumpsum: 'ls',
  gal: 'gal', gallon: 'gal', gallons: 'gal',
  set: 'set', sets: 'set',
  sheet: 'sheet', sheets: 'sheet', sht: 'sheet',
  in: 'in', inch: 'in', inches: 'in',
};
export function normalizeUm(raw: string): string {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  return UM_SYNONYMS[s] ?? (s || 'ea');
}

/** Vendor matcher for imports — case-insensitive exact match canonicalizes casing;
 * then a containment match ("Northline Inc." ↔ "Northline", longest hit wins); anything
 * unknown passes through untouched so no data is lost. */
export function matchVendor(raw: string, vendors: string[]): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  const exact = vendors.find((v) => v.toLowerCase() === lower);
  if (exact) return exact;
  if (lower.length >= 3) {
    const partial = vendors
      .filter((v) => v.length >= 3 && (lower.includes(v.toLowerCase()) || v.toLowerCase().includes(lower)))
      .sort((a, b) => b.length - a.length)[0];
    if (partial) return partial;
  }
  return s;
}

/* ----------------------------------------------------------------- buy-by + status
 * On-Site Req. Date − Lead Time = BUY-BY DATE
 * Then buy-by vs today lands the item on a semaphore. */
export const REPORT_FIELDS: (keyof ReportSnapshot)[] = [
  'description', 'qty', 'um', 'vendor', 'lead', 'onsite',
  'submittal', 'delivered', 'ordered', 'po', 'poDate', 'shipDate', 'shipDateManual', 'notes', 'receivedQty', 'receivedDate', 'fieldDate',
  'siteDate', 'installed', 'installedDate', 'installedQty',
  'sampleReq', 'sampleStatus', 'shopReq', 'shopStatus', 'fieldReq', 'fieldStatus', 'otherReq', 'otherStatus', 'otherNote',
];

export const DEFAULT_THRESHOLDS: Thresholds = { window: 7 };

/** Anticipated Ship/Delivery Date auto-calculation: PO Date + Lead Time. */
export function computeShipDate(poDate: string, lead: number | string): string | null {
  if (!poDate || lead === '' || lead == null || isNaN(Number(lead))) return null;
  return toISO(addDays(parseISO(poDate), Number(lead) * 7));
}

/* ----------------------------------------------------------------- PM lifecycle
 * DRAFT → ORDERED → DELIVERED / IN. PO# is the trigger: any value orders it, the
 * literal value "From Stock" skips straight to delivered. Both are pure derivations
 * off `po` / `delivered` — no separate status field to fall out of sync. */
export function isFromStock(po: string): boolean {
  return String(po ?? '').trim().toLowerCase() === 'from stock';
}

/* Owner Furnished, Contractor Installed. Typing "OFCI" in the PO# field marks the item
 * as owner-supplied: it drops out of our procurement flow entirely — status N/A, no
 * buy-by, no lead time / dates required, submittal auto-set to N/A (see applyItemPatch). */
export function isOfci(po: string): boolean {
  return String(po ?? '').trim().toLowerCase() === 'ofci';
}

/* Partial deliveries (Breakdown Delivery). Backorder = total QTY − received so far.
 * Tracking only kicks in once something was received AND the QTY is a usable number. */
export function totalQty(it: { qty: number | string }): number | null {
  const n = Number(it.qty);
  return isNaN(n) || n <= 0 ? null : n;
}
export function backorderQty(it: { qty: number | string; receivedQty: number }): number | null {
  const total = totalQty(it);
  if (total == null) return null;
  return Math.max(0, total - (it.receivedQty || 0));
}
export function isPartial(it: { qty: number | string; receivedQty: number; delivered: boolean }): boolean {
  if (it.delivered || !it.receivedQty) return false;
  const back = backorderQty(it);
  return back != null && back > 0;
}
/** What the delivery log adds up to. An ARRIVAL (straight to the jobsite, into the
 * warehouse, or pulled from our own stock) counts as received; a warehouse → site
 * release is a MOVEMENT of material already counted, so it never adds twice. Legacy
 * entries have no kind and count only as a plain receipt. */
export function deliveryTotals(deliveries: DeliveryRecord[]) {
  let received = 0, onSite = 0, warehouse = 0, stock = 0;
  deliveries.forEach((d) => {
    const q = d.qty || 0;
    if (d.kind !== 'wh-out') received += q;
    if (d.kind === 'site' || d.kind === 'stock' || d.kind === 'wh-out') onSite += q;
    if (d.kind === 'wh-in') warehouse += q;
    if (d.kind === 'wh-out') warehouse -= q;
    if (d.kind === 'stock') stock += q;
  });
  return { received, onSite, warehouse, stock };
}
/** True once the log records movements (the supply-only flow) — from then on the log,
 * not the stage buttons, decides where the material is. */
export function logDrivesStage(deliveries: DeliveryRecord[]): boolean {
  return deliveries.some((d) => !!d.kind);
}
/** On-site date derived from the delivery log. Only kicks in once the log records
 * movements — otherwise the stage writers keep owning the date. The item is on site when
 * the whole QTY got there; the stamp is the date of the last leg, unless one was already
 * set by hand. (Lived in AppContext until the consolidation; it is pure domain math and
 * the log writers below are its only callers.) */
export function siteDateFromLog(it: Pick<MaterialItem, 'qty' | 'siteDate'>, deliveries: DeliveryRecord[]): string {
  if (!logDrivesStage(deliveries)) return it.siteDate;
  const total = totalQty(it);
  const { onSite } = deliveryTotals(deliveries);
  if (total == null || onSite < total) return '';
  const legs = deliveries.filter((d) => d.kind === 'site' || d.kind === 'stock' || d.kind === 'wh-out').map((d) => d.date).sort();
  return it.siteDate || legs[legs.length - 1] || today();
}
/** One line of the exported delivery log. */
export interface DeliveryLogRow {
  /** Numeric when the QTY is; the raw QTY text ("1 lot") when it isn't. */
  qty: number | string;
  kind?: DeliveryKind;
  date: string;
  /** True when the row was derived from the stage instead of a registered entry. */
  synthetic: boolean;
}

/** What the delivery log PRINTS for one item — which is not the same as `it.deliveries`.
 *
 * The log and the stage are two different writers (CLAUDE.md §6), and only the first one
 * fills `deliveries`. A PM who moves material with the 📍/🏭 stage buttons — the fast path,
 * and the only one needed when the whole QTY lands in one trip — registers nothing, so the
 * exported log used to be silent about material the rest of the report already showed as
 * delivered. That reads as a bug in the PDF even though every screen agreed: the block is
 * titled "what arrived", and things had arrived.
 *
 * So an item with no entries falls back to ONE row derived from its stage. Never both:
 * once entries exist they are the detail, and a summary row next to them would double-count
 * the same material. OFCI is excluded — we never receive owner-furnished material, which is
 * exactly why `stagePatch` refuses to mark it delivered. */
export function deliveryLogRows(
  it: Pick<MaterialItem, 'qty' | 'po' | 'deliveries' | 'delivered' | 'siteDate' | 'receivedDate' | 'receivedQty' | 'shipDate'>,
): DeliveryLogRow[] {
  if (it.deliveries.length) {
    return it.deliveries.map((d) => ({ qty: d.qty, kind: d.kind, date: d.date, synthetic: false }));
  }
  if (isOfci(it.po)) return [];
  const onSite = !!it.siteDate;
  if (!it.delivered && !onSite && !it.receivedQty) return [];
  // A received item moved its whole QTY; only a still-open partial moved just receivedQty.
  const total = totalQty(it);
  const qty = it.delivered || onSite ? (total ?? it.qty) : it.receivedQty;
  return [{
    qty,
    // No siteDate means it came in but hasn't reached the jobsite: a plain receipt, the
    // same shape a legacy entry has.
    kind: onSite ? 'site' : undefined,
    date: (onSite ? it.siteDate : it.receivedDate) || it.receivedDate || it.shipDate || '',
    synthetic: true,
  }];
}

export const DELIVERY_KIND_META: Record<DeliveryKind, { icon: string; label: string }> = {
  site: { icon: '📍', label: 'Delivered to site' },
  'wh-in': { icon: '🏭', label: 'Arrived at warehouse' },
  'wh-out': { icon: '📤', label: 'Released to site' },
  stock: { icon: '📦', label: 'From stock' },
};

/** The main Received checkbox is locked while a partial backorder remains open — the
 * item is NOT fully received, so nothing may claim it is. It no longer locks the
 * INSTALL (batch 43): a vendor can deliver part of an order and hold the rest, and the
 * PM puts up what arrived instead of waiting on the backorder. */
export function hasOpenBackorder(it: { qty: number | string; receivedQty: number }): boolean {
  if (!it.receivedQty) return false;
  const back = backorderQty(it);
  return back != null && back > 0;
}

/* ------------------------------------------------------------- install quantities
 * The third and last link of the quantity chain (lote 44):
 *
 *     qty bought  ≥  receivedQty arrived  ≥  installedQty up on the wall
 *
 * It exists because the install used to be a BOOLEAN while the delivery already had
 * quantities and a log — so "we put up the 5 that arrived out of the 10 we bought" had no
 * way to be said, and the client report read the item as fully installed. The shape is a
 * deliberate mirror of the delivery side: a log carries the detail (how many, what day —
 * what arrived can go up over several visits) and a published flat total rides along in
 * `installedQty` so the report can print "3/10 installed".
 *
 * `InstallRecord` has no `kind`: a delivery has movements because material travels
 * (to site, to warehouse, released, from stock); an installation just happens. */
export function installedTotal(installations: InstallRecord[]): number {
  return installations.reduce((s, e) => s + (e.qty || 0), 0);
}
/** How many units MAY be installed — you cannot put up what has not arrived. `null` when
 * the QTY is not a usable number: that item has no quantities at all, only the boolean.
 * An item ticked Received straight from the grid never logs entries, so its `receivedQty`
 * stays 0 while everything is in fact here — same reading `receivedShown` takes in the
 * delivery modal, so `delivered` means the whole QTY. */
export function installCap(it: { qty: number | string; receivedQty: number; delivered: boolean }): number | null {
  const total = totalQty(it);
  if (total == null) return null;
  return it.delivered ? total : Math.min(total, it.receivedQty || 0);
}
/** Still to install of what is already here. Null when there are no quantities. */
export function pendingInstallQty(it: { qty: number | string; receivedQty: number; delivered: boolean; installedQty: number }): number | null {
  const cap = installCap(it);
  return cap == null ? null : Math.max(0, cap - (it.installedQty || 0));
}
/** Something is up but not all of it — the state the client report prints as "3/10
 * installed". Mirrors `isPartial` on the delivery side, including its guard: once the
 * item is `installed` the fraction is over. */
export function isPartiallyInstalled(it: { qty: number | string; installedQty: number; installed: boolean }): boolean {
  if (it.installed || !it.installedQty) return false;
  const total = totalQty(it);
  return total != null && it.installedQty < total;
}
/** The install date the log implies: the last leg, unless one was already set by hand.
 * Mirror of `siteDateFromLog`. */
function installDateFromLog(it: Pick<MaterialItem, 'installedDate'>, installations: InstallRecord[]): string {
  if (!installations.length) return it.installedDate;
  const dates = installations.map((e) => e.date).filter(Boolean).sort();
  return it.installedDate || dates[dates.length - 1] || today();
}

export type Lifecycle = 'draft' | 'ordered' | 'partial' | 'delivered' | 'installed';
export function deriveLifecycle(it: { po: string; delivered: boolean; installed?: boolean; qty: number | string; receivedQty: number }): Lifecycle {
  if (it.installed) return 'installed';
  if (it.delivered) return 'delivered';
  if (isPartial(it)) return 'partial';
  if (String(it.po ?? '').trim() !== '') return 'ordered';
  return 'draft';
}

/* ----------------------------------------------------------------- install cycle
 * Receiving the material is NOT the end of the line: an item sits in the warehouse
 * until someone releases it to the jobsite, and it only closes once it's installed.
 * The stage is derived from two fields (siteDate + installed) — no enum to fall out
 * of sync, exactly like the DRAFT/ORDERED/DELIVERED derivation above. */
type StageR = Pick<ReportSnapshot, 'delivered' | 'siteDate' | 'installed'>;
export function itemStage(it: StageR): ItemStage {
  if (it.installed) return 'installed';
  if (!it.delivered) return 'pending';
  return it.siteDate ? 'on-site' : 'warehouse';
}
export const STAGE_META: Record<ItemStage, { icon: string; label: string }> = {
  pending: { icon: '🚚', label: 'Not received yet' },
  warehouse: { icon: '🏭', label: 'In warehouse' },
  'on-site': { icon: '📍', label: 'On site' },
  installed: { icon: '🔩', label: 'Installed' },
};

/** What `stagePatch` needs to know about the item it is about to move. `qty` /
 * `receivedQty` ride along for the same reason `po` does: an item with an open
 * backorder can't be written as received either (see `noReceipt` below). */
export type StageWriteTarget = Pick<MaterialItem, 'po' | 'siteDate' | 'installedDate' | 'deliveries' | 'qty' | 'receivedQty'>;

/** Stage intent → field patch. **The single writer of the `delivered` / `siteDate` /
 * `installed` trio**: the column-header popover, the toolbar popover and the modal's
 * stage buttons all come through here, so one cascade in `applyItemPatch` serves the
 * three instead of the three hand-written ones the app used to carry (see the inventory
 * in SPEC-hardening §8). The three rules they used to disagree on are decided here:
 *
 *  - **Date.** An explicit date always wins. Blank means "I'm not saying when", so an
 *    existing stamp is kept and only a missing one falls back to today. (The popovers
 *    used to overwrite with today even when left blank; the modal always preserved.)
 *  - **OFCI.** A stage never writes `delivered` on owner-furnished material — it is out
 *    of our procurement flow. (The popovers used to mark it received, the modal didn't,
 *    so the same "mark as 🏭" gave two different results depending on where you clicked.)
 *  - **The log wins.** Once the delivery log records movements it owns the stage, so a
 *    manual write is REFUSED here (empty patch) instead of landing and then being
 *    silently reverted the next time an entry is registered. Surfaces that hit many
 *    items at once count them with `logDrivesStage` and say so before applying.
 *
 * OFCI has exactly ONE axis: installed or not (SPEC-delivery-watch §8). `itemStage` reads
 * `delivered`, which owner-furnished material never gets, so 🏭 and 📍 are unreachable
 * there — which left `'pending'` returning an empty patch and no way to UN-install an OFCI
 * item except by clicking 🏭 and relying on the `installed: false` it happens to carry.
 * So on OFCI `'pending'` means "not installed", and the pair 🚚 ↔ 🔩 is exhaustive.
 *
 * A PARTIALLY DELIVERED item lands on that same single axis (batch 43). The install is
 * open to it now — the vendor sent half the order and the PM puts up what arrived — but
 * the RECEIPT is not: `delivered` stays false until the backorder closes, so 🏭 and 📍 are
 * just as unreachable as on an OFCI row and `'pending'` has to mean "not installed" there
 * too, or 🔩 would be a one-way door. */
export function stagePatch(stage: string, date: string, it: StageWriteTarget): Partial<MaterialItem> {
  if (logDrivesStage(it.deliveries)) return {};
  const ofci = isOfci(it.po);
  // Two different reasons the receipt is not this write's to make — owner-furnished
  // material, or material only half of which showed up — with the same consequence.
  const noReceipt = ofci || hasOpenBackorder(it);
  const received = noReceipt ? {} : { delivered: true };
  if (stage === 'pending') return noReceipt ? { installed: false } : { delivered: false };
  // The received date belongs to the receipt, so it follows the same exemption:
  // stamping one on material we never took in — or only partly took in — would be a
  // record of something that did not happen.
  if (stage === 'warehouse') return { ...received, siteDate: '', installed: false, ...(date && !noReceipt ? { receivedDate: date } : {}) };
  if (stage === 'on-site') return { ...received, siteDate: date || it.siteDate || today(), installed: false };
  if (stage === 'installed') return { installed: true, installedDate: date || it.installedDate || today() };
  return {};
}

/** The statuses the UI offers as filters, in the order they are shown — the status
 * filter bar and the per-package chips both walk this list. */
export const FILTERABLE: ItemStatus[] = ['order-now', 'order-soon', 'needs-data', 'planned', 'ordered', 'partial', 'delivered', 'on-site', 'installed', 'na'];

/* ------------------------------------------------------------------- supply only
 * Some projects are supply-only: Advanced furnishes the material but somebody else
 * installs it, so the item is done the moment it lands on site. The flag lives on the
 * WORK PACKAGE (the project's is just the default it inherits at creation), because a
 * package must not mix both scopes — Overview groups by package. */
type Scoped = { supplyOnly?: boolean } | null | undefined;
/** Does this package close at 📍 on-site instead of 🔩 installed? Falls back to the
 * project's flag for packages created before the mark existed. */
export function closesAtSite(pkg?: Scoped, project?: Scoped): boolean {
  return !!(pkg?.supplyOnly ?? project?.supplyOnly);
}
/** Does this PROJECT group under SUPPLY ONLY in the Portfolio? Its own flag when it was
 * created that way, or — the retrofit path — when every one of its packages has been
 * marked supply only: projects that predate the flag have no other way to say it, and a
 * PM who marks all the packages plainly means the project. A project with a mix keeps
 * its own flag (that's the user's rule: only the stage tables split mixed packages). */
export function projectClosesAtSite(project: Scoped, packages: Scoped[]): boolean {
  if (project?.supplyOnly) return true;
  return packages.length > 0 && packages.every((p) => !!p?.supplyOnly);
}
/** The last stage of the item's lifecycle under the given scope. */
export function closingStage(supplyOnly: boolean): ItemStage {
  return supplyOnly ? 'on-site' : 'installed';
}
/** Lifecycle closed — reached the stage its scope closes at. */
export function isClosed(it: StageR, supplyOnly = false): boolean {
  return supplyOnly ? itemStage(it) === 'on-site' || it.installed : it.installed;
}

/** Received but not yet closed — the blind spot this cycle covers: the material is paid
 * for and in hand, yet nothing on the old semaphore said it hadn't reached the wall.
 * For a supply-only package "closed" means on site, so those items drop out one stage
 * earlier and a full package never sits here forever waiting on an install that isn't
 * ours. Kept named `awaitingInstall` for its callers; `supplyOnly` narrows it. */
export function awaitingInstall(it: StageR, supplyOnly = false): boolean {
  return it.delivered && !isClosed(it, supplyOnly);
}

/** What CLOSES an item currently awaiting site/install, decided against its live draft
 * (lote 63). A supply-only package closes at 📍 on site, so a warehouse row's one move is
 * there and an on-site row has nothing left to close via this helper. An install package
 * closes at 🔩 installed, with an intermediate 📍 release for a row still in the
 * warehouse. Null when the delivery log owns the stage — `stagePatch` would refuse a
 * manual write anyway (empty patch), so the caller disables its button instead of
 * offering a click that does nothing. */
export function closeVia(it: Pick<MaterialItem, 'deliveries' | 'delivered' | 'siteDate' | 'installed' | 'installations'>, supplyOnly: boolean): 'on-site' | 'installed' | null {
  if (logDrivesStage(it.deliveries)) return null;
  const stage = itemStage(it);
  if (supplyOnly) return stage === 'warehouse' ? 'on-site' : null;
  if (stage === 'warehouse') return 'on-site';
  // The INSTALL log owns `installed` the exact same way the delivery log owns
  // `delivered` (lote 44's cascade in `applyItemPatch`, §"install QUANTITIES"): once
  // `installations` has entries, a manual `{ installed: true }` patch is silently
  // re-derived back off the log's own total the moment it lands. Offering the button
  // there would look like it worked and write nothing real — register the rest through
  // Breakdown Install instead.
  if (stage === 'on-site') return it.installations.length ? null : 'installed';
  return null;
}

/* How urgent it is to get an awaiting-install item to the jobsite, driven by the
 * On-Site Req. date. 'unscheduled' is the case that used to be invisible altogether:
 * computeItem short-circuits on `delivered` BEFORE the needs-data check, so a received
 * item with no On-Site date never showed up anywhere. */
export type InstallUrgency = 'overdue' | 'due-soon' | 'scheduled' | 'unscheduled';
export function installUrgency(it: Pick<ReportSnapshot, 'onsite'>, cfg?: Cfg): InstallUrgency {
  if (!it.onsite) return 'unscheduled';
  const days = diffDays(it.onsite, today());
  if (days < 0) return 'overdue';
  if (days <= (cfg?.window ?? 7)) return 'due-soon';
  return 'scheduled';
}

/* --------------------------------------------------------------- delivery watch
 * The THIRD clock (SPEC-delivery-watch). Buy-By asks "do I have to buy it?" and
 * installUrgency asks "do I have to install it?"; this one asks **"did it arrive?"** —
 * the longest stretch of the cycle, between the PO going out and the material showing up
 * at the dock, where nothing used to be watching. It reads `shipDate` (the vendor's
 * promised Anticipated Ship/Delivery date) and nothing else: `onsite` is the schedule's
 * promise, a different one, and it already has its own clock.
 *
 * A 'late' item is resolved by exactly two actions — reschedule to the new promised date,
 * or confirm it arrived. There is deliberately no snooze. */
export type DeliveryWatch = 'arrived' | 'na' | 'unknown' | 'late' | 'due' | 'scheduled';
type WatchR = Pick<ReportSnapshot, 'delivered' | 'installed' | 'ordered' | 'po' | 'shipDate' | 'qty' | 'receivedQty'>;
export function deliveryWatch(it: WatchR, cfg?: Cfg): DeliveryWatch {
  // Arrived wins over everything, a past promise included: once the material is on the
  // dock, the vendor having said another date is history, not an alert. A PARTIAL
  // delivery is not arrival — material is still owed, so its clock keeps running. That
  // holds even once the item is INSTALLED: since batch 43 the PM can put up the half
  // that showed up, and the half that didn't is exactly what this clock exists to chase.
  if ((it.delivered || it.installed) && !hasOpenBackorder(it)) return 'arrived';
  // Owner-furnished never passes through our procurement, so its promised date isn't
  // ours to chase (same short-circuit computeItem takes, and the reason an OFCI row
  // shows N/A instead of a ship date).
  if (isOfci(it.po)) return 'na';
  // Not bought yet: there is nothing to wait for. A `shipDate` without a PO is import
  // junk or a stale auto-calc (computeShipDate derives it from poDate + lead), so
  // alerting there would be noise about an item nobody ordered.
  if (!it.ordered) return 'na';
  // Bought with no promised date — the print report already calls this "Confirm Date".
  // It is missing information, not a healthy item, so it gets a state of its own; it
  // just doesn't ALERT (§5.3), or 40 undated items would drown the 3 truly late ones.
  if (!it.shipDate) return 'unknown';
  const days = diffDays(it.shipDate, today());
  if (days < 0) return 'late';
  // The promise lands inside the order-soon window — tell the super it's coming. Reuses
  // the one configurable threshold the app has; no second one.
  if (days <= (cfg?.window ?? 7)) return 'due';
  return 'scheduled';
}
/** How many days past the promised date, null without one (or when it hasn't passed). */
export function daysLate(it: Pick<ReportSnapshot, 'shipDate'>): number | null {
  if (!it.shipDate) return null;
  const late = diffDays(today(), it.shipDate);
  return late > 0 ? late : null;
}

/** Days the item has been sitting received (warehouse or site) — null without a date. */
export function daysWaiting(it: Pick<ReportSnapshot, 'receivedDate'>): number | null {
  return it.receivedDate ? diffDays(today(), it.receivedDate) : null;
}

/* Aging bands for material that is received but not closed out yet — the question the
 * supply-only table exists to answer. NOT a fourth clock: the three clocks each read a
 * promised DATE and say whether it has passed, while this one reads elapsed time against
 * a fixed rule of thumb — two weeks is worth a look, four weeks means someone has to move
 * it. It deliberately does NOT use the `window` threshold: that one belongs to the three
 * clocks and widening it should not repaint a column about how long a crate has been in
 * the warehouse. */
export type WaitSeverity = 'warning' | 'urgent';
export function waitSeverity(days: number | null): WaitSeverity | null {
  if (days == null) return null;
  if (days > 30) return 'urgent';
  return days >= 14 ? 'warning' : null;
}

/* ------------------------------------------------ installation progress mosaic
 * SPEC-overview-redesign §4 — one card per project, one bar per work package: how far
 * each package got toward its closing stage. It answers a DIFFERENT question from the
 * stage table it replaces. That one lists what is already in hand; this one measures the
 * WHOLE scope, so a package with nothing received yet still gets a bar (at 0%) and says
 * why it is there. Everything below is pure and tested: the sort order and the two 0%/100%
 * edges are exactly the kind of rule that rots without a word of warning inside a render. */

/** Why a package sits where it does, in one word — the flag beside its name. The two
 * zero cases are deliberately NOT the same alarm: nothing up because nobody installed it
 * is an installation problem (⚠), nothing up because nothing arrived is a procurement one
 * (🚚). Painting both red teaches the PM to ignore red. `null` = under way, needs no word. */
export type PackageProgressFlag = 'complete' | 'not-started' | 'awaiting-delivery' | null;
export function packageProgressFlag(closed: number, inHand: number, total: number): PackageProgressFlag {
  if (!total) return null;
  if (closed === total) return 'complete';
  if (closed > 0) return null;
  return inHand > 0 ? 'not-started' : 'awaiting-delivery';
}

/** The integer the bar prints. 100 and 0 are verdicts — "done" and "nothing yet" — so
 * neither is ever reached by ROUNDING: 199 of 200 closed reads 99%, and 1 of 200 reads
 * 1%. The segment widths use the raw ratio, so the clamp costs under a pixel and buys a
 * number that never contradicts the flag right next to it. */
export function progressPct(closed: number, total: number): number {
  if (!total) return 0;
  if (closed === total) return 100;
  if (closed === 0) return 0;
  return Math.min(99, Math.max(1, Math.round((closed / total) * 100)));
}

/** djb2 → a slot in [0, n). Stable per id, which is the whole point: colour encodes
 * project IDENTITY, not status, so it must survive a re-sort. Numbering the cards in
 * render order would repaint half the mosaic the moment one project's percentage moves
 * it past another. */
export function stableSlot(id: string, n: number): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  return h % n;
}
/** How many identity hues the mosaic rotates through (`--mos-*` in colors.css). */
export const MOSAIC_SLOTS = 6;

/** One item under a badge — carried here rather than re-derived by the drill-down, so the
 * count on the badge and the list it opens can never disagree. Render-time view model,
 * never persisted. */
export interface MosaicItem {
  id: string; wpId: string; wpLabel: string; description: string;
  qty: number | string; um: string;
  /** Whatever date the badge is about — received, on site, installed, required on site. */
  date: string;
  /** One line of badge-specific detail (what is still owed, which way it travelled). */
  note?: string;
}

/** The badge row under the bars, and it is NOT the same row in both scopes.
 *
 * When we install, the useful three are physical: where is the material standing right
 * now (🏭 warehouse → 📍 on site → 🔩 installed). When we only supply, on site IS the end
 * of the line, so those three would be the bar again; what the PM chases instead are the
 * three things that keep material from getting there — nothing bought yet, part of the
 * order still owed, and material that left the vendor's ideal path (through our warehouse,
 * or pulled off our own shelves). */
export type MosaicBadgeKey = Exclude<ItemStage, 'pending'> | 'not-ordered' | 'backorder' | 'detour';
export interface MosaicBadge { key: MosaicBadgeKey; items: MosaicItem[] }
const INSTALL_BADGES: MosaicBadgeKey[] = ['warehouse', 'on-site', 'installed'];
const SUPPLY_BADGES: MosaicBadgeKey[] = ['not-ordered', 'backorder', 'detour'];
/** How each badge introduces itself — `label` finishes the sentence "N …" in the tooltip
 * and the aria-label, `column` titles the date column of the list it opens. */
export const MOSAIC_BADGE_META: Record<MosaicBadgeKey, { icon: string; label: string; column: string }> = {
  warehouse: { icon: '🏭', label: 'in the warehouse', column: 'Received' },
  'on-site': { icon: '📍', label: 'on site, not installed yet', column: 'On site since' },
  installed: { icon: '🔩', label: 'installed', column: 'Installed' },
  'not-ordered': { icon: '🛒', label: 'with no PO# yet — nothing bought', column: 'On-Site Req.' },
  backorder: { icon: '🚚', label: 'with part of the order still owed', column: 'Received' },
  detour: { icon: '📦', label: 'off the direct route — through our warehouse or out of stock', column: 'Last movement' },
};

/** Which way this item left the straight line from the vendor to the jobsite, if it did —
 * `null` when it went (or is still going) direct. Goes through `deliveryLogRows`, not
 * `it.deliveries`, so a warehouse hop still counts after the material moved on to site;
 * that helper is what turns "moved with the buttons" into a row and keeps OFCI out —
 * owner-furnished material never travels our route, so it has no route to leave. */
export type DetourKind = 'warehouse' | 'stock' | null;
export function detourOf(r: ReportSnapshot, deliveries: DeliveryRecord[]): DetourKind {
  const rows = deliveryLogRows({ ...r, deliveries });
  if (rows.some((d) => d.kind === 'stock')) return 'stock';
  if (rows.some((d) => d.kind === 'wh-in')) return 'warehouse';
  return rows.some((d) => d.synthetic) && itemStage(r) === 'warehouse' ? 'warehouse' : null;
}

export interface MosaicPackage {
  wpId: string; wpLabel: string;
  total: number;
  /** Reached the package's own closing stage — 🔩 installed, or 📍 on site if supply only. */
  closed: number;
  pending: number;
  /** Bought (it has a PO#) and not closed yet — the middle zone of a supply-only bar. What
   * is left over, `pending - ordered`, is material nobody has ordered at all. */
  ordered: number;
  /** Received, closed or not. Only used to tell the two zero cases apart. */
  inHand: number;
  pct: number;
  flag: PackageProgressFlag;
  /** Deep-link target: the first item still short of the closing stage, else the first. */
  itemId: string;
}

export interface MosaicCard {
  projectId: string; projectName: string;
  /** Follows the PROJECT (`projectClosesAtSite`), like the Portfolio grouping does — it
   * picks the header icon and which three badges the card carries. Each PACKAGE is still
   * measured against its own closing stage, so a mixed project stays honest on one card. */
  scope: 'install' | 'supply';
  slot: number;
  packages: MosaicPackage[];
  total: number; closed: number; pct: number;
  /** The biggest package in THIS card — bar widths are proportional within a card only:
   * across cards a small project would shrink to a stub, and the header rollup already
   * carries how big it is. */
  widest: number;
  /** Exactly three, in display order — see `MosaicBadgeKey`. */
  badges: MosaicBadge[];
}

/** Build the mosaic. Takes the projects and packages it should chart ALREADY filtered —
 * archived projects and the supply-only/install split are the caller's call, and each
 * package is still measured against its own closing stage, so either scope works.
 *
 * Nothing is excluded from the counts: dropping "not ordered yet" items would empty the
 * denominator of exactly the packages the 🚚 flag exists to point at. Owner-furnished
 * material we DO install (the CI in OFCI), and the Portfolio bar counts it for that
 * reason — two "how complete is this project" numbers with different denominators on one
 * screen is a bug report waiting to happen. */
export function mosaicCards(projects: Project[], packages: WorkPackage[], items: MaterialItem[]): MosaicCard[] {
  const byWp = new Map<string, MaterialItem[]>();
  items.forEach((it) => {
    if (!it.report) return; // Overview reads published snapshots, here as everywhere else
    const a = byWp.get(it.wpId);
    if (a) a.push(it); else byWp.set(it.wpId, [it]);
  });
  return projects.map((project): MosaicCard | null => {
    const own = packages.filter((p) => p.projectId === project.id);
    const scope = projectClosesAtSite(project, own) ? 'supply' : 'install';
    const bins = new Map<MosaicBadgeKey, MosaicItem[]>((scope === 'supply' ? SUPPLY_BADGES : INSTALL_BADGES).map((k) => [k, []]));
    const bin = (key: MosaicBadgeKey, row: MosaicItem) => bins.get(key)?.push(row);
    const pkgs: MosaicPackage[] = [];
    own.forEach((pkg) => {
      const rows = byWp.get(pkg.id) ?? [];
      // No items at all is the data-entry state — a package somebody just created — not a
      // package at zero progress, so it never gets a bar.
      if (!rows.length) return;
      const supplyOnly = closesAtSite(pkg, project);
      let closed = 0;
      let inHand = 0;
      let ordered = 0;
      let target = '';
      rows.forEach((it) => {
        const r = it.report!;
        const stage = itemStage(r);
        const done = isClosed(r, supplyOnly);
        const base = { id: it.id, wpId: pkg.id, wpLabel: pkg.label, description: r.description, qty: r.qty, um: r.um };
        const bought = !!String(r.po ?? '').trim(); // OFCI counts: it is nobody's left to buy
        if (stage !== 'pending') inHand++;
        if (done) closed++;
        else {
          if (!target) target = it.id;
          if (bought) ordered++;
        }
        // Where it physically stands — the card's three badges when we install it.
        if (stage !== 'pending') {
          bin(stage, {
            ...base,
            date: stage === 'installed' ? r.installedDate : stage === 'on-site' ? r.siteDate : r.receivedDate,
          });
        }
        // …and what is holding it up, when we only supply it. The three overlap on purpose:
        // one crate can be un-ordered today, on backorder next month and still take the
        // warehouse detour, and each of those is a different phone call.
        if (!bought) bin('not-ordered', { ...base, date: r.onsite });
        if (hasOpenBackorder(r)) {
          const back = backorderQty(r);
          bin('backorder', { ...base, date: r.receivedDate, note: back == null ? '' : `${back}${r.um ? ` ${r.um}` : ''} still owed` });
        }
        const detour = detourOf(r, it.deliveries);
        if (detour) {
          bin('detour', {
            ...base,
            date: r.siteDate || r.receivedDate,
            note: detour === 'stock' ? 'pulled from our own stock'
              : r.siteDate ? 'through the warehouse, now on site' : 'sitting in the warehouse',
          });
        }
      });
      pkgs.push({
        wpId: pkg.id, wpLabel: pkg.label, total: rows.length, closed, pending: rows.length - closed,
        ordered, inHand, pct: progressPct(closed, rows.length), flag: packageProgressFlag(closed, inHand, rows.length),
        itemId: target || rows[0].id,
      });
    });
    if (!pkgs.length) return null;
    // Descending inside the card: the finished packages stack at the top and the stalled
    // one sits on the bottom edge, right where the eye leaves the card.
    pkgs.sort((a, b) => b.pct - a.pct || b.total - a.total || a.wpLabel.localeCompare(b.wpLabel, undefined, { numeric: true, sensitivity: 'base' }));
    const total = pkgs.reduce((s, p) => s + p.total, 0);
    const closed = pkgs.reduce((s, p) => s + p.closed, 0);
    return {
      projectId: project.id, projectName: project.name, scope, slot: stableSlot(project.id, MOSAIC_SLOTS),
      packages: pkgs, total, closed, pct: progressPct(closed, total),
      widest: Math.max(...pkgs.map((p) => p.total)),
      badges: [...bins.entries()].map(([key, items]) => ({ key, items })),
    };
  })
    .filter((c): c is MosaicCard => c !== null)
    // And ASCENDING between cards — deliberately the other direction: the project that
    // needs attention lands top-left, where reading starts.
    .sort((a, b) => a.pct - b.pct || b.total - a.total || a.projectName.localeCompare(b.projectName, undefined, { numeric: true, sensitivity: 'base' }));
}

export function computeItem(it: ReportSnapshot, cfg?: Cfg): ComputedItem {
  const windowDays = cfg?.window ?? 7;
  const hasLead = it.lead !== '' && it.lead != null && !isNaN(Number(it.lead));
  const hasOnsite = !!it.onsite;

  // Installed closes the lifecycle — it wins over everything, including OFCI: owner
  // furnished material is still installed by us, so it deserves the terminal badge.
  if (it.installed) return { status: 'installed', buyby: '', days: null, approved: true };
  // Owner-furnished items are out of our procurement flow — no buy-by, no lead/date
  // requirement. This short-circuits before the needs-data / semaphore checks so an
  // OFCI item never nags for missing lead time or on-site date.
  if (isOfci(it.po)) return { status: 'na', buyby: '', days: null, approved: true };
  // Supply only: nobody on our side installs this, so reaching the jobsite IS the end
  // of the line and deserves its own terminal badge — otherwise a finished package
  // would read exactly like one still sitting in the warehouse.
  if (cfg?.supplyOnly && itemStage(it) === 'on-site') return { status: 'on-site', buyby: '', days: null, approved: true };
  if (it.delivered) return { status: 'delivered', buyby: '', days: null, approved: true };
  if (isPartial(it)) return { status: 'partial', buyby: '', days: null, approved: true };
  // A PO# means the purchase already happened, so the buy-by deadline no longer
  // applies — the cell reads "—" just like it does once the item is received.
  if (it.ordered) return { status: 'ordered', buyby: '', days: null, approved: true };
  if (!hasLead || !hasOnsite) return { status: 'needs-data', buyby: '', days: null, approved: submittalApproved(it) };

  const buyby = toISO(addDays(parseISO(it.onsite), -(Number(it.lead) * 7)));
  const days = diffDays(buyby, today());
  const approved = submittalApproved(it);
  let status: ComputedItem['status'];
  if (days <= 0) status = 'order-now';
  else if (days <= windowDays) status = 'order-soon';
  else status = 'planned';
  return { status, buyby, days, approved };
}

/** Applies an edit to one item, cascading:
 *  - PO-Date/Lead-Time → Ship-Date auto-calc, unless the user directly overrode the
 *    ship date (shipDateManual).
 *  - PO# → the DRAFT/ORDERED/DELIVERED lifecycle: any PO# value orders it; the literal
 *    value "From Stock" (case-insensitive) skips straight to delivered; clearing PO#
 *    reverts to draft. The Delivered checkbox is the one manual override on top of this
 *    — unchecking it falls back to whatever the PO# alone implies.
 *  - Partial-delivery lock: while a Breakdown Delivery backorder is open, nothing may
 *    flip the item to delivered — the backorder has to reach 0 first.
 *
 *  Lives here, not in AppContext, because it is pure: every cascade the grid depends on
 *  is testable without mounting React (SPEC-hardening §3.3). */
export function applyItemPatch(it: MaterialItem, patch: Partial<MaterialItem>): MaterialItem {
  const next: MaterialItem = { ...it, ...patch };
  if ('qty' in patch) next.qty = normQty(next.qty);
  if ('shipDate' in patch) {
    next.shipDateManual = true;
  } else if (('poDate' in patch || 'lead' in patch) && !next.shipDateManual) {
    const auto = computeShipDate(next.poDate, next.lead);
    if (auto != null) next.shipDate = auto;
  }
  if ('po' in patch) {
    const po = String(next.po ?? '').trim();
    if (isOfci(po)) {
      // Owner Furnished, Contractor Installed — out of our procurement flow.
      next.ordered = false;
      next.delivered = false;
      next.submittal = 'N/A';
    } else if (isFromStock(po)) {
      next.ordered = true;
      next.delivered = true;
    } else {
      next.ordered = po !== '';
    }
  }
  // A NEW field-measure date re-opens the confirmation. Rescheduling an already approved
  // package — the second visit, because the wall moved or the dimensions came back wrong
  // — has to put the component back to Pending, or the ◆ would never return to the
  // timeline and the visit would be invisible. An explicit fieldStatus in the same patch
  // wins: that caller is stating the status, not scheduling.
  if ('fieldDate' in patch && !('fieldStatus' in patch) && next.fieldDate && next.fieldDate !== it.fieldDate) {
    next.fieldStatus = 'pending';
  }
  if (next.delivered && !it.delivered && hasOpenBackorder(next)) next.delivered = false;
  // Received-date stamp: the first flip to delivered stamps today (unless the patch
  // itself carries a date); un-receiving clears it. Manual receivedDate edits pass through.
  if (next.delivered && !it.delivered && !next.receivedDate) next.receivedDate = today();
  if (!next.delivered && it.delivered && !('receivedDate' in patch)) next.receivedDate = '';
  // ---- Install cycle: warehouse → jobsite → installed ----
  // Marking INSTALLED on an item that was never received implies the receipt (material
  // shipped straight to the jobsite), so it back-fills Received + its date. Two cases
  // where it must NOT:
  //  - OFCI: owner-furnished material never passes through our procurement, yet WE
  //    install it — so it closes as installed with delivered still false.
  //  - An open backorder (batch 43). The install itself is allowed now — a vendor
  //    delivers part of the order, the rest slips, and the PM puts up what arrived
  //    instead of leaving the crew idle — but only part of it landed, so back-filling
  //    Received would erase the backorder from section 1 of the delivery modal along
  //    with the entry form for registering the rest. `delivered` stays false; the item
  //    reads as installed and still owes material, which is the truth.
  if ('installed' in patch && next.installed && !next.delivered && !isOfci(next.po) && !hasOpenBackorder(next)) {
    next.delivered = true;
    if (!next.receivedDate) next.receivedDate = today();
  }
  // Un-receiving invalidates everything downstream — it never reached the site, let
  // alone the wall. (OFCI is exempt: its `delivered` is forced false by design.) The
  // installation log goes with it: those units were never here to be installed, so
  // leaving entries behind would let them re-derive the install right back (lote 44).
  if (!next.delivered && it.delivered && !isOfci(next.po)) {
    next.installed = false;
    next.installedDate = '';
    next.siteDate = '';
    next.installations = [];
  }
  // ---- Install QUANTITIES (lote 44) — derived last, so nothing above can contradict it.
  // Two owners, never both: with entries the LOG owns the number (and therefore the
  // boolean, exactly like the delivery log owns `delivered` once it reaches the QTY);
  // without entries the BOOLEAN owns it, all-or-nothing, which is what 🔩 and the OFCI
  // checkbox have always meant. A non-numeric QTY ('lot', 'ls') has no quantities at all,
  // so `installedQty` stays 0 and only the boolean lives there.
  const installTotal = totalQty(next);
  if (next.installations.length) {
    next.installedQty = installedTotal(next.installations);
    next.installed = installTotal != null && next.installedQty >= installTotal;
  } else if (it.installations.length) {
    // The log just went empty (last entry undone, or the receipt withdrawn). The boolean
    // it had derived goes with it — reading it here instead would resurrect the count
    // the undo was there to remove.
    next.installed = false;
    next.installedQty = 0;
  } else {
    next.installedQty = next.installed && installTotal != null ? installTotal : 0;
  }
  if (next.installed && !next.installedDate) next.installedDate = today();
  if (!next.installed && !('installedDate' in patch)) next.installedDate = '';
  return next;
}

/* ----------------------------------------------------------------- the log writer
 * The delivery log is the OTHER writer of the stage: it derives it from quantities
 * instead of from an explicit intent, which is why `logDrivesStage` exists at all.
 * Both entry points funnel through `applyItemPatch` — they used to re-derive the
 * cascade inline in AppContext, so a log entry that closed or reopened a delivery got
 * different date stamping and no downstream invalidation compared to a manual write
 * (SPEC-hardening §8). Pure, so the arbitration is testable without React. */
function withLog(it: MaterialItem, deliveries: DeliveryRecord[], received: number, delivered: boolean): MaterialItem {
  const next = applyItemPatch({ ...it, deliveries }, { delivered, receivedQty: received });
  return { ...next, siteDate: siteDateFromLog(next, deliveries) };
}
/** Register one delivery entry. Reaching the ordered QTY completes the delivery; a
 * partial entry never un-receives an item the PM already ticked by hand. */
export function addDeliveryTo(it: MaterialItem, entry: DeliveryRecord): MaterialItem {
  if (entry.qty <= 0) return it;
  const deliveries = [...it.deliveries, entry];
  const { received } = deliveryTotals(deliveries);
  const total = totalQty(it);
  const delivered = total != null && received >= total ? true : it.delivered;
  return withLog(it, deliveries, received, delivered);
}
/** Undo one entry. Dropping back below the ordered QTY reopens the delivery — and now
 * that it goes through applyItemPatch, reopening also invalidates what was downstream
 * (on site, installed), exactly like un-ticking Received by hand does. */
export function removeDeliveryFrom(it: MaterialItem, index: number): MaterialItem {
  const deliveries = it.deliveries.filter((_, i) => i !== index);
  const { received } = deliveryTotals(deliveries);
  const total = totalQty(it);
  const delivered = it.delivered && total != null && received < total ? false : it.delivered;
  return withLog(it, deliveries, received, delivered);
}
/** Wipe the whole delivery log and go back to "not received" — for when the log itself
 * was the mistake (wrong item, wrong entries entered from scratch) and removing one
 * entry at a time is the wrong tool. Same cascade as removing every entry: if the item
 * was delivered / on site / installed on the strength of this log, that unwinds too. */
export function clearDeliveriesFrom(it: MaterialItem): MaterialItem {
  return withLog(it, [], 0, false);
}

/* ------------------------------------------------------- the installation log writer
 * Same two-entry-point shape as the delivery log above, and for the same reason: the
 * cascade lives in `applyItemPatch`, so registering an installation and un-registering
 * one can't drift apart. `applyItemPatch` re-derives `installedQty` and `installed` from
 * the array, so these only have to hand it the new array — and the date, which the patch
 * can't guess (the crew finished on the 21st; the PM types it in on the 25th). */
export function addInstallTo(it: MaterialItem, entry: InstallRecord): MaterialItem {
  if (entry.qty <= 0) return it;
  // Never record more than what is actually here — the cap is what ARRIVED, not what was
  // bought. Callers clamp too (the form shows the number), this is the backstop.
  const room = pendingInstallQty(it);
  const qty = room == null ? entry.qty : Math.min(entry.qty, room);
  if (qty <= 0) return it;
  // The new array goes in the PATCH, not the item — `applyItemPatch` compares the two to
  // tell "the log just went empty" from "there never was one", and it can only do that
  // while `it` still holds the previous array.
  const installations = [...it.installations, { ...entry, qty }];
  const next = applyItemPatch(it, { installations });
  return next.installed ? { ...next, installedDate: installDateFromLog(it, installations) } : next;
}
/** Undo one entry. Dropping back below the QTY reopens the install, exactly like removing
 * a delivery entry reopens the receipt; undoing the LAST one un-installs outright. */
export function removeInstallFrom(it: MaterialItem, index: number): MaterialItem {
  return applyItemPatch(it, { installations: it.installations.filter((_, i) => i !== index) });
}

export function snapshot(it: MaterialItem): ReportSnapshot {
  const o = {} as ReportSnapshot;
  REPORT_FIELDS.forEach((f) => {
    (o as any)[f] = it[f];
  });
  return o;
}
export function itemDirty(it: MaterialItem): boolean {
  if (!it.report) return true;
  return REPORT_FIELDS.some((f) => String(it[f] ?? '') !== String(it.report![f] ?? ''));
}
export function pkgDirty(items: MaterialItem[]): boolean {
  return items.some(itemDirty);
}

/** Brings a Db persisted by an earlier version of the app up to date: adds the
 * vendors list if it's missing, and syncs/appends catalog entries against the
 * current WP_CATALOG seed without touching any custom entries a user added. */
export function migrateDb(raw: Db): Db {
  const vendors = raw.vendors && raw.vendors.length ? raw.vendors : [...VENDORS_SEED];
  const byPrefix = new Map(raw.catalog.map((w) => [w.prefix, w]));
  WP_CATALOG.forEach((seed) => byPrefix.set(seed.prefix, { ...seed }));
  // Phase 3: partial-delivery fields on items (and their report snapshots).
  // Lote 10: receivedDate ('' = unknown for legacy delivered items — never fabricated).
  // Lote 34: the install cycle (siteDate / installed / installedDate) — legacy items
  // land as "received, still in the warehouse", which is exactly what they are.
  // Lote 42: an OFCI item could carry `delivered: true` — the row's Received checkbox
  // patched the flag directly and applyItemPatch only re-derived it when the patch itself
  // touched `po`, so it landed on owner-furnished material that never passed through our
  // receiving (SPEC-delivery-watch §8.2.1). The write path is closed now, but the rows it
  // already stamped would keep counting as "in warehouse" in Overview with no checkbox
  // left to untick them, so the receipt is dropped here — exactly what retyping OFCI in
  // PO# would do. `installed` is untouched: we DO install owner-furnished material.
  const unreceiveOfci = <T extends ReportSnapshot>(s: T): T => (
    isOfci(s.po) && s.delivered ? { ...s, delivered: false, receivedDate: '', siteDate: '' } : s
  );
  const items = raw.items.map((it) => unreceiveOfci({
    ...SUBMITTAL_DEFAULTS,
    ...INSTALL_DEFAULTS,
    ...it,
    receivedQty: it.receivedQty ?? 0,
    deliveries: it.deliveries ?? [],
    receivedDate: it.receivedDate ?? '',
    fieldDate: it.fieldDate ?? '',
    siteDate: it.siteDate ?? '',
    installed: it.installed ?? false,
    installedDate: it.installedDate ?? '',
    // Lote 44: install quantities. A legacy item that is `installed` had ALL of it up —
    // that is what the boolean has always meant — so the backfill is the whole QTY, not
    // zero, or every closed-out item would suddenly read "0/10 installed".
    installations: it.installations ?? [],
    installedQty: it.installedQty ?? (it.installed ? totalQty(it) ?? 0 : 0),
    report: it.report
      ? unreceiveOfci({
          ...SUBMITTAL_DEFAULTS, ...INSTALL_DEFAULTS, ...it.report,
          receivedQty: it.report.receivedQty ?? 0, receivedDate: it.report.receivedDate ?? '', fieldDate: it.report.fieldDate ?? '',
          siteDate: it.report.siteDate ?? '', installed: it.report.installed ?? false, installedDate: it.report.installedDate ?? '',
          installedQty: it.report.installedQty ?? (it.report.installed ? totalQty(it.report) ?? 0 : 0),
        })
      : null,
  }));
  // Lote 35: everything that exists today was supplied AND installed by us — that's the
  // behavior the app has always had, so legacy projects and packages migrate to false.
  const projects = raw.projects.map((p) => ({ ...p, supplyOnly: p.supplyOnly ?? false }));
  // Lote 39: `color` left the model (unpainted since 17.1) — the legacy key is dropped
  // here so it stops riding along in localStorage and in every manual export.
  const packages = raw.packages.map((p) => {
    const { color: _legacy, ...rest } = p as WorkPackage & { color?: string };
    return { ...rest, supplyOnly: p.supplyOnly ?? false };
  });
  // Batch 4: the submittal/approval buffer is gone — only the order-soon window
  // remains (default 7d). Old records still at the old default (25) move to 7;
  // custom values are kept. The obsolete `buffer` key is dropped.
  const thresholds: Record<string, Thresholds> = {};
  Object.entries(raw.thresholds ?? {}).forEach(([k, t]) => {
    const w = (t as { window?: number }).window;
    thresholds[k] = { window: w == null || w === 25 ? DEFAULT_THRESHOLDS.window : w };
  });
  return { ...raw, vendors, items, projects, packages, catalog: Array.from(byPrefix.values()), thresholds };
}
