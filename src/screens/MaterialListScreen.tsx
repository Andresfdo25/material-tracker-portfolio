// MaterialListScreen.tsx — the working draft view. Editable grid; Buy-By and Status
// recalc live as you type Lead Time / On-Site Req. Date. Draft vs report per package.
// Everything project-scoped (Import, Add Work Package, semaphore thresholds, status
// filter, column visibility, Close Project) lives here.
//
// After SPEC-hardening §4 this file owns the STATE, the EFFECTS (deep link, print,
// Ctrl+S) and the COMPOSITION only. The pieces it composes:
//   · components/MaterialListToolbar — the navy band and its three rows of actions
//   · components/grid/MaterialGrid   — one editable table per work package
//   · components/StatusFilterBar     — the click-to-filter status badges (in the toolbar)
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/useApp';
import {
  closesAtSite, computeItem, deliveryLogRows, deliveryWatch, FILTERABLE, fmtFileStamp, fmtMDY, pendingSubmittalApproval, pkgDirty, today,
} from '../store/logic';
import { loadJSON, saveJSON } from '../store/persist';
import { LIST_FILTER_KEY } from '../store/listFilter';
import { usePersisted } from '../store/usePersisted';
import type { Cfg, ExportMode, ItemStatus, MaterialItem } from '../store/types';
import { Button } from '../components/ds/Button';
import { Banner } from '../components/ds/Banner';
import { PackageMoveButtons, WorkPackageBar, type StatusChip } from '../components/ds/WorkPackageBar';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { AddWorkPackageModal } from '../components/AddWorkPackageModal';
import { ImportMaterialsModal } from '../components/ImportMaterialsModal';
import { QuickAddModal } from '../components/QuickAddModal';
import { BreakdownDeliveryModal } from '../components/BreakdownDeliveryModal';
import { BreakdownSubmittalsModal } from '../components/BreakdownSubmittalsModal';
import { RenamePackageControl } from '../components/RenamePackageControl';
import { MaterialListToolbar } from '../components/MaterialListToolbar';
import { MaterialGrid } from '../components/grid/MaterialGrid';
import { PrintReport } from '../components/PrintReport';
import { ExportPdfModal, type ExportChoice, type ExportPkgOption } from '../components/ExportPdfModal';

