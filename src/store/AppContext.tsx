// AppContext.tsx — app-wide state: the material database (projects, work packages,
// items, catalog, per-project thresholds), current tab, and the flash message.
// Screens read it via useApp(), which lives in `useApp.ts` along with the context object
// and the action types — this module exports only the provider component.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Db, MaterialItem, ViewKey, WorkPackage } from './types';
import { addDeliveryTo, addInstallTo, applyItemPatch, clearDeliveriesFrom, computeShipDate, DEFAULT_THRESHOLDS, INSTALL_DEFAULTS, migrateDb, normQty, removeDeliveryFrom, removeInstallFrom, snapshot, stagePatch, SUBMITTAL_DEFAULTS, today } from './logic';
import { buildDb } from '../seed/demoData';
import { loadJSON, saveJSON } from './persist';
import { AppContext, type Actions, type AppContextValue } from './useApp';

// Local wall-clock "YYYY-MM-DD HH:mm" for the "in report since" stamp — toISOString()
// would show UTC (5 hours ahead for this user's timezone).
const now = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db>(() => {
    // migrateDb also runs on the fresh seed — it backfills derived defaults (e.g. supplyOnly).
    const loaded = loadJSON<Db>('db');
    return migrateDb(loaded ?? buildDb());
  });
  // Overview first: the portfolio board answers "what is on fire across every project"
  // in one screen, which is the question this tool exists for. The Material List is
  // where you go once you know which row you came for.
  const [view, setView] = useState<ViewKey>('overview');
  // Derived from the database rather than a hard-coded 'p1'. The literal used to be the
  // default here AND an id in the seed, so nothing ever exercised the mismatch — and the
  // screens quietly fall back to `projects[0]`, which hides a wrong selection instead of
  // showing it.
  const [activeProjectId, setActiveProjectId] = useState(() => db.projects.find((p) => !p.archived)?.id ?? db.projects[0]?.id ?? '');
  const [flash, setFlash] = useState<string | null>(null);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  // Live refs so the memoized actions can read current state (undo snapshots).
  const dbRef = useRef(db);
  dbRef.current = db;
  const undoRef = useRef<{ items: MaterialItem[]; packages: WorkPackage[] } | null>(null);

  useEffect(() => saveJSON('db', db), [db]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (!undoMessage) return;
    const id = setTimeout(() => setUndoMessage(null), 10000);
    return () => clearTimeout(id);
  }, [undoMessage]);

  const nav = useCallback((v: ViewKey, opts?: { flash?: string }) => {
    setView(v);
    setFlash(opts?.flash ?? null);
  }, []);

  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const jumpToItem = useCallback((projectId: string, itemId: string) => {
    setActiveProjectId(projectId);
    setView('list');
    setFlash(null);
    setFocusItemId(itemId);
  }, []);
  const clearFocusItem = useCallback(() => setFocusItemId(null), []);

  const thresholdsFor = useCallback((projectId: string) => db.thresholds[projectId] ?? DEFAULT_THRESHOLDS, [db.thresholds]);

  const mapItems = (fn: (it: MaterialItem) => MaterialItem) => setDb((d) => ({ ...d, items: d.items.map(fn) }));

  const actions: Actions = useMemo(() => {
    const captureUndo = (message: string) => {
      undoRef.current = { items: dbRef.current.items, packages: dbRef.current.packages };
      setUndoMessage(message);
    };
    return {
      editItem: (id, patch) => mapItems((it) => (it.id === id ? applyItemPatch(it, patch) : it)),
      resetShipDateAuto: (id) =>
        mapItems((it) => {
          if (it.id !== id) return it;
          const auto = computeShipDate(it.poDate, it.lead);
          return { ...it, shipDateManual: false, shipDate: auto ?? '' };
        }),
      bulkEditItems: (ids, patch) => {
        const idSet = new Set(ids);
        mapItems((it) => (idSet.has(it.id) ? applyItemPatch(it, patch) : it));
      },
      // The one stage writer. Unlike bulkEditItems it cannot take a precomputed patch:
      // stagePatch reads the item (OFCI, the existing stamps, whether the delivery log
      // owns the stage), so the patch is derived per item.
      setItemStage: (ids, stage, date) => {
        const idSet = new Set(ids);
        mapItems((it) => (idSet.has(it.id) ? applyItemPatch(it, stagePatch(stage, date ?? '', it)) : it));
      },
      moveItem: (id, wpId) => mapItems((it) => (it.id === id ? { ...it, wpId } : it)),
      moveItemRelative: (dragId, targetId, place) =>
        setDb((d) => {
          if (dragId === targetId) return d;
          const items = [...d.items];
          const from = items.findIndex((it) => it.id === dragId);
          if (from < 0) return d;
          const [moved] = items.splice(from, 1);
          let to = items.findIndex((it) => it.id === targetId);
          if (to < 0) return d;
          if (place === 'after') to += 1;
          items.splice(to, 0, moved);
          return { ...d, items };
        }),
      reorderPackage: (id, dir) =>
        setDb((d) => {
          const packages = [...d.packages];
          const idx = packages.findIndex((p) => p.id === id);
          if (idx < 0) return d;
          const projectId = packages[idx].projectId;
          const sibs = packages.map((p, i) => (p.projectId === projectId ? i : -1)).filter((i) => i >= 0);
          const pos = sibs.indexOf(idx);
          const target = pos + dir;
          if (target < 0 || target >= sibs.length) return d;
          const a = sibs[pos];
          const b = sibs[target];
          [packages[a], packages[b]] = [packages[b], packages[a]];
          return { ...d, packages };
        }),
      deleteItem: (id) => setDb((d) => ({ ...d, items: d.items.filter((it) => it.id !== id) })),
      // Copies the spec data (description, qty, U/M, vendor, lead, on-site, submittal,
      // notes) into a fresh DRAFT row right below — lifecycle fields reset on purpose.
      duplicateItem: (id) =>
        setDb((d) => {
          const idx = d.items.findIndex((it) => it.id === id);
          if (idx < 0) return d;
          const copy: MaterialItem = {
            ...d.items[idx],
            id: 'i_' + Date.now(),
            po: '', poDate: '', shipDate: '', shipDateManual: false,
            delivered: false, ordered: false, receivedQty: 0, deliveries: [], receivedDate: '',
            siteDate: '', installed: false, installedDate: '', report: null,
          };
          const items = [...d.items];
          items.splice(idx + 1, 0, copy);
          return { ...d, items };
        }),
      deleteItems: (ids) => {
        const idSet = new Set(ids);
        setDb((d) => ({ ...d, items: d.items.filter((it) => !idSet.has(it.id)) }));
      },
      addItem: (wpId) =>
        setDb((d) => ({
          ...d,
          items: [
            ...d.items,
            {
              id: 'i_' + Date.now(), wpId, description: '', qty: '', um: 'ea',
              vendor: '', lead: '', onsite: '', submittal: 'Pending', delivered: false,
              ordered: false, po: '', poDate: '', shipDate: '', shipDateManual: false, notes: '',
              receivedQty: 0, deliveries: [], installations: [], receivedDate: '', fieldDate: '', ...INSTALL_DEFAULTS, ...SUBMITTAL_DEFAULTS, report: null,
            },
          ],
        })),
      savePackageToReport: (wpId) => {
        const pkg = dbRef.current.packages.find((p) => p.id === wpId);
        captureUndo(`Saved ${pkg?.label ?? 'package'} to report`);
        setDb((d) => ({
          ...d,
          packages: d.packages.map((p) => (p.id === wpId ? { ...p, reportSince: now() } : p)),
          items: d.items.map((it) => (it.wpId === wpId ? { ...it, report: snapshot(it) } : it)),
        }));
      },
      savePackagesToReport: (wpIds) => {
        const idSet = new Set(wpIds);
        captureUndo(`Saved ${wpIds.length} package${wpIds.length === 1 ? '' : 's'} to report`);
        setDb((d) => ({
          ...d,
          packages: d.packages.map((p) => (idSet.has(p.id) ? { ...p, reportSince: now() } : p)),
          items: d.items.map((it) => (idSet.has(it.wpId) ? { ...it, report: snapshot(it) } : it)),
        }));
      },
      saveAllToReport: (projectId) => {
        captureUndo('Saved ALL packages to report');
        setDb((d) => {
          const wpIds = new Set(d.packages.filter((p) => p.projectId === projectId).map((p) => p.id));
          return {
            ...d,
            packages: d.packages.map((p) => (wpIds.has(p.id) ? { ...p, reportSince: now() } : p)),
            items: d.items.map((it) => (wpIds.has(it.wpId) ? { ...it, report: snapshot(it) } : it)),
          };
        });
      },
      undoLastSave: () => {
        const snap = undoRef.current;
        if (!snap) return;
        undoRef.current = null;
        setUndoMessage(null);
        setDb((d) => ({ ...d, items: snap.items, packages: snap.packages }));
        setFlash('Last save undone — data restored to the state right before it.');
      },
      dismissUndo: () => setUndoMessage(null),
      undoPackage: (wpId) =>
        setDb((d) => ({
          ...d,
          items: d.items
            .filter((it) => !(it.wpId === wpId && !it.report))
            .map((it) => (it.wpId === wpId && it.report ? { ...it, ...it.report } : it)),
        })),
      importItems: (projectId, rows) =>
        setDb((d) => {
          const packages = [...d.packages];
          const items = [...d.items];
          const supplyOnly = d.projects.find((p) => p.id === projectId)?.supplyOnly ?? false;
          const findOrCreate = (prefix: string, label: string) => {
            let pkg = packages.find((p) => p.projectId === projectId && p.prefix === prefix);
            if (!pkg) {
              pkg = { id: 'w_' + Date.now() + '_' + packages.length, projectId, prefix, label, reportSince: null, supplyOnly };
              packages.push(pkg);
            }
            return pkg;
          };
          rows.forEach((r, i) => {
            const pkg = findOrCreate(r.prefix, r.label);
            items.push({
              id: 'i_' + Date.now() + '_' + i, wpId: pkg.id, description: r.name, qty: normQty(r.qty), um: r.um,
              vendor: r.mfr || '', lead: '', onsite: '', submittal: 'Pending', delivered: false,
              ordered: false, po: '', poDate: '', shipDate: '', shipDateManual: false, notes: r.part || '',
              receivedQty: 0, deliveries: [], installations: [], receivedDate: '', fieldDate: '', ...INSTALL_DEFAULTS, ...SUBMITTAL_DEFAULTS, report: null,
            });
          });
          return { ...d, packages, items };
        }),
      addCatalogEntry: (prefix, label) =>
        setDb((d) => (d.catalog.some((w) => w.prefix === prefix) ? d : { ...d, catalog: [...d.catalog, { prefix, label }] })),
      // A new project starts empty: its packages come from the materials import or from
      // "Add work package". (The blank 7-row scaffold went away with batch 6's modal.)
      createProject: (name, gc, supplyOnly = false) => {
        const id = 'p_' + Date.now();
        setDb((d) => ({
          ...d,
          projects: [...d.projects, { id, name, gc, supplyOnly }],
          thresholds: { ...d.thresholds, [id]: { ...DEFAULT_THRESHOLDS } },
        }));
        return id;
      },
      renameProject: (projectId, name, gc) =>
        setDb((d) => ({
          ...d,
          projects: d.projects.map((p) => (p.id === projectId ? { ...p, name: name.trim() || p.name, gc: gc.trim() || p.gc } : p)),
        })),
      updateProject: (projectId, patch) =>
        setDb((d) => ({
          ...d,
          projects: d.projects.map((p) => (p.id === projectId ? { ...p, ...patch } : p)),
        })),
      addManualPackage: (projectId, prefix, label) =>
        setDb((d) => ({
          ...d,
          packages: [
            ...d.packages,
            {
              id: 'w_' + Date.now(), projectId, prefix, label, reportSince: null,
              supplyOnly: d.projects.find((p) => p.id === projectId)?.supplyOnly ?? false,
            },
          ],
        })),
      renamePackage: (wpId, prefix, label) =>
        setDb((d) => ({ ...d, packages: d.packages.map((p) => (p.id === wpId ? { ...p, prefix, label } : p)) })),
      // Supply-only scope correction on one package — the project flag is only the
      // default its packages inherit, so a package can always be flipped on its own.
      setPackageScope: (wpId, supplyOnly) =>
        setDb((d) => ({ ...d, packages: d.packages.map((p) => (p.id === wpId ? { ...p, supplyOnly } : p)) })),
      deletePackage: (wpId) =>
        setDb((d) => ({
          ...d,
          packages: d.packages.filter((p) => p.id !== wpId),
          items: d.items.filter((it) => it.wpId !== wpId),
        })),
      closeProject: (projectId) =>
        setDb((d) => ({
          ...d,
          projects: d.projects.map((p) => (p.id === projectId ? { ...p, archived: true, archivedAt: now() } : p)),
        })),
      reopenProject: (projectId) =>
        setDb((d) => ({
          ...d,
          projects: d.projects.map((p) => (p.id === projectId ? { ...p, archived: false, archivedAt: undefined } : p)),
        })),
      // Hard delete — unlike closeProject this permanently removes the project and
      // everything under it (packages, items, thresholds). No archive, no undo.
      deleteProject: (projectId) =>
        setDb((d) => {
          const wpIds = new Set(d.packages.filter((p) => p.projectId === projectId).map((p) => p.id));
          const thresholds = { ...d.thresholds };
          delete thresholds[projectId];
          return {
            ...d,
            projects: d.projects.filter((p) => p.id !== projectId),
            packages: d.packages.filter((p) => p.projectId !== projectId),
            items: d.items.filter((it) => !wpIds.has(it.wpId)),
            thresholds,
          };
        }),
      setThresholds: (projectId, patch) =>
        setDb((d) => ({
          ...d,
          thresholds: { ...d.thresholds, [projectId]: { ...(d.thresholds[projectId] ?? DEFAULT_THRESHOLDS), ...patch } },
        })),
      addVendor: (name) =>
        setDb((d) => {
          const trimmed = name.trim();
          if (!trimmed || d.vendors.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return d;
          return { ...d, vendors: [...d.vendors, trimmed] };
        }),
      // Both delivery-log writers are pure functions in logic.ts — see the log-writer
      // block there for why the cascade is not re-derived here anymore.
      addDelivery: (itemId, qty, note, kind, date) =>
        mapItems((it) => (it.id === itemId ? addDeliveryTo(it, { qty, note, date: date || today(), ...(kind ? { kind } : {}) }) : it)),
      removeDelivery: (itemId, index) => mapItems((it) => (it.id === itemId ? removeDeliveryFrom(it, index) : it)),
      clearDeliveries: (itemId) => mapItems((it) => (it.id === itemId ? clearDeliveriesFrom(it) : it)),
      // Same story on the installation side (lote 44): both writers are pure, the clamp
      // to what actually arrived and the "log reached the QTY → installed" derivation
      // live in logic.ts, not here.
      addInstall: (itemId, qty, note, date) =>
        mapItems((it) => (it.id === itemId ? addInstallTo(it, { qty, note, date: date || today() }) : it)),
      removeInstall: (itemId, index) => mapItems((it) => (it.id === itemId ? removeInstallFrom(it, index) : it)),
      replaceDb: (next) => setDb(migrateDb(next)),
    };
  }, []);

  const value: AppContextValue = { db, actions, nav, view, activeProjectId, setActiveProjectId, flash, undoMessage, thresholdsFor, focusItemId, jumpToItem, clearFocusItem };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
