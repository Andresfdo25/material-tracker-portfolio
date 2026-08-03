// MaterialListToolbar.tsx — the sticky header of the Material List. Extracted from
// MaterialListScreen (SPEC-hardening §4); the screen still owns ALL the state, this only
// renders it and calls back.
//
// SHAPE (lote 67). Two objects, not three equal-weight rows:
//
//   · The PURPLE BAND — *what am I doing to this project*. On top the identity (name, GC,
//     date, the switcher and the lifecycle); a rule; below the work banks, each with its
//     own small-caps label: CAPTURE · SET ACROSS THE PROJECT · VIEW & EXPORT · PUBLISH.
//     It's the same device as Overview's `ClockGroup` — grouping under the name of the
//     question they answer — applied to buttons. It used to be fourteen controls spread
//     across three rows of equal weight, unnamed, and the project name competed in
//     hierarchy with "Quick Add".
//
//   · The WHITE STRIP below — *what am I looking at right now*: search, the semaphore
//     filters, ⏰ LATE, and to the right the view tools (collapse, columns). The semaphore
//     badges are PASTELS, drawn to read over white, and they used to live on the purple.
//     Moving them down here gives them back their background, leaves the band at two
//     rows (the sticky header measures less, which shows on a long list), and joins the
//     "Showing 4 of 11" summary with the controls that produce it.
//
// Only the STRIP stays sticky (`.sticky-toolbar`, see `index.css`): with both pinned the
// fixed header measured ~200px and half were buttons unused while reading.
import type { ReactNode } from 'react';
import type { ExportMode, ItemStage, ItemStatus, MaterialItem, Project, WorkPackage } from '../store/types';
import { fmtLong, today } from '../store/logic';
import { Button } from './ds/Button';
import { StatusBadge } from './ds/StatusBadge';
import { ProjectSwitcher } from './ProjectSwitcher';
import { RenameProjectControl } from './RenameProjectControl';
import { ThresholdsPopover } from './ThresholdsPopover';
import { BulkSetPopover } from './BulkSetPopover';
import { FieldMeasurePopover } from './FieldMeasurePopover';
import { StagePopover } from './StagePopover';
import { ManageColumnsMenu } from './ManageColumnsMenu';
import { StatusFilterBar } from './StatusFilterBar';

/** The band's buttons share height with the three "Set across the project" popovers,
 * which draw at 34px (`toolbarStyle` in `BulkSetPopover` / `StagePopover` /
 * `FieldMeasurePopover`). `Button`'s `size="sm"` gives 37, and a three-pixel difference
 * INSIDE the same group shows — which is exactly what a group promises won't happen. It's
 * a `style`, not a class, because `Button`'s padding is inline and an inline always beats
 * the sheet (lote 48). */
const toolBtn = { padding: '8px 13px' } as const;

/** A work bank: the small-caps label and, below, its controls. Renders `null` if it has
 * none left — in the Client·GC view and an archived project whole groups switch off, and
 * a label over an empty gap is worse than no label. */
function Toolgroup({ label, onCanvas, inline, children }: { label: string; onCanvas?: boolean; inline?: boolean; children: ReactNode }) {
  const kids = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(kids) && kids.length === 0) return null;
  return (
    <div className={`toolgroup${onCanvas ? ' toolgroup--on-canvas' : ''}${inline ? ' toolgroup--inline' : ''}`}>
      <span className="toolgroup__label">{label}</span>
      <div className="toolgroup__row">{kids}</div>
    </div>
  );
}

/** Sits on the purple band — the selected side goes solid white with navy text (plus a
 * check mark) so there's never a doubt which view is active. */
