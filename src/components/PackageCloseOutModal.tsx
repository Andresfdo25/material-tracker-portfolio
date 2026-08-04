// PackageCloseOutModal.tsx — what a mosaic package bar opens (ported from the private
// build's lote 64). The bar already summarises "Installation status" for that package's
// items, so clicking it should open that summary's detail — not send the PM to the
// Material List to find the package and reopen it there.
//
// Same division of labour as the other board windows (see OverviewClockModals.tsx):
//   · Writes nothing. Receives `onMove` and the screen decides — which asks for the DATE
//     it happened before writing, same as every board move since lote 64.
//   · A button whose write would not land goes disabled with the reason — the verdict
//     comes resolved in `row.moves` (`stageMoves()` in logic.ts), never recalculated here.
//   · The row opens the item in the Material List; the action column is for the click.
//
// What this adds over the 🏭 gauge window is the START of the cycle: this package can
// have items that haven't arrived yet, so the first column of buttons is 🏭 received —
// the gauge window only lists material already in hand, a different question.
import { type CSSProperties } from 'react';
import { fmtMDY, STAGE_META } from '../store/logic';
import type { ItemStage } from '../store/types';
import { StageMoveButtons, type MoveTarget } from './StageMoveButtons';
import type { StageMoves, InstallUrgency } from '../store/logic';
import { Button } from './ds/Button';
import { Modal } from './ds/Modal';
import { card, td, th } from './ds/overviewTable';

/** One row of the package close-out window — every published item in that package,
 * whatever stage it sits at, so the whole cycle (🏭 received → 📍 on site → 🔩 installed)
 * can be worked from the bar that charts it. */
export interface PackageItemRow {
  key: string; itemId: string; description: string;
  qty: number | string; um: string;
  stage: ItemStage;
  /** The date belonging to the stage it sits at — received / on site / installed. */
  stageDate: string;
  onsite: string; urgency: InstallUrgency;
  /** Reached this package's finish line (🔩 installed, or 📍 on site if supply only). */
  closed: boolean;
  backorder: number | null;
  moves: StageMoves;
}

const tdL: CSSProperties = { ...td, textAlign: 'left', font: 'var(--text-body)' };
const thL: CSSProperties = { ...th, textAlign: 'left' };

export function PackageCloseOutModal({ projectName, wpLabel, supplyOnly, rows, onClose, onJumpItem, onJumpPackage, onMove }: {
  projectName: string;
  wpLabel: string;
  supplyOnly: boolean;
  rows: PackageItemRow[];
  onClose: () => void;
  onJumpItem: (itemId: string) => void;
  /** Everything this window cannot do — notes, quantities, a second partial — is one
   * click away, and the way out has to stay visible or the window is a dead end. */
  onJumpPackage: () => void;
  onMove: (row: PackageItemRow, target: MoveTarget) => void;
}) {
  const closed = rows.filter((r) => r.closed).length;
  const cols = 6;
  return (
    <Modal title={<span>{projectName} · {wpLabel}</span>} onClose={onClose} width={880}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginBottom: 10 }}>
        {rows.length} item{rows.length === 1 ? '' : 's'} · {closed} closed out ({supplyOnly ? '📍 on site' : '🔩 installed'}) · {rows.length - closed} to go.
        Every button asks for <strong>the date it happened</strong> and publishes this package to the report — Undo is
        available right after. Click a row to open the item.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={onJumpPackage} style={{ padding: '4px 8px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          Open in Material List ›
        </Button>
      </div>
      <div style={{ ...card, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-soft)' }}>
              <th style={thL}>Item</th>
              <th style={th}>Qty</th>
              <th style={thL}>Stage</th>
              <th style={thL}>On-Site Req.</th>
              <th style={{ ...thL, width: supplyOnly ? 168 : 232 }}>Move it along</th>
              <th style={{ ...th, width: 30 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const onsiteTone = r.closed ? null
                : r.urgency === 'overdue' ? { bg: 'var(--status-order-now)', ink: 'var(--status-order-now-ink)' }
                  : r.urgency === 'due-soon' ? { bg: 'var(--status-order-soon)', ink: 'var(--status-order-soon-ink)' }
                    : r.urgency === 'unscheduled' ? { bg: 'var(--status-needs-data)', ink: 'var(--status-needs-data-ink)' }
                      : null;
              return (
                <tr
                  key={r.key}
                  onClick={() => { onClose(); onJumpItem(r.itemId); }}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={tdL}>
                    {r.description || <span style={{ color: 'var(--muted)' }}>Untitled</span>}
                    {r.backorder != null && r.backorder > 0 && (
                      <span
                        title={`${r.backorder}${r.um ? ` ${r.um}` : ''} still owed by the vendor`}
                        style={{ marginLeft: 6, font: 'var(--text-caption)', fontWeight: 600, color: 'var(--warn-ink)', background: 'var(--status-partial)', borderRadius: 'var(--radius-sm)', padding: '1px 5px', whiteSpace: 'nowrap' }}
                      >
                        🚚 {r.backorder} owed
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.qty === '' || r.qty == null ? '—' : `${r.qty}${r.um ? ` ${r.um}` : ''}`}</td>
                  <td style={{ ...tdL, whiteSpace: 'nowrap', font: 'var(--text-caption)', fontWeight: 600, color: r.closed ? 'var(--mos-flag-done)' : 'var(--ink)' }}>
                    {STAGE_META[r.stage].icon} {STAGE_META[r.stage].label}
                    {r.stageDate && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {fmtMDY(r.stageDate)}</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'left', font: 'var(--text-mono)', fontWeight: 600, whiteSpace: 'nowrap', background: onsiteTone?.bg, color: onsiteTone?.ink ?? 'var(--ink)' }}>
                    {r.onsite ? `${!r.closed && r.urgency === 'overdue' ? '⚠ ' : ''}${fmtMDY(r.onsite)}` : <span style={{ color: 'var(--muted)', fontWeight: 400 }}>❔ no date</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'left', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    {r.closed ? (
                      <span style={{ font: 'var(--text-caption)', color: 'var(--mos-flag-done)', fontWeight: 700 }}>✓ closed out</span>
                    ) : (
                      <StageMoveButtons
                        moves={r.moves}
                        stage={r.stage}
                        supplyOnly={supplyOnly}
                        label={r.description}
                        onMove={(target) => onMove(r, target)}
                      />
                    )}
                  </td>
                  <td style={{ ...td, color: 'var(--muted)', textAlign: 'center', padding: '8px 6px' }}>›</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={cols} style={{ ...tdL, color: 'var(--muted)', textAlign: 'center' }}>Nothing published in this package yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
