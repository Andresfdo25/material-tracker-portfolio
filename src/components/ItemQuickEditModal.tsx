// ItemQuickEditModal.tsx — filling in the data the board is counting, without a trip to
// the Material List (ported from the private build's lote 64). It opens from a Portfolio
// count (needs-data, order-now, …) or from a Buy-By count, because both are the same
// question with a different trigger: what does this item still need before the status
// light can say anything?
//
// The four fields are exactly the ones that move the status: Lead and On-Site Req. are
// what a needs-data item is missing (`computeItem` can't derive a buy-by without them),
// and PO# + PO Date are what takes it off the buy list. Nothing else — this is not a row
// editor, it's the minimum that lets the board stop asking.
//
// Three rules that matter if this gets touched again:
//   · Values come off the LIVE DRAFT, not the report. They are what the fields are about
//     to patch; showing the published copy would let a Save silently overwrite an edit
//     that was never published.
//   · One Save for the whole window — confirming row by row in a window built to fill in
//     ten items in a row is the trip to the Material List again, with more clicks.
//   · The publish notice sits next to the button, not in a `window.confirm` on top of it:
//     the button says how many items and what it publishes, and that IS the confirmation.
import { useMemo, useState, type CSSProperties } from 'react';
import { addDays, fmtMDY, parseISO, toISO, today } from '../store/logic';
import type { MaterialItem } from '../store/types';
import { Button } from './ds/Button';
import { Modal } from './ds/Modal';
import { StatusBadge } from './ds/StatusBadge';
import { card, td, th } from './ds/overviewTable';

const field: CSSProperties = {
  height: 32, boxSizing: 'border-box', padding: '0 7px', borderRadius: 'var(--radius-sm)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--hairline)',
  font: 'var(--text-mono)', color: 'var(--ink)', background: 'var(--canvas)',
};

/** One row of the quick-edit window — the four fields the board counted this item under,
 * read off the live draft (not the report snapshot it was counted against). */
export interface QuickEditRow {
  key: string; itemId: string; wpId: string; wpLabel: string;
  description: string; qty: number | string; um: string;
  status: import('../store/types').ItemStatus;
  lead: number | string; onsite: string; po: string; poDate: string;
}

/** The four editable fields. Only what was touched travels in a patch. */
export type QuickEditPatch = Pick<MaterialItem, 'lead' | 'onsite' | 'po' | 'poDate'>;

/** The buy-by that would come off what is written right NOW in the row — the reason the
 * window is worth having: the PM types 6 weeks and sees, on the spot, the day it has to be
 * bought. Repeats `computeItem`'s formula instead of calling it, because there is no full
 * `ReportSnapshot` here, just four half-written fields. */
function previewBuyBy(lead: number | string, onsite: string): string {
  if (!onsite) return '';
  const n = Number(lead);
  if (lead === '' || lead == null || isNaN(n)) return '';
  return toISO(addDays(parseISO(onsite), -(n * 7)));
}

