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
// **The trigger picks which of those fields show, via `variant`.** From Buy-By the window
// opens in `'po'`: Work package · Item · Qty · PO # · PO Date · Status — a Buy-By item
// already has Lead and On-Site loaded by definition (without them `computeItem` couldn't
// derive a buy-by, and the item would be in Needs data instead), so those two columns plus
// the derived Buy-By one only repeated what the table behind it already says. The Portfolio
// counts keep opening `'full'`, which is where Lead and On-Site are exactly what's missing.
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

/** The Fill all row: same `<thead>` as the labels (travels with them, doesn't mix with the
 * data) but with the weight of an input row, not a header. */
const bulkTh: CSSProperties = { ...th, textAlign: 'left', fontWeight: 400, whiteSpace: 'nowrap' };

/** The two free-text columns (work package and item) get a CEILING and a FLOOR and wrap to
 * two lines. A `nowrap` here was what broke the window: a package label like *"10.21_ Toilet
 * Compartments Powder Coated, Floor Mounted, Headrail Braced"* stretched its column until it
 * pushed the two inputs — the only actionable thing in the window — out of the horizontal
 * scroll, and the window exists to write those. Both texts are naturally long (the package
 * one repeats identically across every row of the same package), so they clip to a legible
 * width with the full text in the `title`. The inner `div` is necessary: a `maxWidth` on a
 * `<td>` is only a suggestion under `table-layout: auto`. The floor matters as much as the
 * ceiling — `overflowWrap: anywhere` lets the column shrink to illegible once every other
 * column has a fixed width. */
const clampText = (max: number, min: number): CSSProperties => ({
  maxWidth: max, minWidth: min, whiteSpace: 'normal', overflowWrap: 'anywhere',
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
} as CSSProperties);

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

/** `'full'` — all four fields (the Needs data / rest-of-Portfolio path).
 *  `'po'`  — PO and its date only (the Buy-By path). See the file comment above. */
export type QuickEditVariant = 'full' | 'po';

