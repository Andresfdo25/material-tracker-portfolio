// OverviewClockModals.tsx — the three gauge-triggered modals that moved the board from
// read-only to actionable (lote 63, ported from the private build's batch of the same
// name). Each modal answers a different question and closes a different kind of item:
//
//   · LateDeliveriesModal   — ⏰ promised, past that date, still not here. Used to occupy
//     half a band for a list that's almost always empty; it now opens from its own gauge.
//   · PartialDeliveryModal  — 🚚 CLOSES the backorder. Two paths, because the model has two
//     owners of the number (CLAUDE.md invariants): with a delivery log the balance is one
//     more log entry; without one, `receivedQty` is closed with `editItem` — a quantity,
//     not a stage — and only THEN does `stagePatch` (via `setItemStage`) get to write the
//     receipt, its only permitted writer.
//   · AwaitingCloseModal    — 🏭 CLOSES the item: the arrival line of its package (🔩
//     installed / 📍 on site) plus the intermediate 📍 release for install-scope rows still
//     in the warehouse. `closeVia` (logic.ts) decides against the item's live draft which
//     writer is allowed to close it; when none is, the button is disabled with the reason
//     in its `title`.
//
// Portfolio has no Alerts screen and no pinned items — this file only ports the pieces
// that map onto stagePatch / setItemStage / editItem, the writers portfolio actually has.
import { Fragment, useState, type CSSProperties } from 'react';
import { closeVia, daysWaiting, fmtMDY, itemStage, logDrivesStage, STAGE_META, totalQty } from '../store/logic';
import { usePersisted } from '../store/usePersisted';
import type { ItemStage } from '../store/types';
import { StageMoveButtons, type MoveTarget } from './StageMoveButtons';
import { Button } from './ds/Button';
import { Modal } from './ds/Modal';
import { card, td, tdL, th, thL } from './ds/overviewTable';
import { WaitCell } from '../screens/OverviewScreen';
import type { Enriched, LateRow } from '../screens/OverviewScreen';

/* --------------------------------------------------------------- ⏰ Late deliveries */