export function ItemQuickEditModal({ title, caption, rows, onClose, onJumpItem, onSave }: {
  title: string;
  caption: string;
  rows: QuickEditRow[];
  onClose: () => void;
  onJumpItem: (itemId: string) => void;
  onSave: (changes: { itemId: string; wpId: string; patch: Partial<QuickEditPatch> }[]) => void;
}) {
  const [edits, setEdits] = useState<Record<string, Partial<QuickEditPatch>>>({});
  const set = (itemId: string, patch: Partial<QuickEditPatch>) =>
    setEdits((e) => ({ ...e, [itemId]: { ...e[itemId], ...patch } }));
  const valueOf = <K extends keyof QuickEditPatch>(r: QuickEditRow, k: K): QuickEditPatch[K] =>
    (edits[r.itemId]?.[k] ?? r[k]) as QuickEditPatch[K];

  const changes = useMemo(() => rows
    .map((r) => {
      const e = edits[r.itemId];
      if (!e) return null;
      const patch: Partial<QuickEditPatch> = {};
      (Object.keys(e) as (keyof QuickEditPatch)[]).forEach((k) => {
        if (String(e[k] ?? '') !== String(r[k] ?? '')) (patch as Record<string, unknown>)[k] = e[k];
      });
      return Object.keys(patch).length ? { itemId: r.itemId, wpId: r.wpId, patch } : null;
    })
    .filter((c): c is { itemId: string; wpId: string; patch: Partial<QuickEditPatch> } => c !== null), [rows, edits]);
  const pkgCount = new Set(changes.map((c) => c.wpId)).size;

  return (
    <Modal title={title} onClose={onClose} width={1000}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginBottom: 10 }}>
        {caption} Fill in what you know and hit save — no trip to the Material List. Click a row's <strong>›</strong> to
        open it there instead.
      </div>
      <div style={{ ...card, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-soft)' }}>
              <th style={{ ...th, textAlign: 'left' }}>Item</th>
              <th style={{ ...th, textAlign: 'left' }}>Work package</th>
              <th style={{ ...th, textAlign: 'right' }}>Qty</th>
              <th style={{ ...th, textAlign: 'left' }} title="Lead time in weeks — how long the vendor takes from PO to delivery">Lead (wks)</th>
              <th style={{ ...th, textAlign: 'left' }}>On-Site Req.</th>
              <th style={{ ...th, textAlign: 'left' }} title="On-Site Req. minus the lead time — the day the PO has to go out">Buy-By</th>
              <th style={{ ...th, textAlign: 'left' }}>PO #</th>
              <th style={{ ...th, textAlign: 'left' }}>PO Date</th>
              <th style={{ ...th, textAlign: 'left' }}>Status</th>
              <th style={{ ...th, width: 26 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const lead = valueOf(r, 'lead');
              const onsite = valueOf(r, 'onsite');
              const buyby = previewBuyBy(lead, onsite);
              const touched = changes.some((c) => c.itemId === r.itemId);
              return (
                <tr key={r.key} style={{ background: touched ? 'var(--surface-soft)' : undefined }}>
                  <td style={{ ...td, textAlign: 'left', minWidth: 180 }} title={r.description}>
                    {r.description || <span style={{ color: 'var(--muted)' }}>Untitled</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'left', color: 'var(--muted)', font: 'var(--text-caption)', whiteSpace: 'nowrap' }}>{r.wpLabel}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {r.qty === '' || r.qty == null ? '—' : `${r.qty}${r.um ? ` ${r.um}` : ''}`}
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={lead === '' || lead == null ? '' : String(lead)}
                      onChange={(e) => set(r.itemId, { lead: e.target.value === '' ? '' : Number(e.target.value) })}
                      style={{ ...field, width: 64, textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <input type="date" value={onsite} onChange={(e) => set(r.itemId, { onsite: e.target.value })} style={{ ...field, width: 140 }} />
                  </td>
                  <td style={{ ...td, textAlign: 'left', font: 'var(--text-mono)', fontWeight: 600, whiteSpace: 'nowrap', color: buyby && buyby <= today() ? 'var(--alert-ink)' : 'var(--muted)' }}>
                    {buyby ? fmtMDY(buyby) : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <input
                      type="text"
                      value={String(valueOf(r, 'po') ?? '')}
                      placeholder="PO #"
                      onChange={(e) => set(r.itemId, { po: e.target.value })}
                      style={{ ...field, width: 108 }}
                    />
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <input type="date" value={valueOf(r, 'poDate')} onChange={(e) => set(r.itemId, { poDate: e.target.value })} style={{ ...field, width: 140 }} />
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}><StatusBadge status={r.status} /></td>
                  <td style={{ ...td, textAlign: 'center', padding: '6px 4px' }}>
                    <button
                      type="button"
                      title="Open this item in the Material List"
                      aria-label={`Open ${r.description || 'item'} in the Material List`}
                      onClick={() => { onClose(); onJumpItem(r.itemId); }}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)', font: 'var(--text-body)', padding: '2px 4px' }}
                    >
                      ›
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>Nothing to fill in here.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', flex: 1, minWidth: 240 }}>
          {changes.length === 0
            ? 'Nothing changed yet.'
            : `Saving publishes ${pkgCount} work package${pkgCount === 1 ? '' : 's'} to the report — any other pending edits in ${pkgCount === 1 ? 'it' : 'them'} go too. Undo is available right after.`}
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={changes.length === 0} onClick={() => onSave(changes)}>
          Save &amp; publish{changes.length ? ` · ${changes.length} item${changes.length === 1 ? '' : 's'}` : ''}
        </Button>
      </div>
    </Modal>
  );
}
