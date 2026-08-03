// MaterialListToolbar.tsx — the sticky navy band at the top of the Material List and its
// three rows: title + project lifecycle, capture actions + view/export, search + filters +
// list tools. Extracted from MaterialListScreen (SPEC-hardening §4); the screen still owns
// every piece of state, this only renders it and calls back.
import type { ExportMode, ItemStage, ItemStatus, MaterialItem, Project, WorkPackage } from '../store/types';
import { fmtLong, today } from '../store/logic';
import { Button } from './ds/Button';
import { ProjectSwitcher } from './ProjectSwitcher';
import { RenameProjectControl } from './RenameProjectControl';
import { ThresholdsPopover } from './ThresholdsPopover';
import { BulkSetPopover } from './BulkSetPopover';
import { FieldMeasurePopover } from './FieldMeasurePopover';
import { StagePopover } from './StagePopover';
import { ManageColumnsMenu } from './ManageColumnsMenu';
import { StatusFilterBar } from './StatusFilterBar';

/** Sits on the navy band — the selected side goes solid white with navy text (plus a
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
          flex: 1, border: 'none', borderRadius: 6, cursor: 'pointer', padding: '6px 10px',
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
    <div style={{ display: 'flex', padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.4)', width: 236 }}>
      {opt('internal', 'Internal')}
      {opt('client', 'Client · GC')}
    </div>
  );
}

export function MaterialListToolbar({
  project, projects, packages, itemsOf, itemCount, client, readOnly, dirtyCount,
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
  /** Items across the whole project — only used for the "applies to N items" note. */
  itemCount: number;
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
  return (
    <div className="sticky-toolbar no-print">
      {/* Brand band — everything project-scoped lives here (mockup 07142026) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--band-bg)', borderRadius: 'var(--radius-md)', padding: '14px 18px 12px', boxShadow: 'var(--shadow-card)' }}>
        {/* Row 1 — title/subtitle (left) · project switcher + lifecycle (right) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ font: '700 40px/1.1 var(--font-display)', color: '#ffffff', letterSpacing: 0.2 }}>{project.name}</div>
              {!client && !readOnly && <RenameProjectControl project={project} />}
            </div>
            <div style={{ font: '500 15px/1.45 var(--font-text)', color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
              Material List / Procurement Log · GC/Client: <strong style={{ color: 'var(--brand-teal)' }}>{project.gc}</strong> · <span style={{ color: 'rgba(255,255,255,0.7)' }}>{fmtLong(today())}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <ProjectSwitcher projects={projects} project={project} onSelect={onSelectProject} />
            {!client && !readOnly && (
              <Button variant="ghost" size="sm" onClick={onCloseProject} style={{ color: 'rgba(255,255,255,0.85)' }}>📁 Close Project</Button>
            )}
            {!client && !readOnly && (
              <Button
                size="sm"
                onClick={onDeleteProject}
                title="Permanently delete this project and all its data — cannot be undone"
                style={{ background: '#d84343', color: '#ffffff', borderColor: 'transparent' }}
              >
                🗑️ Delete Project
              </Button>
            )}
          </div>
        </div>
        {/* Row 2 — capture actions (left) · view & export (right) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {!client && !readOnly && (
              <>
                <Button variant="secondary" size="sm" onClick={onAddWorkPackage}>＋ Add Work Package</Button>
                <Button variant="secondary" size="sm" onClick={onImportMaterials}>📂 Import Materials</Button>
                <span
                  title="Upload a materials list (.csv, .xlsx or .xls). Items are organized automatically by Work Package, section title or Cost Code."
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18,
                    borderRadius: '50%', border: '1px solid rgba(255,255,255,0.5)', color: 'rgba(255,255,255,0.85)',
                    fontSize: 11, fontWeight: 700, cursor: 'help', userSelect: 'none',
                  }}
                >
                  i
                </span>
                <Button variant="secondary" size="sm" onClick={onQuickAdd} title="Paste an Item · QTY · Vendor list straight from Excel">⚡ Quick Add</Button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!client && !readOnly && <ThresholdsPopover projectId={project.id} />}
            {!client && !readOnly && (
              <BulkSetPopover
                mode="toolbar"
                label="Set On-Site date"
                title="Set a global On-Site Req. Date"
                note={`Sets the same date on all ${itemCount} item${itemCount === 1 ? '' : 's'} across ${packages.length} package${packages.length === 1 ? '' : 's'} in this project.`}
                confirmLabel="Apply to all"
                onApply={onGlobalOnsite}
              />
            )}
            {!client && !readOnly && (
              <FieldMeasurePopover
                packages={packages}
                itemsOf={itemsOf}
                onApply={onFieldMeasure}
                onClear={onFieldMeasureClear}
                onNewPackage={onAddWorkPackage}
              />
            )}
            {!client && !readOnly && (
              <StagePopover
                mode="toolbar"
                packages={packages}
                itemsOf={itemsOf}
                onApply={onStage}
              />
            )}
            <ViewToggle value={viewMode} onChange={onViewMode} />
            <Button variant="secondary" size="sm" onClick={onExportPdf} title="Export as PDF">📥 PDF</Button>
          </div>
        </div>
        {/* Row 3 — search + status filters (left) · list tools (right) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {!client && (
              <input
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') onSearch(''); }}
                placeholder="🔎 Search items…"
                title="Filters every package by description, vendor, PO# or notes (Esc clears)"
                style={{
                  height: 32, width: 210, padding: '0 10px', borderRadius: 'var(--radius-pill)',
                  border: '1px solid rgba(255,255,255,0.35)', font: 'var(--text-caption)', color: 'var(--ink)',
                  background: 'var(--canvas)', outline: 'none',
                }}
              />
            )}
            {!client && (
              <StatusFilterBar
                counts={statusCounts} filter={filter} onToggle={onToggleFilter} onClear={onClearFilter}
                lateCount={lateCount} lateOnly={lateOnly} onToggleLate={onToggleLate}
              />
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={onCollapseAll} style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.85)' }}>
              {allCollapsed ? '⊞ Expand All' : '⊟ Collapse All'}
            </Button>
            {!readOnly && (
              <Button
                variant={dirtyCount ? 'primary' : 'secondary'}
                size="sm"
                title="Ctrl+S"
                onClick={onSaveAll}
                style={dirtyCount ? { borderColor: 'rgba(255,255,255,0.45)' } : undefined}
              >
                💾 Save ALL to report
              </Button>
            )}
            {!client && !readOnly && (
              <ManageColumnsMenu
                hidden={hiddenCols}
                onToggle={onToggleCol}
                onReset={onResetCols}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