export function LateDeliveriesModal({ rows, onClose, onJumpItem, onReschedule, onMove }: {
  rows: LateRow[];
  onClose: () => void;
  onJumpItem: (projectId: string, itemId: string) => void;
  onReschedule: (row: LateRow, iso: string) => void;
  onMove: (row: LateRow, target: MoveTarget) => void;
}) {
  const [group, setGroup] = useState<'wp' | 'project'>('wp');
  // Collapsed by default and remembers the last view across reopens: a projectId absent
  // from the store falls back to `true`, so a project no one has touched yet starts closed.
  const [collapsedStore, setCollapsedStore] = usePersisted<Record<string, boolean>>('overview:lateCollapsed', {});
  const isCollapsed = (id: string) => collapsedStore[id] ?? true;
  const [editing, setEditing] = useState<{ id: string; date: string } | null>(null);
  const cols = group === 'wp' ? 5 : 4;

  const blocks = (() => {
    const m = new Map<string, LateRow[]>();
    rows.forEach((r) => { const a = m.get(r.projectId); if (a) a.push(r); else m.set(r.projectId, [r]); });
    return [...m.values()].map((rs) => ({
      projectId: rs[0].projectId, projectName: rs[0].projectName, worst: Math.max(...rs.map((r) => r.behind)),
      rows: group === 'wp' ? [...rs].sort((a, b) => a.wpLabel.localeCompare(b.wpLabel) || b.behind - a.behind) : rs,
    }));
  })();

  const iconBtn: CSSProperties = { padding: 0, width: 30, height: 28, minWidth: 30, fontSize: 14, lineHeight: 1 };
  const buyByCell: CSSProperties = { ...td, textAlign: 'left', font: 'var(--text-mono)', fontWeight: 600, color: 'var(--alert-ink)' };

  return (
    <Modal title={<span>⏰ {rows.length} late deliver{rows.length === 1 ? 'y' : 'ies'}</span>} onClose={onClose} width={800}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, font: 'var(--text-caption)', color: 'var(--muted)' }}>
        <span>Past its promised date · 🗓 sets a new promise; the stage buttons say where it actually ended up. Any of them publishes the package — no second save needed.</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontWeight: 600 }}>Group by:</span>
        {(['wp', 'project'] as const).map((m) => (
          <Button key={m} size="sm" variant={group === m ? 'primary' : 'secondary'} onClick={() => setGroup(m)} style={{ padding: '4px 10px' }}>
            {m === 'wp' ? 'Work package' : 'Project'}
          </Button>
        ))}
      </div>
      <div style={{ ...card, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-soft)' }}>
              {group === 'wp' && <th style={thL}>Work package</th>}
              <th style={thL}>Item</th><th style={thL}>Promised</th>
              <th style={th}>Days late</th><th style={{ ...thL, width: 236 }}>Resolve</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <Fragment key={b.projectId}>
                <tr onClick={() => setCollapsedStore((c) => ({ ...c, [b.projectId]: !isCollapsed(b.projectId) }))} style={{ cursor: 'pointer', background: 'var(--surface-soft)' }}>
                  <td colSpan={cols} style={{ ...tdL, font: 'var(--text-caption)', fontWeight: 700 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--muted)' }}>{isCollapsed(b.projectId) ? '▸' : '▾'}</span>
                      <span>{b.projectName}</span>
                      <span style={{ color: 'var(--alert-ink)', fontWeight: 600 }}>{b.rows.length} late · worst {b.worst}d</span>
                    </span>
                  </td>
                </tr>
                {!isCollapsed(b.projectId) && b.rows.map((r) => {
                  const isEditing = editing?.id === r.itemId ? editing : null;
                  return (
                    <tr key={r.key} onClick={() => { if (!isEditing) { onClose(); onJumpItem(r.projectId, r.itemId); } }} style={{ cursor: isEditing ? 'default' : 'pointer' }}>
                      {group === 'wp' && <td style={{ ...tdL, color: 'var(--muted)' }}>{r.wpLabel}</td>}
                      <td style={tdL}>{r.description}</td>
                      <td style={buyByCell}>
                        {isEditing ? (
                          <input
                            type="date" autoFocus value={isEditing.date}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEditing({ id: r.itemId, date: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') { onReschedule(r, isEditing.date); setEditing(null); } if (e.key === 'Escape') setEditing(null); }}
                            style={{ height: 32, padding: '0 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', font: 'var(--text-mono)', color: 'var(--ink)', background: 'var(--canvas)' }}
                          />
                        ) : fmtMDY(r.promised)}
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: 'var(--alert-ink)' }}>{r.behind}</td>
                      <td style={{ ...td, textAlign: 'left', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <span style={{ display: 'inline-flex', gap: 4 }}>
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="primary" style={iconBtn} title="Save" onClick={() => { onReschedule(r, isEditing.date); setEditing(null); }}>✓</Button>
                              <Button size="sm" variant="ghost" style={iconBtn} title="Cancel" onClick={() => setEditing(null)}>✕</Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="secondary" style={iconBtn} title="Reschedule" onClick={() => setEditing({ id: r.itemId, date: r.promised })}>🗓</Button>
                              {/* Same three-way stage group the mosaic offers — a truck that
                                  shows up weeks late often unloads straight at the jobsite. */}
                              <StageMoveButtons
                                moves={r.moves}
                                stage={r.stage}
                                supplyOnly={r.supplyOnly}
                                label={r.description}
                                onMove={(target) => onMove(r, target)}
                              />
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
            {rows.length === 0 && <tr><td colSpan={cols} style={{ ...tdL, color: 'var(--muted)', textAlign: 'center' }}>Nothing past its promised ship/delivery date.</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- 🚚 Partially delivered */

export function PartialDeliveryModal({ rows, onClose, onJumpItem, onCloseBackorder }: {
  rows: Enriched[];
  onClose: () => void;
  onJumpItem: (projectId: string, itemId: string) => void;
  /** Closes the backorder for this row — the two-path decision (log vs. quantity) lives
   * in the caller, which owns `actions`. */
  onCloseBackorder: (row: Enriched) => void;
}) {
  return (
    <Modal title={<span>🚚 {rows.length} partially delivered</span>} onClose={onClose} width={720}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginBottom: 10 }}>
        Part of the order is still on backorder. "Receive rest" closes it — through the delivery log if this item has one, otherwise by closing the received quantity. Click a row to open it in the Material List.
      </div>
      <div style={{ ...card, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-soft)' }}>
              <th style={thL}>Description</th><th style={thL}>Work package</th>
              <th style={th}>Ordered</th><th style={th}>Received</th><th style={th}>Backorder</th>
              <th style={{ ...th, width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const total = totalQty(x.r);
              const backorder = total != null ? Math.max(0, total - (x.r.receivedQty || 0)) : null;
              const followsLog = logDrivesStage(x.i.deliveries);
              return (
                <tr key={x.i.id} onClick={() => { onClose(); onJumpItem(x.projectId, x.i.id); }} style={{ cursor: 'pointer' }}>
                  <td style={tdL}>{x.r.description || <span style={{ color: 'var(--muted)' }}>Untitled</span>}</td>
                  <td style={{ ...tdL, color: 'var(--muted)' }}>{x.pkg.label}</td>
                  <td style={td}>{total ?? x.r.qty}</td>
                  <td style={td}>{x.r.receivedQty}</td>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--warn-ink)' }}>{backorder ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'left' }} onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm" variant="secondary" style={{ padding: '4px 10px' }}
                      title={followsLog ? 'Register the balance as one more delivery entry' : 'Close the backorder — the rest arrived'}
                      onClick={() => onCloseBackorder(x)}
                    >
                      Receive rest
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} style={{ ...tdL, color: 'var(--muted)', textAlign: 'center' }}>Nothing on backorder.</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- 🏭 Awaiting site / install */

export function AwaitingCloseModal({ rows, onClose, onJumpItem, onCloseItem }: {
  rows: Enriched[];
  onClose: () => void;
  onJumpItem: (projectId: string, itemId: string) => void;
  onCloseItem: (row: Enriched, stage: 'on-site' | 'installed') => void;
}) {
  return (
    <Modal title={<span>🏭 {rows.length} awaiting site / install</span>} onClose={onClose} width={760}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginBottom: 10 }}>
        Material paid for and in hand that has not reached its last stage. The button closes the next step — 📍 release to the jobsite, or 🔩 install. Click a row to open it in the Material List.
      </div>
      <div style={{ ...card, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-soft)' }}>
              <th style={thL}>Description</th><th style={thL}>Work package</th>
              <th style={thL}>Stage</th><th style={th}>Waiting</th>
              <th style={{ ...th, width: 130 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const stage = itemStage(x.r) as ItemStage;
              const action = closeVia(x.i, x.supplyOnly);
              return (
                <tr key={x.i.id} onClick={() => { onClose(); onJumpItem(x.projectId, x.i.id); }} style={{ cursor: 'pointer' }}>
                  <td style={tdL}>{x.r.description || <span style={{ color: 'var(--muted)' }}>Untitled</span>}</td>
                  <td style={{ ...tdL, color: 'var(--muted)' }}>{x.pkg.label}</td>
                  <td style={tdL}>{STAGE_META[stage].icon} {STAGE_META[stage].label}</td>
                  <WaitCell days={daysWaiting(x.r)} />
                  <td style={{ ...td, textAlign: 'left' }} onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm" variant="secondary" style={{ padding: '4px 10px' }} disabled={!action}
                      title={action
                        ? (action === 'on-site' ? 'Release to the jobsite' : 'Mark installed')
                        : logDrivesStage(x.i.deliveries)
                          ? 'This item follows its delivery log — close it from Breakdown Delivery in the Material List.'
                          : 'This item follows its install log — register the rest from Breakdown Install in the Material List.'}
                      onClick={() => action && onCloseItem(x, action)}
                    >
                      {action === 'on-site' ? '📍 On site' : action === 'installed' ? '🔩 Installed' : 'No action'}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5} style={{ ...tdL, color: 'var(--muted)', textAlign: 'center' }}>Nothing awaiting site or install.</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