function ViewToggle({ value, onChange }: { value: ExportMode; onChange: (v: ExportMode) => void }) {
  const opt = (v: ExportMode, label: string) => {
    const on = value === v;
    return (
      <button
        type="button"
        onClick={() => onChange(v)}
        aria-pressed={on}
        title={on ? `Already showing the ${label} view` : `Switch to the ${label} view`}
        // The inactive half declares no background: `.seg-btn` owns it, which is what
        // lets it wash white on hover instead of reading as a plain label.
        className="seg-btn"
        style={{
          flex: 1, border: 'none', borderRadius: 6, cursor: 'pointer', padding: '5px 10px',
          font: 'var(--text-caption)', fontWeight: on ? 700 : 500, whiteSpace: 'nowrap',
          ...(on ? { background: '#ffffff' } : {}),
          color: on ? 'var(--brand-navy)' : 'rgba(255,255,255,0.85)',
          boxShadow: on ? 'var(--shadow-card)' : 'none',
          transition: 'background 120ms ease, color 120ms ease',
        }}
      >
        {on ? '✓ ' : ''}{label}
      </button>
    );
  };
  return (
    <div style={{ display: 'flex', padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.4)', width: 208, height: 34, boxSizing: 'border-box' }}>
      {opt('internal', 'Internal')}
      {opt('client', 'Client · GC')}
    </div>
  );
}

export function MaterialListToolbar({
  project, projects, packages, itemsOf, itemCount, matchCount, client, readOnly, dirtyCount,
  viewMode, onViewMode, search, onSearch, statusCounts, filter, onToggleFilter, onClearFilter,
  lateCount, lateOnly, onToggleLate,
  allCollapsed, onCollapseAll, hiddenCols, onToggleCol, onResetCols,
  onSelectProject, onCloseProject, onDeleteProject, onAddWorkPackage, onImportMaterials,
  onQuickAdd, onExportPdf, onSaveAll, onGlobalOnsite, onFieldMeasure, onFieldMeasureClear, onStage,
}: {
  project: Project;
  /** Active (non-archived) projects, for the switcher. */
  projects: Project[];
  packages: WorkPackage[];
  itemsOf: (wpId: string) => MaterialItem[];
  /** Items across the whole project — the "applies to N items" note and the filter summary. */
  itemCount: number;
  /** How many of them survive the current search + filters — the summary line. */
  matchCount: number;
  client: boolean;
  readOnly: boolean;
  dirtyCount: number;
  viewMode: ExportMode;
  onViewMode: (v: ExportMode) => void;
  search: string;
  onSearch: (v: string) => void;
  statusCounts: Record<ItemStatus, number>;
  filter: ItemStatus[];
  onToggleFilter: (s: ItemStatus) => void;
  onClearFilter: () => void;
  /** ⏰ Late — its own axis alongside the status badges (SPEC-delivery-watch §5.1). */
  lateCount: number;
  lateOnly: boolean;
  onToggleLate: () => void;
  allCollapsed: boolean;
  onCollapseAll: () => void;
  hiddenCols: Record<string, boolean>;
  onToggleCol: (key: string) => void;
  onResetCols: () => void;
  onSelectProject: (id: string) => void;
  onCloseProject: () => void;
  onDeleteProject: () => void;
  onAddWorkPackage: () => void;
  onImportMaterials: () => void;
  onQuickAdd: () => void;
  onExportPdf: () => void;
  onSaveAll: () => void;
  onGlobalOnsite: (iso: string) => void;
  onFieldMeasure: (ids: string[], iso: string) => void;
  onFieldMeasureClear: (ids: string[]) => void;
  onStage: (stage: ItemStage, date: string, ids?: string[]) => void;
}) {
  const editable = !client && !readOnly;
  const q = search.trim();
  const filtering = filter.length > 0 || lateOnly || q !== '';

  return (
    // Two siblings, not one wrapper: only the bottom strip is sticky, and a `sticky`
    // enclosed by a parent of its own height never detaches (see `.sticky-toolbar`).
    <>
      <div className="actionband no-print">
        {/* ---------------------------------------------- project identity */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ font: '700 30px/1.15 var(--font-display)', color: '#ffffff', letterSpacing: 0.2 }}>{project.name}</div>
              {editable && <RenameProjectControl project={project} />}
            </div>
            <div style={{ font: '500 15px/1.45 var(--font-text)', color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
              Material List / Procurement Log · GC/Client: <strong style={{ color: 'var(--brand-teal)' }}>{project.gc}</strong> · <span style={{ color: 'rgba(255,255,255,0.7)' }}>{fmtLong(today())}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <ProjectSwitcher projects={projects} project={project} onSelect={onSelectProject} />
            {editable && (
              <Button variant="ghost" size="sm" onClick={onCloseProject} title="Archive this project — it becomes read-only and leaves the main list. Reversible." style={{ ...toolBtn, color: 'rgba(255,255,255,0.85)' }}>📁 Close Project</Button>
            )}
            {editable && (
              // Outline red at rest, solid red on hover: it's the screen's most
              // destructive action and its least frequent, and at full fill it was also
              // the loudest. The red gets spent at the moment it's used.
              <Button
                variant="danger"
                size="sm"
                className="btn--on-dark"
                style={toolBtn}
                onClick={onDeleteProject}
                title="Permanently delete this project and all its data — cannot be undone"
              >
                🗑️ Delete Project
              </Button>
            )}
          </div>
        </div>

        {editable && <div className="actionband__rule" />}

        {/* ------------------------------------------------- work banks */}
        {editable && (
          <div className="toolrow">
            <Toolgroup label="Capture">
              <Button variant="secondary" size="sm" style={toolBtn} onClick={onAddWorkPackage}>＋ Add Work Package</Button>
              <Button
                variant="secondary"
                size="sm"
                style={toolBtn}
                onClick={onImportMaterials}
                title="Upload a materials list (.csv, .xlsx or .xls). Items are organized automatically by Work Package, section title or Cost Code."
              >
                📂 Import Materials
              </Button>
              <Button variant="secondary" size="sm" style={toolBtn} onClick={onQuickAdd} title="Paste an Item · QTY · Vendor list straight from Excel">⚡ Quick Add</Button>
            </Toolgroup>

            <Toolgroup label="Set across the project">
              <ThresholdsPopover projectId={project.id} />
              <BulkSetPopover
                mode="toolbar"
                label="Set On-Site date"
                title="Set a global On-Site Req. Date"
                note={`Sets the same date on all ${itemCount} item${itemCount === 1 ? '' : 's'} across ${packages.length} package${packages.length === 1 ? '' : 's'} in this project.`}
                confirmLabel="Apply to all"
                onApply={onGlobalOnsite}
              />
              <FieldMeasurePopover
                packages={packages}
                itemsOf={itemsOf}
                onApply={onFieldMeasure}
                onClear={onFieldMeasureClear}
                onNewPackage={onAddWorkPackage}
              />
              <StagePopover
                mode="toolbar"
                packages={packages}
                itemsOf={itemsOf}
                onApply={onStage}
              />
            </Toolgroup>

            {/* The two right-hand groups travel together inside their own row: when the
                width runs out they have to fall to the next line AS A BLOCK and stay
                pinned to the right margin. Loose, the one left over — Publish — used to
                fall alone and land on the left, under Capture. */}
            <div className="toolrow" style={{ marginLeft: 'auto' }}>
              <Toolgroup label="View & export">
                <ViewToggle value={viewMode} onChange={onViewMode} />
                <Button variant="secondary" size="sm" style={toolBtn} onClick={onExportPdf} title="Export as PDF">📥 PDF</Button>
              </Toolgroup>

              <Toolgroup label="Publish">
                {dirtyCount > 0 && (
                  <span className="draft-pill" title={`${dirtyCount} work package${dirtyCount === 1 ? '' : 's'} carry auto-saved edits that Submittals and Overview can't see yet`}>
                    <span className="draft-pill__dot" />
                    {dirtyCount} unpublished
                  </span>
                )}
                {/* The near-black of `primary` over purple was dark-on-dark: the screen's
                    most important button was its least visible. The brand teal — the same
                    one that already writes the GC two lines above — is what contrasts
                    hardest against this band. It only lights up when there's something to
                    publish; with no pending changes it recedes to ghost. */}
                <Button
                  variant={dirtyCount ? 'secondary' : 'ghost'}
                  size="sm"
                  title="Ctrl+S"
                  onClick={onSaveAll}
                  style={dirtyCount
                    ? { ...toolBtn, background: 'var(--brand-teal)', color: 'var(--brand-dark)', borderColor: 'transparent', fontWeight: 700 }
                    : { ...toolBtn, color: 'rgba(255,255,255,0.85)' }}
                >
                  💾 Save ALL to report
                </Button>
              </Toolgroup>
            </div>
          </div>
        )}
        {/* An archived project or the Client·GC view have no work banks, but Save ALL is
            still theirs while writing is still possible. */}
        {!editable && !readOnly && (
          <>
            <div className="actionband__rule" />
            <div className="toolrow">
              <span style={{ flex: 1, minWidth: 0 }} />
              <Toolgroup label="View & export">
                <ViewToggle value={viewMode} onChange={onViewMode} />
                <Button variant="secondary" size="sm" style={toolBtn} onClick={onExportPdf} title="Export as PDF">📥 PDF</Button>
              </Toolgroup>
              <Toolgroup label="Publish">
                <Button
                  variant={dirtyCount ? 'secondary' : 'ghost'}
                  size="sm"
                  title="Ctrl+S"
                  onClick={onSaveAll}
                  style={dirtyCount
                    ? { ...toolBtn, background: 'var(--brand-teal)', color: 'var(--brand-dark)', borderColor: 'transparent', fontWeight: 700 }
                    : { ...toolBtn, color: 'rgba(255,255,255,0.85)' }}
                >
                  💾 Save ALL to report
                </Button>
              </Toolgroup>
            </div>
          </>
        )}
        {readOnly && (
          <>
            <div className="actionband__rule" />
            <div className="toolrow">
              <span style={{ flex: 1, minWidth: 0 }} />
              <Toolgroup label="View & export">
                <ViewToggle value={viewMode} onChange={onViewMode} />
                <Button variant="secondary" size="sm" style={toolBtn} onClick={onExportPdf} title="Export as PDF">📥 PDF</Button>
              </Toolgroup>
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------- search strip */}
      <div className="sticky-toolbar no-print">
        <div className="findbar">
          <div className="findbar__row">
            {!client && (
              <div className="toolgroup toolgroup--on-canvas toolgroup--inline">
                <span className="toolgroup__label">Search</span>
                <div className="toolgroup__row">
                  <input
                    className="search-input"
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') onSearch(''); }}
                    placeholder="🔎 Description, vendor, PO#, notes…"
                    title="Filters every package by description, vendor, PO# or notes (Esc clears)"
                  />
                </div>
              </div>
            )}
            <span style={{ flex: 1, minWidth: 0 }} />
            <Toolgroup label="List view" onCanvas inline>
              <Button variant="secondary" size="sm" style={toolBtn} onClick={onCollapseAll}>
                {allCollapsed ? '⊞ Expand All' : '⊟ Collapse All'}
              </Button>
              {editable && (
                <ManageColumnsMenu
                  hidden={hiddenCols}
                  onToggle={onToggleCol}
                  onReset={onResetCols}
                />
              )}
            </Toolgroup>
          </div>
          {!client && (
            <div className="findbar__row findbar__row--sub">
              <StatusFilterBar
                counts={statusCounts} filter={filter} onToggle={onToggleFilter} onClear={onClearFilter}
                lateCount={lateCount} lateOnly={lateOnly} onToggleLate={onToggleLate}
              />
            </div>
          )}
          {filtering && (
            <div className="findbar__summary">
              <span>
                Showing <strong style={{ color: 'var(--ink)', font: 'var(--text-mono)', fontWeight: 700 }}>{matchCount}</strong> of {itemCount} items
              </span>
              {filter.length > 0 && <span>with status</span>}
              {filter.map((s) => <StatusBadge key={s} status={s} />)}
              {lateOnly && <strong style={{ color: 'var(--alert-ink)' }}>⏰ past their promised ship date</strong>}
              {q !== '' && <span>matching <strong style={{ color: 'var(--ink)' }}>"{q}"</strong></span>}
              <span>· work packages with no matching rows are hidden.</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
