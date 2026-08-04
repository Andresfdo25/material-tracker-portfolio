export type ItemStatus = 'order-now' | 'order-soon' | 'ordered' | 'partial' | 'delivered' | 'on-site' | 'installed' | 'needs-data' | 'planned' | 'na';

/** Where the item physically is once it has been received. Derived (never stored) from
 * `installed` + `siteDate`: the item lands in the warehouse, moves to the jobsite, and
 * finally gets installed — which closes its lifecycle. 'pending' = not received yet. */
export type ItemStage = 'pending' | 'warehouse' | 'on-site' | 'installed';

/** Supply only = we furnish the material but do not install it, so the item's lifecycle
 * closes when it reaches the jobsite ('on-site') instead of at 'installed'.
 * The project flag is only the DEFAULT for its packages plus the Portfolio grouping;
 * the package flag is the operative truth (see `closesAtSite`). */
export interface Project {
  id: string;
  name: string;
  gc: string;
  /** Default scope for the project's packages, and how it groups in the Portfolio. */
  supplyOnly?: boolean;
  /** GC mailing address for the submittal cover's TO: block — remembered the first
   * time it's typed in the Create Submittal Cover modal. Optional, no migration. */
  gcAddress?: string;
  archived?: boolean;
  archivedAt?: string;
}

/** Where a delivery entry moved material. Supply-only work usually ships straight from
 * the vendor to the jobsite ('site'); the warehouse is a detour the PM sometimes takes,
 * so it's tracked as an arrival ('wh-in') plus a release ('wh-out'), and 'stock' is
 * material pulled from our own shelves. Legacy entries carry no kind — they're plain
 * receipts, which is all the app tracked before. */
export type DeliveryKind = 'site' | 'wh-in' | 'wh-out' | 'stock';

/** One partial-delivery entry registered through the Breakdown Delivery modal. */
export interface DeliveryRecord {
  qty: number;
  note: string;
  date: string;
  kind?: DeliveryKind;
}

/** One partial-INSTALLATION entry (lote 44). Same shape as `DeliveryRecord` minus `kind`:
 * a delivery has movements because material travels, an installation just happens. What
 * arrived can go up in more than one visit, so the dates have to be per entry. */
export interface InstallRecord {
  qty: number;
  note: string;
  date: string;
}

export interface WorkPackage {
  id: string;
  projectId: string;
  prefix: string;
  label: string;
  reportSince: string | null;
  /** Where this package's items close: true = on-site (supply only), false = installed.
   * Inherits the project's flag at creation; correctable from the package header. */
  supplyOnly?: boolean;
}

/** Extra submittal-cycle components some items need beyond product data (the `submittal`
 * field): samples, shop drawings, and a free-text "other". Each is opt-in (req) and,
 * when required, must reach 'approved' or the item stays Blocked by submittal. */
export type SubmittalCompStatus = 'pending' | 'approved' | 'revise';

export interface ReportSnapshot {
  description: string;
  qty: number | string;
  um: string;
  vendor: string;
  lead: number | string;
  onsite: string;
  submittal: string;
  delivered: boolean;
  ordered: boolean;
  po: string;
  poDate: string;
  shipDate: string;
  shipDateManual: boolean;
  notes: string;
  receivedQty: number;
  /** ISO date auto-stamped when Received is checked; manually editable; '' = unknown. */
  receivedDate: string;
  // ---- Lifecycle close: warehouse → jobsite → installed (Delivery & Installation) ----
  /** ISO date the material left the warehouse for the jobsite ('' = still in the
   * warehouse). Deliberately has NO status badge of its own — it only re-classifies a
   * received item from "in warehouse" to "on site, pending installation". */
  siteDate: string;
  /** Terminal state: the item is installed and its lifecycle is closed. */
  installed: boolean;
  /** ISO date auto-stamped when Installed is set; manually editable. */
  installedDate: string;
  /** How many units are actually up (lote 44). Third and last of the quantity chain:
   * `qty` bought ≥ `receivedQty` arrived ≥ `installedQty` installed — you cannot put up
   * what has not arrived. Derived from `installations` when that log has entries, and
   * from the `installed` boolean ("all of it") when it doesn't. Published: the client
   * report prints "3/10 installed" in the Status column. */
  installedQty: number;
  /** Planned installation window — a PLAN (schedule), not a record: nothing writes it
   * from `installed`/`installedDate` and nothing writes those from it. ISO date,
   * '' = unset; both bounds are optional and a single bound is a valid window. */
  installStart?: string;
  /** ISO date, '' = unset — the far edge of the planned install window. */
  installEnd?: string;
  /** Field measurements site-visit date ('' = none) — one date per work package, set
   * from the toolbar popover; shows as the orange ◆ milestone on the Overview timeline. */
  fieldDate: string;
  // ---- Submittal-cycle components (Breakdown Submittals) ----
  sampleReq: boolean;
  sampleStatus: SubmittalCompStatus;
  shopReq: boolean;
  shopStatus: SubmittalCompStatus;
  fieldReq: boolean;
  fieldStatus: SubmittalCompStatus;
  otherReq: boolean;
  otherStatus: SubmittalCompStatus;
  otherNote: string;
}

export interface MaterialItem extends ReportSnapshot {
  id: string;
  wpId: string;
  deliveries: DeliveryRecord[];
  /** Partial installations, qty + date each. Lives here and NOT in `ReportSnapshot` for
   * the same reason `deliveries` does: `itemDirty` compares with `String()`, so it would
   * never see a change inside an array of objects. Its total rides along as
   * `installedQty`, which IS published. */
  installations: InstallRecord[];
  report: ReportSnapshot | null;
  /** Highlighter row flag set by the PM: '' | 'yellow' | 'green' | 'pink'. Internal
   * annotation only — not part of the report snapshot, not shown in Client·GC / PDF. */
  highlight?: string;
}

export interface Thresholds {
  /** Order-soon window in days — how far ahead of Buy-By the yellow flag starts. */
  window: number;
}

export interface Db {
  projects: Project[];
  packages: WorkPackage[];
  items: MaterialItem[];
  catalog: WpCatalogEntry[];
  vendors: string[];
  thresholds: Record<string, Thresholds>;
}

export interface WpCatalogEntry {
  prefix: string;
  label: string;
}

export interface ComputedItem {
  status: ItemStatus;
  buyby: string;
  days: number | null;
  approved: boolean;
}

export interface Cfg {
  window: number;
  /** Scope of the package the item belongs to — supply-only items close at 'on-site'.
   * computeItem only ever sees an item snapshot, so the scope rides along here. */
  supplyOnly?: boolean;
}

export type ExportMode = 'internal' | 'client';

export type ViewKey = 'list' | 'overview' | 'submittals';

export interface ImportRow {
  name: string;
  qty: number | string;
  um: string;
  mfr: string;
  part: string;
  label: string;
  prefix: string;
}
