// ExportPdfModal.tsx — asks, at export time, (a) which work packages go into the PDF and
// (b) whether to append the optional submittal summary. Opened by the 📥 PDF button; on
// Export it hands both choices back and the caller fires window.print().
import { useState } from 'react';
import type { ExportMode } from '../store/types';
import { Modal } from './ds/Modal';
import { Button } from './ds/Button';

/** One selectable row: the package plus the numbers the dialog reports on. */
export interface ExportPkgOption {
  id: string;
  label: string;
  itemCount: number;
  pendingCount: number;
  deliveryCount: number;
}

/** What the dialog hands back: the two optional blocks plus the package subset. */
export interface ExportChoice {
  includeSummary: boolean;
  includeDeliveryLog: boolean;
  /** null when every package goes in (the default), otherwise the picked subset. */
  wpIds: string[] | null;
}

export function ExportPdfModal({ mode, packages, onExport, onClose }: {
  mode: ExportMode;
  packages: ExportPkgOption[];
  onExport: (choice: ExportChoice) => void;
  onClose: () => void;
}) {
  // Most reports go out whole; the subset is the exception (advanced phases, change orders).
  const [allPackages, setAllPackages] = useState(true);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [include, setInclude] = useState(true);
  // The delivery log used to print unconditionally, so its default is ON.
  const [includeLog, setIncludeLog] = useState(true);

  const selected = allPackages ? packages : packages.filter((p) => picked[p.id]);
  const selectedItems = selected.reduce((s, p) => s + p.itemCount, 0);
  // Both summaries only ever cover what's actually in the PDF, so their counts follow
  // the selection instead of the whole project.
  const pendingCount = selected.reduce((s, p) => s + p.pendingCount, 0);
  const deliveryCount = selected.reduce((s, p) => s + p.deliveryCount, 0);
  const has = pendingCount > 0;
  const hasLog = deliveryCount > 0;
  const canExport = selected.length > 0;

  const rowLabel: React.CSSProperties = { font: 'var(--text-body)', fontWeight: 600, color: 'var(--ink)' };
  const rowHint: React.CSSProperties = { display: 'block', font: 'var(--text-caption)', color: 'var(--muted)', marginTop: 2 };
  const box: React.CSSProperties = { width: 20, height: 20, marginTop: 1, cursor: 'pointer', accentColor: 'var(--brand-slate)', flexShrink: 0 };

  return (
    <Modal title="Export PDF" onClose={onClose} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={{ font: 'var(--text-body)', color: 'var(--body)', margin: 0 }}>
          Exporting the <strong>{mode === 'client' ? 'Client · GC' : 'Internal'}</strong> view as a PDF.
        </p>

        <div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allPackages}
              onChange={(e) => setAllPackages(e.target.checked)}
              style={box}
            />
            <span>
              <span style={rowLabel}>Include ALL Work Packages</span>
              <span style={rowHint}>Uncheck to report only some packages.</span>
            </span>
          </label>

          {!allPackages && (
            <div style={{ marginTop: 12, marginLeft: 30, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                {packages.length === 0 && (
                  <span style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>This project has no work packages with items.</span>
                )}
                {packages.map((p) => (
                  <label key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!picked[p.id]}
                      onChange={(e) => setPicked((s) => ({ ...s, [p.id]: e.target.checked }))}
                      style={{ ...box, marginTop: 0, width: 18, height: 18 }}
                    />
                    <span style={{ font: 'var(--text-body)', color: 'var(--ink)' }}>{p.label}</span>
                    <span style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
                      {p.itemCount} item{p.itemCount === 1 ? '' : 's'}
                    </span>
                  </label>
                ))}
              </div>
              <span style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
                {canExport
                  ? `${selected.length} of ${packages.length} packages · ${selectedItems} item${selectedItems === 1 ? '' : 's'} in the report.`
                  : 'Select at least one work package to export.'}
              </span>
            </div>
          )}
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: hasLog ? 'pointer' : 'default', opacity: hasLog ? 1 : 0.65 }}>
          <input
            type="checkbox"
            checked={includeLog && hasLog}
            disabled={!hasLog}
            onChange={(e) => setIncludeLog(e.target.checked)}
            style={{ ...box, cursor: hasLog ? 'pointer' : 'default' }}
          />
          <span>
            <span style={rowLabel}>Include Delivery Log</span>
            {/* The hint is gone by request; it survives ONLY while the box is greyed out,
              * where a disabled control with no reason next to it is just a dead end. */}
            {!hasLog && <span style={rowHint}>Nothing received yet in the selected packages.</span>}
          </span>
        </label>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: has ? 'pointer' : 'default', opacity: has ? 1 : 0.65 }}>
          <input
            type="checkbox"
            checked={include && has}
            disabled={!has}
            onChange={(e) => setInclude(e.target.checked)}
            style={{ ...box, cursor: has ? 'pointer' : 'default' }}
          />
          <span>
            <span style={rowLabel}>Include Submittal Status</span>
            {!has && <span style={rowHint}>No items pending submittal approval in the selected packages.</span>}
          </span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!canExport}
            onClick={() => onExport({
              includeSummary: include && has,
              includeDeliveryLog: includeLog && hasLog,
              wpIds: allPackages ? null : selected.map((p) => p.id),
            })}
          >
            📥 Export PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
}