export function ItemQuickEditModal({ title, caption, rows, variant = 'full', onClose, onJumpItem, onSave }: {
  title: string;
  caption: string;
  rows: QuickEditRow[];
  variant?: QuickEditVariant;
  onClose: () => void;
  onJumpItem: (itemId: string) => void;
  onSave: (changes: { itemId: string; wpId: string; patch: Partial<QuickEditPatch> }[]) => void;
}) {
  const full = variant === 'full';
  const [edits, setEdits] = useState<Record<string, Partial<QuickEditPatch>>>({});
  const set = (itemId: string, patch: Partial<QuickEditPatch>) =>
    setEdits((e) => ({ ...e, [itemId]: { ...e[itemId], ...patch } }));
  const valueOf = <K extends keyof QuickEditPatch>(r: QuickEditRow, k: K): QuickEditPatch[K] =>
    (edits[r.itemId]?.[k] ?? r[k]) as QuickEditPatch[K];

  // ---- Fill all ----
  // A PO almost always covers the WHOLE package: the window opens with a dozen items that
  // are going to carry the same PO # and date, and typing them one by one was the work the
  // window came to save. The bulk row writes into `edits` of every row — not a separate
  // state — so what gets filled in bulk can be corrected afterward row by row, and the rest
  // of the window (the touched highlight, the Save button's count, discarding what stayed
  // the same) keeps working without knowing it exists.
  const [bulk, setBulk] = useState<Partial<QuickEditPatch>>({});
  const fillAll = <K extends keyof QuickEditPatch>(k: K, v: QuickEditPatch[K]) => {
    setBulk((b) => ({ ...b, [k]: v }));
    setEdits((e) => {
      const next = { ...e };
      rows.forEach((r) => { next[r.itemId] = { ...next[r.itemId], [k]: v }; });
      return next;
    });
  };
  /** Undoes the whole window, not just the bulk row: it's the way out of a wrong bulk fill,
   * which is exactly the risk bulk introduces. */
  const resetAll = () => { setBulk({}); setEdits({}); };

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
  // With the Fill all row underneath, the heavy rule moves to belong to IT: two heavy rules
  // in a row read as two tables.
  const hTh: CSSProperties = rows.length ? { ...th, borderBottom: '1px solid var(--hairline)' } : th;

  return (
    // `'full'` needs nine columns: at 1000px there isn't enough left over for both text
    // columns to stay legible AND the inputs to fit without a horizontal scroll. `'po'` is
    // seven.
    <Modal title={title} onClose={onClose} width={full ? 1160 : 1000}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginBottom: 10 }}>
        {caption} Fill in what you know and hit save — no trip to the Material List. The{' '}
        <strong>⤓ Fill all</strong> row writes down every row at once; correct the exceptions below it.
        Click a row's <strong>›</strong> to open it there instead.
      </div>
      <div style={{ ...card, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-soft)' }}>
              {/* The order comes from the variant: in `'po'` the package leads, which is how
                  the PM groups the orders they're about to place. */}
              {!full && <th style={{ ...hTh, textAlign: 'left' }}>Work package</th>}
              <th style={{ ...hTh, textAlign: 'left' }}>Item</th>
              {full && <th style={{ ...hTh, textAlign: 'left' }}>Work package</th>}
              <th style={{ ...hTh, textAlign: 'right' }}>Qty</th>
              {full && <th style={{ ...hTh, textAlign: 'left' }} title="Lead time in weeks — how long the vendor takes from PO to delivery">Lead (wks)</th>}
              {full && <th style={{ ...hTh, textAlign: 'left' }}>On-Site Req.</th>}
              {full && <th style={{ ...hTh, textAlign: 'left' }} title="On-Site Req. minus the lead time — the day the PO has to go out">Buy-By</th>}
              <th style={{ ...hTh, textAlign: 'left' }}>PO #</th>
              <th style={{ ...hTh, textAlign: 'left' }}>PO Date</th>
              <th style={{ ...hTh, textAlign: 'left' }}>Status</th>
              <th style={{ ...hTh, width: 26 }} />
            </tr>
            {/* Fill all — same columns, one row up: what's written here lands on every row
                below, which is where the exception gets corrected. */}
            {rows.length > 0 && (
              <tr style={{ background: 'var(--surface-soft)' }}>
                <th style={{ ...bulkTh, color: 'var(--muted)', font: 'var(--text-caption)', fontWeight: 700 }} colSpan={3}>
                  ⤓ Fill all {rows.length} row{rows.length === 1 ? '' : 's'}
                </th>
                {full && (
                  <th style={bulkTh}>
                    <input
                      type="number" min={0} step={1} placeholder="wks"
                      value={bulk.lead == null || bulk.lead === '' ? '' : String(bulk.lead)}
                      onChange={(e) => fillAll('lead', e.target.value === '' ? '' : Number(e.target.value))}
                      style={{ ...field, width: 64, textAlign: 'right' }}
                    />
                  </th>
                )}
                {full && (
                  <th style={bulkTh}>
                    <input type="date" value={bulk.onsite ?? ''} onChange={(e) => fillAll('onsite', e.target.value)} style={{ ...field, width: 132 }} />
                  </th>
                )}
                {full && <th style={bulkTh} />}
                <th style={bulkTh}>
                  <input
                    type="text" placeholder="PO #" value={bulk.po ?? ''}
                    onChange={(e) => fillAll('po', e.target.value)}
                    style={{ ...field, width: 108 }}
                  />
                </th>
                <th style={bulkTh}>
                  <input type="date" value={bulk.poDate ?? ''} onChange={(e) => fillAll('poDate', e.target.value)} style={{ ...field, width: 132 }} />
                </th>
                <th style={bulkTh} colSpan={2}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={changes.length === 0}
                    onClick={resetAll}
                    style={{ font: 'var(--text-caption)', padding: '3px 8px' }}
                  >
                    Reset
                  </button>
                </th>
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((r) => {
              const lead = valueOf(r, 'lead');
              const onsite = valueOf(r, 'onsite');
              const buyby = previewBuyBy(lead, onsite);
              const touched = changes.some((c) => c.itemId === r.itemId);
              const wpCell = (
                <td style={{ ...td, textAlign: 'left', color: 'var(--muted)', font: 'var(--text-caption)' }} title={r.wpLabel}>
                  <div style={clampText(full ? 150 : 190, full ? 108 : 150)}>{r.wpLabel}</div>
                </td>
              );
              return (
                <tr key={r.key} style={{ background: touched ? 'var(--surface-soft)' : undefined }}>
                  {!full && wpCell}
                  <td style={{ ...td, textAlign: 'left' }} title={r.description}>
                    <div style={clampText(full ? 195 : 220, full ? 158 : 180)}>
                      {r.description || <span style={{ color: 'var(--muted)' }}>Untitled</span>}
                    </div>
                  </td>
                  {full && wpCell}
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {r.qty === '' || r.qty == null ? '—' : `${r.qty}${r.um ? ` ${r.um}` : ''}`}
                  </td>
                  {full && (
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
                  )}
                  {full && (
                    <td style={{ ...td, textAlign: 'left' }}>
                      <input type="date" value={onsite} onChange={(e) => set(r.itemId, { onsite: e.target.value })} style={{ ...field, width: 132 }} />
                    </td>
                  )}
                  {full && (
                    <td style={{ ...td, textAlign: 'left', font: 'var(--text-mono)', fontWeight: 600, whiteSpace: 'nowrap', color: buyby && buyby <= today() ? 'var(--alert-ink)' : 'var(--muted)' }}>
                      {buyby ? fmtMDY(buyby) : '—'}
                    </td>
                  )}
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
                    <input type="date" value={valueOf(r, 'poDate')} onChange={(e) => set(r.itemId, { poDate: e.target.value })} style={{ ...field, width: 132 }} />
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
              <tr><td colSpan={full ? 10 : 7} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>Nothing to fill in here.</td></tr>
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
