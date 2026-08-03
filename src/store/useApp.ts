// useApp.ts — the consumer-facing half of the app context: the action surface, the
// context object and the hook. Separate from `AppContext.tsx` on purpose: a .tsx module
// that exports components AND anything else trips the fast-refresh rule, and every screen
// imports the hook. `AppContext.tsx` keeps only <AppProvider>.
import { createContext, useContext } from 'react';
import type { Db, DeliveryKind, ImportRow, ItemStage, MaterialItem, Project, Thresholds, ViewKey } from './types';

export interface Actions {
  editItem: (id: string, patch: Partial<MaterialItem>) => void;
  moveItem: (id: string, wpId: string) => void;
  /** Drag-to-reorder within a package: drop `dragId` before/after `targetId`. */
  moveItemRelative: (dragId: string, targetId: string, place: 'before' | 'after') => void;
  reorderPackage: (id: string, dir: -1 | 1) => void;
  deleteItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  deleteItems: (ids: string[]) => void;
  addItem: (wpId: string) => void;
  savePackageToReport: (wpId: string) => void;
  /** Same publish as `savePackageToReport`, for an explicit subset of packages — a single
   * captureUndo + a single setDb, so one Undo reverts every package in the list together. */
  savePackagesToReport: (wpIds: string[]) => void;
  saveAllToReport: (projectId: string) => void;
  undoPackage: (wpId: string) => void;
  undoLastSave: () => void;
  dismissUndo: () => void;
  importItems: (projectId: string, rows: ImportRow[]) => void;
  addCatalogEntry: (prefix: string, label: string) => void;
  createProject: (name: string, gc: string, supplyOnly?: boolean) => string;
  renameProject: (projectId: string, name: string, gc: string) => void;
  /** Shallow patch on a project (e.g. gcAddress remembered from the cover modal). */
  updateProject: (projectId: string, patch: Partial<Project>) => void;
  addManualPackage: (projectId: string, prefix: string, label: string) => void;
  renamePackage: (wpId: string, prefix: string, label: string) => void;
  /** Flip one package between supply-only (closes on site) and supply-and-install. */
  setPackageScope: (wpId: string, supplyOnly: boolean) => void;
  deletePackage: (wpId: string) => void;
  closeProject: (projectId: string) => void;
  reopenProject: (projectId: string) => void;
  deleteProject: (projectId: string) => void;
  setThresholds: (projectId: string, patch: Partial<Thresholds>) => void;
  bulkEditItems: (ids: string[], patch: Partial<MaterialItem>) => void;
  /** Move items through the install cycle. **The only way to write the stage** — every
   * surface (row, column header, toolbar, modal) comes through here so `stagePatch`
   * decides OFCI, the date stamps and the delivery-log arbitration once. A blank `date`
   * means "keep the stamp it already has, or today". Items whose delivery log owns the
   * stage are skipped; count them with `logDrivesStage` if you need to warn first. */
  setItemStage: (ids: string[], stage: ItemStage, date?: string) => void;
  resetShipDateAuto: (id: string) => void;
  addVendor: (name: string) => void;
  /** `kind` records the movement (supply-only flow); omitted = plain receipt, as before.
   * `date` defaults to today. */
  addDelivery: (itemId: string, qty: number, note: string, kind?: DeliveryKind, date?: string) => void;
  removeDelivery: (itemId: string, index: number) => void;
  /** Wipe an item's whole delivery log and go back to "not received" — the escape hatch
   * for when the log itself was the mistake, not just one entry. */
  clearDeliveries: (itemId: string) => void;
  /** Register that `qty` units went up on `date` (lote 44). Clamped to what has actually
   * ARRIVED — you cannot install what is still on backorder. Reaching the full QTY closes
   * the item as installed, the same way a delivery entry that reaches it marks received. */
  addInstall: (itemId: string, qty: number, note: string, date?: string) => void;
  removeInstall: (itemId: string, index: number) => void;
  /** Restore from a backup file — replaces the ENTIRE database (migrated for defaults). */
  replaceDb: (next: Db) => void;
}

export interface AppContextValue {
  db: Db;
  actions: Actions;
  nav: (view: ViewKey, opts?: { flash?: string }) => void;
  view: ViewKey;
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  flash: string | null;
  undoMessage: string | null;
  thresholdsFor: (projectId: string) => Thresholds;
  /** Overview/Submittals → Material List deep link: scroll to + highlight this item. */
  focusItemId: string | null;
  jumpToItem: (projectId: string, itemId: string) => void;
  clearFocusItem: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
