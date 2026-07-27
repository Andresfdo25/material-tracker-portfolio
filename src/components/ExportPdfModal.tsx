// ExportPdfModal.tsx — asks, at export time, whether to append the optional submittal
// summary (items still pending approval, grouped by work package) to the PDF. Opened by
// the 📥 PDF button; on Export it hands the choice back and the caller fires window.print().
import { useState } from 'react';
import type { ExportMode } from '../store/types';
import { Modal } from './ds/Modal';
import { Button } from './ds/Button';

export function ExportPdfModal({ mode, pendingCount, onExport, onClose }: {
  mode: ExportMode;
  pendingCount: number;
  onExport: (includeSummary: boolean) => void;
  onClose: () => void;
}) {
  const has = pendingCount > 0;
  const [include, setInclude] = useState(has);

  return (
    <Modal title="Export PDF" onClose={onClose} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={{ font: 'var(--text-body)', color: 'var(--body)', margin: 0 }}>
          Exporting the <strong>{mode === 'client' ? 'Client · GC' : 'Internal'}</strong> view as a PDF.
        </p>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: has ? 'pointer' : 'default', opacity: has ? 1 : 0.65 }}>
          <input
            type="checkbox"
            checked={include}
            disabled={!has}
            onChange={(e) => setInclude(e.target.checked)}
            style={{ width: 20, height: 20, marginTop: 1, cursor: has ? 'pointer' : 'default', accentColor: 'var(--brand-slate)', flexShrink: 0 }}
          />
          <span>
            <span style={{ font: 'var(--text-body)', fontWeight: 600, color: 'var(--ink)' }}>Include submittal status summary</span>
            <span style={{ display: 'block', font: 'var(--text-caption)', color: 'var(--muted)', marginTop: 2 }}>
              {has
                ? `Adds a compact list of the ${pendingCount} item${pendingCount > 1 ? 's' : ''} still pending submittal approval, grouped by work package, at the end of the report.`
                : 'No items are currently pending submittal approval.'}
            </span>
          </span>
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onExport(include && has)}>📥 Export PDF</Button>
        </div>
      </div>
    </Modal>
  );
}
