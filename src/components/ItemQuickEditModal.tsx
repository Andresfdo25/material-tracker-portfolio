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
// opens in `'po'`: Item · Qty · PO # · PO Date · Status and nothing else, under the package
// label heading each group. A Buy-By item already has Lead and On-Site loaded by definition
// (without them `computeItem` couldn't derive a buy-by, and the item would be in Needs data
// instead), so those two columns plus the derived Buy-By one only repeated what the table
// behind it already says. The Portfolio counts keep opening `'full'`, which is where Lead
// and On-Site are exactly what's missing.
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
import { addDays, fmtMDY, groupByPackage, parseISO, toISO, today } from '../store/logic';
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

/** The package label stopped being a COLUMN and became a group heading. With the window
 * opened from a mosaic badge the rows can be an entire project — a dozen packages in a flat
 * list — and the label repeated identically down the widest column of the table, the same
 * one already competing for room with the inputs. Grouping says it once and orders the
 * window the way orders actually go out: one PO per package. */
const groupTh: CSSProperties = {
  ...th, textAlign: 'left', fontWeight: 700, background: 'var(--surface-soft)',
};

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

  // ---- Fill all, PER PACKAGE ----
  // A PO almost always covers the WHOLE package: the window opens with a dozen items that
  // are going to carry the same PO # and date, and typing them one by one was the work the
  // window came to save. The bulk row writes into `edits` of the rows — not a separate
  // state — so what gets filled in bulk can be corrected afterward row by row, and the rest
  // of the window (the touched highlight, the Save button's count, discarding what stayed
  // the same) keeps working without knowing it exists.
  //
  // **The scope is the package, not the window**, now that the list can be an entire
  // project: a PO is issued per package, so a window-wide fill would write the same number
  // across orders that belong to different vendors — and the mistake would only show up
  // later, in the Material List. So `bulk` is indexed by `wpId` and the row lives INSIDE its
  // group, under its heading: the scope is read from position, not a caption. With a single
  // package open (the Buy-By path) the behaviour is exactly what it was before.
  const [bulk, setBulk] = useState<Record<string, Partial<QuickEditPatch>>>({});
  const fillGroup = <K extends keyof QuickEditPatch>(g: { wpId: string; rows: QuickEditRow[] }, k: K, v: QuickEditPatch[K]) => {
    setBulk((b) => ({ ...b, [g.wpId]: { ...b[g.wpId], [k]: v } }));
    setEdits((e) => {
      const next = { ...e };
      g.rows.forEach((r) => { next[r.itemId] = { ...next[r.itemId], [k]: v }; });
      return next;
    });
  };
  /** Undoes the whole window, not just one group's bulk row: it's the way out of a wrong
   * bulk fill, which is exactly the risk bulk introduces. Sits in the footer, next to
   * Cancel, not inside a group row: with several packages loaded, a Reset beside every
   * group's inputs is too easy to hit by mistake. */
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
  const groups = useMemo(() => groupByPackage(rows), [rows]);
  /** How many columns a row spans — the group heading and the empty row both need it. */
  const colCount = full ? 9 : 6;
  // With the first package's heading underneath, the heavy rule moves to belong to IT: two
  // heavy rules in a row read as two tables.
  const hTh: CSSProperties = rows.length ? { ...th, borderBottom: '1px solid var(--hairline)' } : th;

  return (
    // `'full'` needs nine columns: at 1000px there isn't enough left over for both text
    // columns to stay legible AND the inputs to fit without a horizontal scroll. `'po'` is
    // seven.
    <Modal title={title} onClose={onClose} width={full ? 1160 : 1000}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginBottom: 10 }}>
        {caption} Fill in what you know and hit save — no trip to the Material List. Each work
        package has its own <strong>⤓ Fill all</strong> row: it writes down that package at once —
        one PO, one package — and you correct the exceptions below it. Click a row's{' '}
        <strong>›</strong> to open it there instead.
      </div>
      <div style={{ ...card, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-soft)' }}>
              {/* No work-package column: each group's heading says it instead (`groupTh`). */}
              <th style={{ ...hTh, textAlign: 'left' }}>Item</th>
              <th style={{ ...hTh, textAlign: 'right' }}>Qty</th>
              {full && <th style={{ ...hTh, textAlign: 'left' }} title="Lead time in weeks — how long the vendor takes from PO to delivery">Lead (wks)</th>}
              {full && <th style={{ ...hTh, textAlign: 'left' }}>On-Site Req.</th>}
              {full && <th style={{ ...hTh, textAlign: 'left' }} title="On-Site Req. minus the lead time — the day the PO has to go out">Buy-By</th>}
              <th style={{ ...hTh, textAlign: 'left' }}>PO #</th>
              <th style={{ ...hTh, textAlign: 'left' }}>PO Date</th>
              <th style={{ ...hTh, textAlign: 'left' }}>Status</th>
              <th style={{ ...hTh, width: 26 }} />
            </tr>
          </thead>
          {/* One `<tbody>` per package: the label heads its group instead of repeating on
              every row, and its own ⤓ Fill all row sits right underneath. */}
          {groups.map((g, gi) => {
            const b = bulk[g.wpId] ?? {};
            return (
              <tbody key={g.wpId}>
                <tr>
                  <th
                    colSpan={colCount}
                    scope="colgroup"
                    title={g.wpLabel}
                    style={{ ...groupTh, borderTop: gi > 0 ? '1px solid var(--hairline)' : undefined }}
                  >
                    {g.wpLabel} · {g.rows.length} item{g.rows.length === 1 ? '' : 's'}
                  </th>
                </tr>
                {/* Fill all — same columns, one row up from the rows it touches: what's
                    written here lands on THIS package's rows, which is where the exception
                    gets corrected. */}
                <tr style={{ background: 'var(--surface-soft)' }}>
                  <td style={{ ...bulkTh, color: 'var(--muted)', font: 'var(--text-caption)', fontWeight: 700 }} colSpan={2}>
                    ⤓ Fill all {g.rows.length} row{g.rows.length === 1 ? '' : 's'} in this package
                  </td>
                  {full && (
                    <td style={bulkTh}>
                      <input
                        type="number" min={0} step={1} placeholder="wks"
                        value={b.lead == null || b.lead === '' ? '' : String(b.lead)}
                        onChange={(e) => fillGroup(g, 'lead', e.target.value === '' ? '' : Number(e.target.value))}
                        style={{ ...field, width: 64, textAlign: 'right' }}
                      />
                    </td>
                  )}
                  {full && (
                    <td style={bulkTh}>
                      <input type="date" value={b.onsite ?? ''} onChange={(e) => fillGroup(g, 'onsite', e.target.value)} style={{ ...field, width: 132 }} />
                    </td>
                  )}
                  {full && <td style={bulkTh} />}
                  <td style={bulkTh}>
                    <input
                      type="text" placeholder="PO #" value={b.po ?? ''}
                      onChange={(e) => fillGroup(g, 'po', e.target.value)}
                      style={{ ...field, width: 108 }}
                    />
                  </td>
                  <td style={bulkTh}>
                    <input type="date" value={b.poDate ?? ''} onChange={(e) => fillGroup(g, 'poDate', e.target.value)} style={{ ...field, width: 132 }} />
                  </td>
                  <td style={bulkTh} colSpan={2} />
                </tr>
                {g.rows.map((r) => {
                  const lead = valueOf(r, 'lead');
                  const onsite = valueOf(r, 'onsite');
                  const buyby = previewBuyBy(lead, onsite);
                  const touched = changes.some((c) => c.itemId === r.itemId);
                  return (
                    <tr key={r.key} style={{ background: touched ? 'var(--surface-soft)' : undefined }}>
                      <td style={{ ...td, textAlign: 'left' }} title={r.description}>
                        <div style={clampText(full ? 260 : 300, full ? 190 : 220)}>
                          {r.description || <span style={{ color: 'var(--muted)' }}>Untitled</span>}
                        </div>
                      </td>
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
              </tbody>
            );
          })}
          {rows.length === 0 && (
            <tbody>
              <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: 'var(--muted)' }}>Nothing to fill in here.</td></tr>
            </tbody>
          )}
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', flex: 1, minWidth: 240 }}>
          {changes.length === 0
            ? 'Nothing changed yet.'
            : `Saving publishes ${pkgCount} work package${pkgCount === 1 ? '' : 's'} to the report — any other pending edits in ${pkgCount === 1 ? 'it' : 'them'} go too. Undo is available right after.`}
        </div>
        <Button variant="secondary" size="sm" disabled={changes.length === 0} onClick={resetAll}>Reset all</Button>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={changes.length === 0} onClick={() => onSave(changes)}>
          Save &amp; publish{changes.length ? ` · ${changes.length} item${changes.length === 1 ? '' : 's'}` : ''}
        </Button>
      </div>
    </Modal>
  );
}