export function MaterialListScreen() {
  const { db, actions, activeProjectId, setActiveProjectId, thresholdsFor, focusItemId, clearFocusItem } = useApp();
  // Collapsed packages survive leaving the screen — the state used to live in a plain
  // useState, so every trip to Overview and back re-expanded everything. Keyed by wpId,
  // so it's per package across all projects.
  const [collapsed, setCollapsed] = usePersisted<Record<string, boolean>>('list:collapsed', {});
  const [viewMode, setViewMode] = useState<ExportMode>('internal');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showAddWp, setShowAddWp] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [breakdownId, setBreakdownId] = useState<string | null>(null);
  const [submittalBreakdownId, setSubmittalBreakdownId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [includeSubSummary, setIncludeSubSummary] = useState(false);
  const [includeDeliveryLog, setIncludeDeliveryLog] = useState(true);
  // Work packages to print: null = all of them (the usual case). A subset is what the
  // PM picks in advanced phases or when the report covers a single change order.
  const [printWpIds, setPrintWpIds] = useState<string[] | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  // Chrome/Edge/Safari seed the "Save as PDF" filename from document.title, so the
  // export swaps it in for the duration of the print dialog (see the print effect).
  const printTitleRef = useRef('');
  // Overview's purchasing gauges pre-load this same persisted key before navigating here
  // (store/listFilter.ts) — the filter that survives a reload now also survives a jump
  // from the board.
  const [filter, setFilter] = usePersisted<ItemStatus[]>(LIST_FILTER_KEY, []);
  // ⏰ Late deliveries — its own axis, so its own state (see isLate below).
  const [lateOnly, setLateOnly] = useState(false);
  const [pkgFilter, setPkgFilter] = useState<Record<string, ItemStatus[]>>({});
  const [search, setSearch] = useState('');
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>(() => loadJSON<Record<string, boolean>>('cols') ?? {});
  useEffect(() => saveJSON('cols', hiddenCols), [hiddenCols]);
  const toggle = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  // Ctrl+S / Cmd+S — Save ALL to report. Blurs the active cell first so an in-flight
  // edit commits before the snapshot; the ref keeps the handler pointed at the
  // currently open project without re-binding the listener.
  const saveShortcutRef = useRef({ id: '', canSave: false });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault(); // keep the browser's Save Page dialog out of the way
      const t = saveShortcutRef.current;
      if (!t.canSave) return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      actions.saveAllToReport(t.id);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [actions]);

  // Deferred print: the Export dialog sets the summary flag and requests a print; we
  // fire window.print() from an effect so the PrintReport DOM (with/without the summary)
  // is committed before the print dialog captures it.
  useEffect(() => {
    if (!pendingPrint) return;
    const prev = document.title;
    if (printTitleRef.current) document.title = printTitleRef.current;
    // Restore on afterprint, NOT right after print(): Chrome's preview is async, so
    // print() can return before the Save-as-PDF dialog reads the title — restoring
    // synchronously wiped the suggested filename. Long timer covers browsers that
    // never fire afterprint.
    let timer = 0;
    const restore = () => {
      window.clearTimeout(timer);
      document.title = prev;
      // Back to the whole project: the hidden PrintReport is also what a plain browser
      // Ctrl+P captures, and that one never went through the export dialog.
      setPrintWpIds(null);
    };
    window.addEventListener('afterprint', restore, { once: true });
    timer = window.setTimeout(restore, 120000);
    window.print();
    setPendingPrint(false);
  }, [pendingPrint]);

  // Deep link from Overview/Submittals: scroll to the item row and flash it. If a
  // filter/search/collapse hides the row, clear them and retry once.
  useEffect(() => {
    if (!focusItemId) return;
    const tryScroll = () => {
      const row = document.querySelector(`tr[data-item-id="${focusItemId}"]`);
      if (!row) return false;
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.classList.add('row-flash');
      setTimeout(() => row.classList.remove('row-flash'), 2600);
      return true;
    };
    const t = setTimeout(() => {
      if (!tryScroll()) {
        setFilter([]);
        setSearch('');
        setPkgFilter({});
        // Expand only the package holding the item — collapse state is persisted now,
        // so wiping it would undo a layout the PM set on purpose.
        const wpId = db.items.find((i) => i.id === focusItemId)?.wpId;
        if (wpId) setCollapsed((c) => ({ ...c, [wpId]: false }));
        setTimeout(tryScroll, 350);
      }
      clearFocusItem();
    }, 300);
    return () => clearTimeout(t);
  }, [focusItemId, clearFocusItem, db.items, setCollapsed, setFilter]);

  const activeProjects = db.projects
    .filter((p) => !p.archived)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const project = db.projects.find((p) => p.id === activeProjectId) ?? activeProjects[0] ?? db.projects[0];

  if (!project) {
    saveShortcutRef.current = { id: '', canSave: false };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--ink)' }}>No projects yet</div>
        <Button variant="primary" onClick={() => setShowCreateProject(true)}>＋ New Project</Button>
        {showCreateProject && <CreateProjectModal onClose={() => setShowCreateProject(false)} />}
      </div>
    );
  }

  const readOnly = !!project.archived;
  saveShortcutRef.current = { id: project.id, canSave: !readOnly };
  const packages = db.packages.filter((p) => p.projectId === project.id);
  const itemsOf = (wpId: string) => db.items.filter((i) => i.wpId === wpId);
  const dirtyCount = packages.filter((p) => pkgDirty(itemsOf(p.id))).length;
  const client = viewMode === 'client';
  const t = thresholdsFor(project.id);
  const cfg = { window: t.window };
  // The scope rides in the cfg: computeItem only ever sees an item snapshot, so a
  // supply-only package is what tells it the cycle closes at 📍 on-site instead of 🔩.
  const scopeByWp = new Map(packages.map((p) => [p.id, closesAtSite(p, project)]));
  const cfgOf = (wpId: string): Cfg => ({ window: t.window, supplyOnly: scopeByWp.get(wpId) ?? false });

  const allItems = packages.flatMap((p) => itemsOf(p.id));
  const statusCounts = {} as Record<ItemStatus, number>;
  allItems.forEach((it) => {
    const s = computeItem(it, cfgOf(it.wpId)).status;
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  });
  // Per-package icon filter wins over the top (project-wide) filter for its table.
  // Filters are multi-select — a row shows if its status matches ANY selected status.
  // The search box narrows further, across every package (description/vendor/PO#/notes).
  const q = search.trim().toLowerCase();
  const matchesSearch = (it: MaterialItem) =>
    !q || [it.description, it.vendor, it.po, it.notes].some((x) => String(x ?? '').toLowerCase().includes(q));
  const effectiveFilter = (wpId: string): ItemStatus[] => (pkgFilter[wpId]?.length ? pkgFilter[wpId] : filter);
  // ⏰ Late is a second AXIS, not another status (SPEC-delivery-watch §5.1): a late item is
  // still ORDERED in the semaphore, so this NARROWS whatever the badges select instead of
  // widening their union — "ordered AND late", never "ordered OR late".
  const isLate = (it: MaterialItem) => deliveryWatch(it, cfgOf(it.wpId)) === 'late';
  const filteredOf = (wpId: string) => {
    const f = effectiveFilter(wpId);
    return itemsOf(wpId).filter((it) => matchesSearch(it) && (!lateOnly || isLate(it)) && (!f.length || f.includes(computeItem(it, cfgOf(wpId)).status)));
  };
  const lateCount = allItems.filter(isLate).length;
  const matchCount = allItems.filter((it) => matchesSearch(it) && (!lateOnly || isLate(it)) && (!filter.length || filter.includes(computeItem(it, cfgOf(it.wpId)).status))).length;
  const toggleFilter = (s: ItemStatus) => setFilter((f) => (f.includes(s) ? f.filter((x) => x !== s) : [...f, s]));
  const togglePkgFilter = (wpId: string, s: ItemStatus) =>
    setPkgFilter((f) => {
      const cur = f[wpId] ?? [];
      return { ...f, [wpId]: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] };
    });

  const chipsOf = (wpId: string): StatusChip[] => {
    const counts = {} as Record<ItemStatus, number>;
    itemsOf(wpId).forEach((it) => {
      const s = computeItem(it, cfgOf(wpId)).status;
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return FILTERABLE.filter((s) => counts[s]).map((s) => ({ status: s, count: counts[s] }));
  };

  const allCollapsed = packages.length > 0 && packages.every((p) => collapsed[p.id]);
  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    if (!allCollapsed) packages.forEach((p) => { next[p.id] = true; });
    setCollapsed(next);
  };

  const closeProject = () => {
    if (!window.confirm(`Close "${project.name}"? It moves to Completed Projects (read-only) and leaves the main list. You can reopen it later.`)) return;
    actions.closeProject(project.id);
    const next = activeProjects.find((p) => p.id !== project.id);
    if (next) setActiveProjectId(next.id);
  };

  // Hard delete — permanent, unlike Close Project. The confirm wording is deliberate.
  const deleteProject = () => {
    if (!window.confirm('Are you sure you want to permanently delete this project? This action cannot be undone.')) return;
    actions.deleteProject(project.id);
    const next = activeProjects.find((p) => p.id !== project.id);
    if (next) setActiveProjectId(next.id);
  };

  // Toolbar action: one date across every item of the project. The confirm is here and
  // not in the toolbar because it names the project and counts the items.
  const setGlobalOnsite = (iso: string) => {
    const ids = packages.flatMap((p) => itemsOf(p.id).map((it) => it.id));
    if (ids.length && window.confirm(`Set On-Site Req. Date to ${fmtMDY(iso)} for all ${ids.length} items in "${project.name}"? This overwrites existing dates.`)) {
      actions.bulkEditItems(ids, { onsite: iso });
    }
  };

  // Toolbar 🛠 pill: one install window across every package with an installation phase
  // (supply-only is excluded — the toolbar shows the popover only when this is non-empty,
  // and its confirm carries the wording). The window is a PLAN: it never touches stage.
  const installScopeIds = packages.filter((p) => !closesAtSite(p, project)).flatMap((p) => itemsOf(p.id).map((it) => it.id));

  // Only packages that would actually print are offered in the export dialog — PrintReport
  // skips an empty one, so selecting it would promise a section that never appears.
  const exportPkgOptions: ExportPkgOption[] = packages
    .map((p) => {
      const items = itemsOf(p.id);
      return {
        id: p.id,
        label: p.label,
        itemCount: items.length,
        pendingCount: items.filter(pendingSubmittalApproval).length,
        // Same source as the printed block — counting it.deliveries here would offer
        // "1 delivery" for a PDF that goes on to print eighteen.
        deliveryCount: items.reduce((s, it) => s + deliveryLogRows(it).length, 0),
      };
    })
    .filter((p) => p.itemCount > 0);
  // "Material List - BVSD Fairview HS - 07222026" (chars illegal in filenames stripped).
  const pdfFilename = `Material List - ${project.name} - ${fmtFileStamp(today())}`.replace(/[\\/:*?"<>|]/g, '-');
  const exportPdf = () => setShowExport(true);
  const runExport = ({ includeSummary, includeDeliveryLog, wpIds }: ExportChoice) => {
    printTitleRef.current = pdfFilename;
    setIncludeSubSummary(includeSummary);
    setIncludeDeliveryLog(includeDeliveryLog);
    setPrintWpIds(wpIds);
    setShowExport(false);
    setPendingPrint(true);
  };
  // The subset rides in as a filtered package list: every part of the report (tables,
  // delivery log, submittal summary) is derived from it, so one filter covers all three.
  const printPackages = printWpIds ? packages.filter((p) => printWpIds.includes(p.id)) : packages;
  const breakdownItem = breakdownId ? db.items.find((i) => i.id === breakdownId) : null;
  const submittalBreakdownItem = submittalBreakdownId ? db.items.find((i) => i.id === submittalBreakdownId) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} data-print-mode={viewMode}>
      <MaterialListToolbar
        project={project}
        projects={activeProjects}
        packages={packages}
        itemsOf={itemsOf}
        itemCount={allItems.length}
        matchCount={matchCount}
        client={client}
        readOnly={readOnly}
        dirtyCount={dirtyCount}
        viewMode={viewMode}
        onViewMode={setViewMode}
        search={search}
        onSearch={setSearch}
        statusCounts={statusCounts}
        filter={filter}
        onToggleFilter={toggleFilter}
        onClearFilter={() => { setFilter([]); setLateOnly(false); }}
        lateCount={lateCount}
        lateOnly={lateOnly}
        onToggleLate={() => setLateOnly((v) => !v)}
        allCollapsed={allCollapsed}
        onCollapseAll={collapseAll}
        hiddenCols={hiddenCols}
        onToggleCol={(key) => setHiddenCols((h) => ({ ...h, [key]: !h[key] }))}
        onResetCols={() => setHiddenCols({})}
        onSelectProject={setActiveProjectId}
        onCloseProject={closeProject}
        onDeleteProject={deleteProject}
        onAddWorkPackage={() => setShowAddWp(true)}
        onImportMaterials={() => setShowImport(true)}
        onQuickAdd={() => setShowQuickAdd(true)}
        onExportPdf={exportPdf}
        onSaveAll={() => actions.saveAllToReport(project.id)}
        onGlobalOnsite={setGlobalOnsite}
        onFieldMeasure={(ids, iso) => actions.bulkEditItems(ids, { fieldDate: iso })}
        onFieldMeasureClear={(ids) => actions.bulkEditItems(ids, { fieldDate: '' })}
        onStage={(stage, date, ids) => { if (ids?.length) actions.setItemStage(ids, stage, date); }}
        onInstallWindow={(v) => { if (installScopeIds.length) actions.bulkEditItems(installScopeIds, { installStart: v.start, installEnd: v.end }); }}
        onInstallWindowClear={() => { if (installScopeIds.length) actions.bulkEditItems(installScopeIds, { installStart: '', installEnd: '' }); }}
      />

      {/* The filter summary ("Showing 4 of 11…") moved inside the search strip (lote
          67): it used to sit down here, separated by a whole banner from the controls
          that produced it. What's left in this block are the two MODE notices — archived
          project and Client·GC view — which are actually screen state. */}
      <div className="no-print">
        {readOnly && (
          <Banner tone="warning" icon="📁">
            <strong>Completed project — read-only.</strong> Reopen it from the Completed Projects folder to make changes.
          </Banner>
        )}
        {!readOnly && client && (
          <Banner tone="warning" icon="📤">
            <strong>Client / GC version.</strong> Internal procurement columns — lead time, buy-by, submittal state, PO info — are hidden. This is what an export to the client shows.
          </Banner>
        )}
      </div>

      <div className="screen-only" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {packages.map((pkg, pkgIdx) => {
          const items = filteredOf(pkg.id);
          if ((filter.length || q) && !pkgFilter[pkg.id]?.length && items.length === 0) return null;
          const dirty = pkgDirty(itemsOf(pkg.id));
          const supplyOnly = scopeByWp.get(pkg.id) ?? false;
          return (
            <div key={pkg.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <WorkPackageBar
                label={pkg.label}
                dirty={dirty}
                statusChips={!client ? chipsOf(pkg.id) : undefined}
                activeStatuses={pkgFilter[pkg.id] ?? []}
                onStatusFilter={(s) => togglePkgFilter(pkg.id, s)}
                renameControl={!client && !readOnly ? <RenamePackageControl pkg={pkg} /> : undefined}
                collapsed={!!collapsed[pkg.id]}
                stateText={dirty ? 'Draft — not in the report yet' : `In the report since ${pkg.reportSince}`}
                onToggle={() => toggle(pkg.id)}
                actions={
                  !client && !readOnly && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {/* Scope of THIS package — the project checkbox is only the default
                          it inherited. A package must not mix both scopes, so the mark
                          lives here and not on the item (see closesAtSite). */}
                      <button
                        type="button"
                        className="chip-btn"
                        aria-pressed={supplyOnly}
                        title={supplyOnly
                          ? 'Supply only — items close when they reach the jobsite. Click to switch to supply and install.'
                          : 'Supply and install — items close once installed. Click to switch to supply only.'}
                        onClick={() => {
                          const next = !supplyOnly;
                          const msg = next
                            ? `Mark "${pkg.label}" as SUPPLY ONLY? Its items will close at 📍 On site — we furnish the material but don't install it.`
                            : `Mark "${pkg.label}" as SUPPLY AND INSTALL? Its items will close at 🔩 Installed.`;
                          if (window.confirm(msg)) actions.setPackageScope(pkg.id, next);
                        }}
                        style={{
                          cursor: 'pointer', padding: '3px 10px', borderRadius: 'var(--radius-lg)', whiteSpace: 'nowrap',
                          font: 'var(--text-caption)', fontWeight: 600,
                          borderWidth: 1, borderStyle: 'solid',
                          borderColor: supplyOnly ? 'var(--status-on-site-ink)' : 'var(--hairline)',
                          background: supplyOnly ? 'var(--status-on-site)' : 'transparent',
                          color: supplyOnly ? 'var(--status-on-site-ink)' : 'var(--body)',
                        }}
                      >
                        {supplyOnly ? '📍 Supply only' : '🔩 Supply & install'}
                      </button>
                      {/* Publish and order are two families, and without the rule the 🗑
                          used to sit flush against the move arrows: six controls in a row
                          where the irreversible one was neighbor to the most harmless
                          (lote 67). */}
                      <span className="action-sep" />
                      <Button variant={dirty ? 'primary' : 'secondary'} size="sm" disabled={!dirty} style={{ padding: '8px 14px' }} onClick={() => actions.savePackageToReport(pkg.id)}>
                        💾 Save to report
                      </Button>
                      <Button variant="ghost" size="sm" disabled={!dirty} style={{ padding: '8px 12px' }} onClick={() => actions.undoPackage(pkg.id)}>
                        ↩ Undo
                      </Button>
                      <span className="action-sep" />
                      <PackageMoveButtons
                        onMoveUp={() => actions.reorderPackage(pkg.id, -1)}
                        onMoveDown={() => actions.reorderPackage(pkg.id, 1)}
                        upDisabled={pkgIdx === 0}
                        downDisabled={pkgIdx === packages.length - 1}
                      />
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger icon-btn--lg"
                        title="Delete work package (and all its items)"
                        aria-label="Delete work package"
                        onClick={() => {
                          const n = itemsOf(pkg.id).length;
                          if (window.confirm(`DELETE WORK PACKAGE "${pkg.label}"${n ? ` and its ${n} item${n === 1 ? '' : 's'}` : ''}? This can't be undone.`)) {
                            actions.deletePackage(pkg.id);
                          }
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  )
                }
              />
              {!collapsed[pkg.id] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <MaterialGrid
                    items={items}
                    packages={packages}
                    cfg={cfgOf(pkg.id)}
                    client={client}
                    readOnly={readOnly}
                    hidden={hiddenCols}
                    onBreakdown={setBreakdownId}
                    onBreakdownSubmittals={setSubmittalBreakdownId}
                  />
                  {!client && !readOnly && (
                    <div>
                      <Button variant="ghost" size="sm" onClick={() => actions.addItem(pkg.id)} style={{ color: 'var(--muted)', padding: '6px 8px' }}>
                        ＋ Add item
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <PrintReport project={project} packages={printPackages} itemsOf={itemsOf} mode={viewMode} cfg={cfg} showSubmittalSummary={includeSubSummary} showDeliveryLog={includeDeliveryLog} />

      {showExport && (
        <ExportPdfModal mode={viewMode} packages={exportPkgOptions} onExport={runExport} onClose={() => setShowExport(false)} />
      )}
      {showCreateProject && <CreateProjectModal onClose={() => setShowCreateProject(false)} />}
      {showAddWp && <AddWorkPackageModal projectId={project.id} onClose={() => setShowAddWp(false)} />}
      {showImport && <ImportMaterialsModal project={project} onClose={() => setShowImport(false)} />}
      {showQuickAdd && <QuickAddModal project={project} onClose={() => setShowQuickAdd(false)} />}
      {breakdownItem && <BreakdownDeliveryModal item={breakdownItem} onClose={() => setBreakdownId(null)} />}
      {submittalBreakdownItem && <BreakdownSubmittalsModal item={submittalBreakdownItem} onClose={() => setSubmittalBreakdownId(null)} />}
    </div>
  );
}
