// MaterialGrid.tsx — one editable table per work package: the colgroup that keeps every
// package aligned, the column-header bulk popovers, the row cells and the drag-to-reorder.
// Extracted from MaterialListScreen (SPEC-hardening §4) with no behavior change.
import { useRef, useState } from 'react';
import { useApp } from '../../store/useApp';
import {
  awaitingInstall, backorderQty, computeItem, daysLate, daysWaiting, deliveryWatch, fmtDays, fmtMDY, hasOpenBackorder,
  installUrgency, isFromStock, isOfci, isPartial, isPartiallyInstalled, itemStage, logDrivesStage, STAGE_META,
  submittalBlockers, SUBMITTALS, today, UNITS,
} from '../../store/logic';
import type { Cfg, MaterialItem, WorkPackage } from '../../store/types';
import { StatusBadge } from '../ds/StatusBadge';
import { VendorInput } from '../VendorInput';
import { BulkSetPopover } from '../BulkSetPopover';
import { StagePopover } from '../StagePopover';
import { SubmittalCoverModal } from '../SubmittalCoverModal';
import { BulkSubmittalsModal } from '../BreakdownSubmittalsModal';
import { BulkEditBar } from './BulkEditBar';
import { EditCell, Hdr, RoText } from './cells';
import { td, th, todayBtn } from './cellStyles';
import { hlToken } from './highlights';
import { RowMenu } from './RowMenu';

/* Column widths — every package table uses the same fixed <colgroup>, so columns stay
 * aligned across all work packages; the description column absorbs the leftover width. */
const COL_WIDTHS: Record<string, number> = {
  qty: 84, um: 58, vendor: 176, lead: 90, onsite: 140, buyby: 112, submittal: 136,
  po: 150, poDate: 152, shipDate: 192, notes: 168, received: 124,
};

const CHECK_COL_W = 42;
const STATUS_COL_W = 150;
const MENU_COL_W = 40;
const DESC_MIN_W = 240;
const INTERNAL_ONLY = new Set(['lead', 'buyby', 'submittal', 'po', 'poDate', 'received']);

export function MaterialGrid({ items, packages, cfg, client, readOnly, hidden, onBreakdown, onBreakdownSubmittals }: {
  items: MaterialItem[];
  packages: WorkPackage[];
  cfg: Cfg;
  client: boolean;
  readOnly: boolean;
  hidden: Record<string, boolean>;
  onBreakdown: (id: string) => void;
  onBreakdownSubmittals: (id: string) => void;
}) {
  const { actions } = useApp();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [showBulkSubs, setShowBulkSubs] = useState(false);
  const [showCover, setShowCover] = useState(false);
  // Drag-to-reorder within a package: the ⋮ cell is the handle, rows are drop targets.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropInfo, setDropInfo] = useState<{ id: string; place: 'before' | 'after' } | null>(null);
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const editable = !client && !readOnly;
  // Scope of the package this grid renders (one grid per package) — supply only means
  // the cycle ends on site, so the column drops "Installation" and 🔩 is never offered.
  const supplyOnly = !!cfg.supplyOnly;

  // Anchor row for Shift-click range selection (Excel-style: click one checkbox, then
  // Shift-click another to select every row in between). Reset whenever the table's
  // item set changes so a stale index can never address the wrong row.
  const anchorRef = useRef<number | null>(null);
  const toggleOne = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const onRowCheck = (rowIdx: number, id: string, shift: boolean) => {
    if (shift && anchorRef.current != null) {
      const lo = Math.min(anchorRef.current, rowIdx);
      const hi = Math.max(anchorRef.current, rowIdx);
      setSelected((s) => {
        const next = { ...s };
        for (let i = lo; i <= hi; i++) next[items[i].id] = true;
        return next;
      });
    } else {
      toggleOne(id);
      anchorRef.current = rowIdx;
    }
  };
  const toggleAll = () => {
    const allOn = items.length > 0 && items.every((it) => selected[it.id]);
    const next: Record<string, boolean> = {};
    if (!allOn) items.forEach((it) => { next[it.id] = true; });
    setSelected(next);
    anchorRef.current = null;
  };

  const set = (id: string, patch: Partial<MaterialItem>) => actions.editItem(id, patch);

  // Column-header popovers ARE the bulk editor: they hit the selected rows when there's
  // a selection and the whole (filtered) package otherwise. Intersecting with `items`
  // keeps a stale selection from reaching rows the current filter hides.
  const shownIds = items.map((it) => it.id);
  const pickedIds = selectedIds.filter((id) => shownIds.includes(id));
  const targetIds = pickedIds.length ? pickedIds : shownIds;
  const scopeNote = pickedIds.length
    ? `Applies to the ${pickedIds.length} selected item${pickedIds.length === 1 ? '' : 's'}.`
    : `Applies to all ${shownIds.length} item${shownIds.length === 1 ? '' : 's'} in this package (select rows first to narrow it).`;
  // The 🔩 stage popover is the one bulk action whose note is followed by the backorder-lock
  // sentence — it reads clearer calling out that each item's own QTYs (not just the item
  // count) are what stay respected under that lock. The other column popovers (Vendor, PO#,
  // Notes…) keep the plain `scopeNote` — they don't touch quantities.
  const stageScopeNote = pickedIds.length
    ? `Applies to the ${pickedIds.length} selected item${pickedIds.length === 1 ? '' : 's'} and QTYs.`
    : `Applies to all ${shownIds.length} item${shownIds.length === 1 ? '' : 's'} and QTYs in this package (select rows first to narrow it).`;
  const applyBulk = (patch: Partial<MaterialItem>) => actions.bulkEditItems(targetIds, patch);
  // Of the rows the 🔩 header popover would hit, how many follow their delivery log —
  // those are refused by stagePatch, so the popover says so before applying.
  const stageSkipped = items.filter((it) => targetIds.includes(it.id) && logDrivesStage(it.deliveries)).length;

  const show = (key: string): boolean => {
    if (client) return !INTERNAL_ONLY.has(key);
    return !hidden[key];
  };
  const visibleKeys = Object.keys(COL_WIDTHS).filter(show);
  const colCount = visibleKeys.length + 2 + (editable ? 2 : 0);
  const fixedWidth = visibleKeys.reduce((s, k) => s + COL_WIDTHS[k], STATUS_COL_W + (editable ? CHECK_COL_W + MENU_COL_W : 0));
  const minWidth = fixedWidth + DESC_MIN_W;

  const shipDisplay = (it: MaterialItem): string => {
    if (isOfci(it.po)) return 'N/A';
    if (it.delivered) return it.receivedDate ? `Delivered ${fmtMDY(it.receivedDate)}` : 'Delivered';
    if (isPartial(it)) return `Partial ${it.receivedQty}/${it.qty}`;
    return it.shipDate ? fmtMDY(it.shipDate) : 'Confirm Date';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {editable && selectedIds.length > 0 && (
        <BulkEditBar
          count={selectedIds.length}
          onHighlight={(color) => actions.bulkEditItems(selectedIds, { highlight: color })}
          onCover={() => setShowCover(true)}
          onDelete={() => {
            if (window.confirm(`Permanently delete ${selectedIds.length} selected item${selectedIds.length === 1 ? '' : 's'} from the Material List?`)) {
              actions.deleteItems(selectedIds);
              setSelected({});
            }
          }}
          onClear={() => setSelected({})}
        />
      )}
      {showBulkSubs && <BulkSubmittalsModal ids={targetIds} onClose={() => setShowBulkSubs(false)} />}
      {showCover && <SubmittalCoverModal items={items.filter((it) => selected[it.id])} onClose={() => setShowCover(false)} />}
      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: '72vh', background: 'var(--canvas)' }}>
        <table style={{ width: '100%', minWidth, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            {/* Row-actions (⋮) leads the row, then the select checkbox. */}
            {editable && <col style={{ width: MENU_COL_W }} />}
            {editable && <col style={{ width: CHECK_COL_W }} />}
            <col />
            {visibleKeys.map((k) => <col key={k} style={{ width: COL_WIDTHS[k] }} />)}
            <col style={{ width: STATUS_COL_W }} />
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--surface-soft)' }}>
              {editable && <th style={th} />}
              {editable && (
                <th style={{ ...th, textAlign: 'center' }}>
                  <input type="checkbox" checked={items.length > 0 && items.every((it) => selected[it.id])} onChange={toggleAll} style={{ width: 24, height: 24, cursor: 'pointer', accentColor: 'var(--brand-slate)' }} />
                </th>
              )}
              <th style={th}>Spec / Arq Ref. | Item Description</th>
              {show('qty') && <th style={{ ...th, textAlign: 'right' }}>QTY</th>}
              {show('um') && (
                <th style={th}>
                  <Hdr label="U/M">
                    {editable && (
                      <BulkSetPopover
                        mode="header" icon="📐" inputType="select" options={UNITS}
                        placeholder="— unit —"
                        title="Set U/M"
                        note={scopeNote}
                        onApply={(v) => applyBulk({ um: v })}
                      />
                    )}
                  </Hdr>
                </th>
              )}
              {show('vendor') && (
                <th style={th}>
                  <Hdr label="Manufacturer / Vendor">
                    {editable && (
                      <BulkSetPopover
                        mode="header" icon="🏷" inputType="vendor" placeholder="Vendor"
                        title="Set Manufacturer / Vendor"
                        note={`${scopeNote} Type to filter the vendor catalog, or enter a new name.`}
                        onApply={(v) => applyBulk({ vendor: v })}
                      />
                    )}
                  </Hdr>
                </th>
              )}
              {show('lead') && (
                <th style={{ ...th, textAlign: 'right' }}>
                  <Hdr label="Lead (wks)">
                    {editable && (
                      <BulkSetPopover
                        mode="header" icon="⏱" inputType="number" placeholder="Weeks"
                        title="Set Lead Time (weeks)"
                        note={scopeNote}
                        onApply={(v) => applyBulk({ lead: v })}
                      />
                    )}
                  </Hdr>
                </th>
              )}
              {show('onsite') && (
                <th style={th}>
                  <Hdr label="On-Site Req.">
                    {editable && (
                      <BulkSetPopover
                        mode="header"
                        title="Set On-Site Req. date"
                        note={scopeNote}
                        onApply={(iso) => applyBulk({ onsite: iso })}
                      />
                    )}
                  </Hdr>
                </th>
              )}
              {show('buyby') && <th style={th}>Buy-By</th>}
              {show('submittal') && (
                <th style={th}>
                  <Hdr label="Submittal">
                    {editable && (
                      <BulkSetPopover
                        mode="header" icon="🧾" inputType="select" options={SUBMITTALS}
                        placeholder="— status —"
                        title="Set Submittal status"
                        note={scopeNote}
                        extraAction={{
                          label: '🧾 Breakdown Submittals…',
                          title: 'Samples, shop drawings, field measurements and other — for this scope',
                          onClick: () => setShowBulkSubs(true),
                        }}
                        onApply={(v) => applyBulk({ submittal: v })}
                      />
                    )}
                  </Hdr>
                </th>
              )}
              {show('po') && (
                <th style={th}>
                  <Hdr label="PO#">
                    {editable && (
                      <BulkSetPopover
                        mode="header" icon="🧷" inputType="po" placeholder="PO number"
                        title="Set PO#"
                        note={`${scopeNote} "From Stock" marks it received; "OFCI" drops it out of procurement (status N/A). Both apply on tap — Apply is only for a typed PO#.`}
                        quickValues={[
                          { label: '📦 From Stock', value: 'From Stock', title: 'Material comes from our own stock — skips straight to Received (applies on tap)' },
                          { label: '🏛 OFCI', value: 'OFCI', title: 'Owner Furnished, Contractor Installed — leaves our procurement flow, status N/A (applies on tap)' },
                        ]}
                        quickApply
                        onApply={(v) => applyBulk({ po: v })}
                      />
                    )}
                  </Hdr>
                </th>
              )}
              {show('poDate') && (
                <th style={th}>
                  <Hdr label="PO Date">
                    {editable && (
                      <BulkSetPopover
                        mode="header"
                        title="Set PO Date"
                        note={`${scopeNote} Ship dates recalculate from PO Date + Lead.`}
                        onApply={(iso) => applyBulk({ poDate: iso })}
                      />
                    )}
                  </Hdr>
                </th>
              )}
              {show('shipDate') && (
                <th style={th}>
                  <Hdr label="Anticipated Ship/Delivery">
                    {editable && (
                      <BulkSetPopover
                        mode="header"
                        title="Set Anticipated Ship/Delivery date"
                        note={`${scopeNote} Sets each as a manual override (✏️, reversible per row with ↺).`}
                        onApply={(iso) => applyBulk({ shipDate: iso })}
                      />
                    )}
                  </Hdr>
                </th>
              )}
              {show('notes') && (
                <th style={th}>
                  <Hdr label="Notes / Comments">
                    {editable && (
                      <BulkSetPopover
                        mode="header" icon="📝" inputType="text" placeholder="Note text"
                        title="Set Notes / Comments"
                        note={`${scopeNote} This REPLACES the existing note on each item.`}
                        onApply={(v) => applyBulk({ notes: v })}
                      />
                    )}
                  </Hdr>
                </th>
              )}
              {show('received') && (
                <th style={{ ...th, textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {/* Supply only stops at the jobsite, so the column drops "Installation". */}
                    {supplyOnly ? 'Delivery' : <>Delivery /<br />Installation</>}
                    {editable && (
                      <StagePopover
                        mode="header"
                        count={targetIds.length}
                        skipped={stageSkipped}
                        note={stageScopeNote}
                        supplyOnly={supplyOnly}
                        onApply={(stage, date) => actions.setItemStage(targetIds, stage, date)}
                      />
                    )}
                  </span>
                </th>
              )}
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, rowIdx) => {
              const c = computeItem(it, cfg);
              const blockers = submittalBlockers(it);
              const backorder = backorderQty(it);
              const locked = hasOpenBackorder(it);
              // Once the delivery log records movements it owns the stage, so ticking
              // Received by hand would be undone the next time an entry lands — the
              // checkbox steps aside, exactly like the modal's stage buttons do.
              const logOwnsStage = logDrivesStage(it.deliveries);
              // OFCI (owner-furnished) and From Stock items don't need a PO date or a
              // ship/delivery date — those cells show a muted "—" instead of an editor.
              const datesNA = isOfci(it.po) || isFromStock(it.po);
              const orderable = !isOfci(it.po) && !it.delivered && !it.ordered && !isPartial(it);
              // OFCI collapses the row to ONE axis: is it installed? (SPEC-delivery-watch §8.)
              // Everything our procurement drives — vendor, lead, submittal, both dates and
              // receiving — is not ours to fill in on material the owner buys, so those cells
              // go read-only instead of sitting there inviting an edit that means nothing.
              const ofci = isOfci(it.po);
              // …and in a supply-only package not even that: the owner buys it AND somebody
              // else installs it, so the row has no axis left at all (§8.5).
              const noAxis = ofci && supplyOnly;
              /** A cell OFCI turned off: keeps whatever the PM already typed, muted, with the why. */
              const offCell = (value: string | number, why: string, mono?: boolean) => (
                <RoText mono={mono} muted title={why}>{String(value ?? '') || '—'}</RoText>
              );
              const OFCI_WHY = '🏛 OFCI — owner furnished: this is not part of our procurement, so the only thing tracked here is whether it is installed.';
              // The third clock: bought, promised for a date that has passed, still not here.
              const late = deliveryWatch(it, cfg) === 'late';
              const behind = daysLate(it);
              const NO_AXIS_WHY = '🏛 OFCI in a supply-only package — the owner buys it and somebody else installs it. Nothing on this row is ours to track (clear OFCI from PO# if that was a mistake).';
              return (
                <tr
                  key={it.id}
                  data-item-id={it.id}
                  className={!client && it.highlight ? 'row-hl' : undefined}
                  onDragOver={editable ? (e) => {
                    if (!dragId || dragId === it.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const r = e.currentTarget.getBoundingClientRect();
                    const place = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
                    if (dropInfo?.id !== it.id || dropInfo.place !== place) setDropInfo({ id: it.id, place });
                  } : undefined}
                  onDrop={editable ? (e) => {
                    e.preventDefault();
                    if (dragId && dragId !== it.id) actions.moveItemRelative(dragId, it.id, dropInfo?.place ?? 'before');
                    setDragId(null); setDropInfo(null);
                  } : undefined}
                  style={{
                    ...(!client && it.highlight ? { background: hlToken(it.highlight) } : {}),
                    ...(dragId === it.id ? { opacity: 0.4 } : {}),
                    ...(dropInfo?.id === it.id
                      ? { boxShadow: dropInfo.place === 'before' ? 'inset 0 2px 0 0 var(--brand-slate)' : 'inset 0 -2px 0 0 var(--brand-slate)' }
                      : {}),
                  }}
                >
                  {editable && (
                    <td
                      draggable
                      onDragStart={(e) => {
                        setDragId(it.id);
                        e.dataTransfer.effectAllowed = 'move';
                        const tr = e.currentTarget.closest('tr');
                        if (tr) e.dataTransfer.setDragImage(tr, 24, 12);
                      }}
                      onDragEnd={() => { setDragId(null); setDropInfo(null); }}
                      title="Drag to reorder within this package"
                      style={{ ...td, padding: '3px 2px', textAlign: 'center', overflow: 'visible', cursor: 'grab' }}
                    >
                      <RowMenu item={it} packages={packages} onBreakdown={onBreakdown} onBreakdownSubmittals={onBreakdownSubmittals} />
                    </td>
                  )}
                  {editable && (
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        title="Shift-click to select a range of rows"
                        checked={!!selected[it.id]}
                        onClick={(e) => onRowCheck(rowIdx, it.id, e.shiftKey)}
                        onChange={() => {}}
                        style={{ width: 24, height: 24, cursor: 'pointer', accentColor: 'var(--brand-slate)' }}
                      />
                    </td>
                  )}
                  <td style={{ ...td, padding: '3px 6px' }}>
                    {editable ? <EditCell value={it.description} onCommit={(v) => set(it.id, { description: v })} placeholder="Describe item…" multiline newlines cellKey="description" /> : <RoText>{it.description}</RoText>}
                  </td>
                  {show('qty') && (
                    <td style={{ ...td, padding: '3px 4px', textAlign: 'right' }}>
                      {editable ? <EditCell value={it.qty} onCommit={(v) => set(it.id, { qty: v })} align="right" mono cellKey="qty" /> : <RoText mono>{it.qty}</RoText>}
                    </td>
                  )}
                  {show('um') && (
                    <td style={{ ...td, padding: '3px 4px' }}>
                      {editable ? (
                        <select
                          value={it.um}
                          onChange={(e) => set(it.id, { um: e.target.value })}
                          style={{
                            width: '100%', height: 30, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', background: 'transparent',
                            borderRadius: 'var(--radius-sm)', font: 'var(--text-mono)', color: 'var(--ink)', cursor: 'pointer',
                            appearance: 'none', WebkitAppearance: 'none', padding: '0 4px',
                          }}
                          onFocus={(e) => { e.target.style.borderColor = 'var(--hairline)'; }}
                          onBlur={(e) => { e.target.style.borderColor = 'transparent'; }}
                        >
                          {!UNITS.includes(it.um) && <option value={it.um}>{it.um || '—'}</option>}
                          {UNITS.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      ) : (
                        <RoText mono>{it.um}</RoText>
                      )}
                    </td>
                  )}
                  {show('vendor') && (
                    <td style={{ ...td, padding: '3px 6px' }}>
                      {ofci
                        ? offCell(it.vendor, OFCI_WHY)
                        : editable ? <VendorInput value={it.vendor} onCommit={(v) => set(it.id, { vendor: v })} quickAdd /> : <RoText>{it.vendor}</RoText>}
                    </td>
                  )}
                  {show('lead') && (
                    <td style={{ ...td, padding: '3px 4px', textAlign: 'right' }}>
                      {ofci
                        ? offCell(it.lead, OFCI_WHY, true)
                        : editable ? <EditCell value={it.lead} onCommit={(v) => set(it.id, { lead: v })} type="number" align="right" mono placeholder="—" driver={it.lead === ''} cellKey="lead" /> : <RoText mono>{it.lead}</RoText>}
                    </td>
                  )}
                  {show('onsite') && (
                    <td style={{ ...td, padding: '3px 4px' }}>
                      {/* On-Site Req. survives on an OFCI row on purpose: it is the date the
                          material has to be in the wall, and installing it IS our scope. The one
                          case where it doesn't is supply-only + OFCI — then nobody on our side
                          touches the item at all (§8.5). */}
                      {noAxis
                        ? offCell(it.onsite ? fmtMDY(it.onsite) : '', NO_AXIS_WHY, true)
                        : editable
                          ? <EditCell value={it.onsite} onCommit={(v) => set(it.id, { onsite: v })} type="date" mono driver={it.onsite === ''} cellKey="onsite" />
                          : <RoText mono muted={!it.onsite}>{it.onsite ? fmtMDY(it.onsite) : 'Confirm Date'}</RoText>}
                    </td>
                  )}
                  {show('buyby') && (
                    <td style={{ ...td, font: 'var(--text-mono)', color: c.buyby ? 'var(--ink)' : 'var(--muted)', fontWeight: 500 }}>
                      {c.buyby ? fmtMDY(c.buyby) : '—'}
                      {c.days != null && c.status !== 'ordered' && (
                        <div style={{ font: 'var(--text-mono-sm)', color: c.days <= 0 ? 'var(--status-order-now-ink)' : 'var(--muted)' }}>
                          {fmtDays(c.days)}
                        </div>
                      )}
                    </td>
                  )}
                  {show('submittal') && (
                    <td style={{ ...td, padding: '3px 4px' }}>
                      {/* `applyItemPatch` already forces N/A when OFCI is typed into PO#; the
                          select stayed live afterwards, so the PM could silently undo the very
                          rule that had just been applied. Now it reads as what it is. */}
                      {ofci ? offCell(it.submittal || 'N/A', OFCI_WHY) : editable ? (
                        <select
                          value={it.submittal}
                          onChange={(e) => set(it.id, { submittal: e.target.value })}
                          style={{
                            width: '100%', height: 30, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', background: 'transparent',
                            borderRadius: 'var(--radius-sm)', font: 'var(--text-caption)', color: 'var(--ink)', cursor: 'pointer',
                            appearance: 'none', WebkitAppearance: 'none', padding: '0 6px',
                          }}
                          onFocus={(e) => { e.target.style.borderColor = 'var(--hairline)'; }}
                          onBlur={(e) => { e.target.style.borderColor = 'transparent'; }}
                        >
                          {SUBMITTALS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <RoText>{it.submittal}</RoText>
                      )}
                      {!ofci && (() => {
                        const comps: { on: boolean; label: string; abbr: string; status: string }[] = [
                          { on: it.sampleReq, label: 'Samples', abbr: 'S', status: it.sampleStatus },
                          { on: it.shopReq, label: 'Shop drawings', abbr: 'SD', status: it.shopStatus },
                          { on: it.fieldReq, label: 'Field measurements', abbr: 'FM', status: it.fieldStatus },
                          { on: it.otherReq, label: it.otherNote.trim() ? `Other: ${it.otherNote.trim()}` : 'Other', abbr: 'O', status: it.otherStatus },
                        ].filter((c) => c.on);
                        if (comps.length === 0 && !editable) return null;
                        const chipBg = (s: string) => (s === 'approved' ? 'var(--status-ordered)' : s === 'revise' ? 'var(--status-order-now)' : 'var(--status-order-soon)');
                        const chipInk = (s: string) => (s === 'approved' ? 'var(--status-ordered-ink)' : s === 'revise' ? 'var(--status-order-now-ink)' : 'var(--status-order-soon-ink)');
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
                            {comps.map((c) => (
                              <span key={c.abbr} title={`${c.label} — ${c.status}`} style={{ font: 'var(--text-mono-sm)', fontWeight: 700, padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: chipBg(c.status), color: chipInk(c.status), whiteSpace: 'nowrap' }}>
                                {c.abbr} {c.status === 'approved' ? '✓' : c.status === 'revise' ? '↺' : '…'}
                              </span>
                            ))}
                            {editable && (
                              <button
                                type="button"
                                title="Breakdown Submittals — track samples, shop drawings & other"
                                aria-label="Breakdown Submittals"
                                onClick={() => onBreakdownSubmittals(it.id)}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, padding: '0 2px', borderRadius: 'var(--radius-sm)', opacity: comps.length ? 1 : 0.5 }}
                              >
                                🧾
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  )}
                  {show('po') && (
                    <td style={{ ...td, padding: '3px 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {editable ? <EditCell value={it.po} onCommit={(v) => set(it.id, { po: v })} mono placeholder="PO# or From Stock" multiline cellKey="po" /> : <RoText mono>{it.po}</RoText>}
                        {isFromStock(it.po) && (
                          <span title="From Stock — skips Ordered, goes straight to Delivered" style={{ font: 'var(--text-mono-sm)' }}>📦</span>
                        )}
                      </div>
                    </td>
                  )}
                  {show('poDate') && (
                    <td style={{ ...td, padding: '3px 4px' }}>
                      {datesNA
                        ? <RoText mono muted>—</RoText>
                        : editable
                          ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <EditCell value={it.poDate} onCommit={(v) => set(it.id, { poDate: v })} type="date" mono cellKey="poDate" />
                              <button type="button" title="Set to today" aria-label="Set PO Date to today" onClick={() => set(it.id, { poDate: today() })} style={todayBtn}>🕒</button>
                            </div>
                          )
                          : <RoText mono>{it.poDate ? fmtMDY(it.poDate) : ''}</RoText>}
                    </td>
                  )}
                  {show('shipDate') && (
                    <td style={{ ...td, padding: '3px 4px' }}>
                      {isOfci(it.po) ? (
                        <RoText mono muted>N/A</RoText>
                      ) : !client && it.delivered ? (
                        // Received: the delivery is done and its date lives in the
                        // Received column, so the anticipated date no longer applies.
                        <RoText mono muted>—</RoText>
                      ) : editable ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {/* Red once the promised date has passed — the cell the PM has to
                              act on IS the one they retype to reschedule. */}
                          <EditCell value={it.shipDate} onCommit={(v) => set(it.id, { shipDate: v })} type="date" mono width={126} cellKey="shipDate" ink={late ? 'var(--status-order-now-ink)' : undefined} />
                          <span
                            title={it.shipDateManual ? 'Manually entered' : 'Auto-calculated from PO Date + Lead Time'}
                            style={{
                              fontSize: 12, lineHeight: 1, whiteSpace: 'nowrap', padding: '4px 6px', borderRadius: 'var(--radius-pill)', cursor: 'help',
                              background: it.shipDateManual ? 'var(--status-order-soon)' : 'var(--status-ordered)',
                            }}
                          >
                            {it.shipDateManual ? '✏️' : '⚡'}
                          </span>
                          {it.shipDateManual && (
                            <button
                              type="button"
                              title="Reset to auto-calculated"
                              aria-label="Reset to auto-calculated"
                              onClick={() => actions.resetShipDateAuto(it.id)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: '2px 4px', flexShrink: 0 }}
                            >
                              ↺
                            </button>
                          )}
                        </div>
                      ) : (
                        <RoText mono muted={!it.shipDate && !it.delivered && !isPartial(it)} ink={late ? 'var(--status-order-now-ink)' : undefined}>{shipDisplay(it)}</RoText>
                      )}
                    </td>
                  )}
                  {show('notes') && (
                    <td style={{ ...td, padding: '3px 6px' }}>
                      {editable ? <EditCell value={it.notes} onCommit={(v) => set(it.id, { notes: v })} placeholder="Notes…" multiline newlines cellKey="notes" /> : <RoText>{it.notes}</RoText>}
                    </td>
                  )}
                  {show('received') && (
                    <td style={{ ...td, textAlign: 'center' }}>
                      {/* The OFCI shape of this cell: one checkbox, one question. It goes
                          through `setItemStage` like every other stage writer — an
                          `editItem({ installed })` here would skip the arbitration that
                          `stagePatch` owns (lote 40), and it is exactly the shortcut the
                          Received checkbox took that let a receipt land on OFCI material. */}
                      {editable && ofci ? (noAxis ? (
                        <RoText mono muted title={NO_AXIS_WHY}>—</RoText>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="checkbox"
                            title={logOwnsStage
                              ? 'This item still follows its delivery log — clear the entries in 🔩 to set the stage by hand.'
                              : it.installed
                                ? `🔩 Installed${it.installedDate ? ` ${fmtMDY(it.installedDate)}` : ''} — untick to reopen it`
                                : '🏛 OFCI — tick when it is installed (stamps today; the date is editable in 🔩)'}
                            aria-label="Mark as Installed"
                            checked={it.installed}
                            disabled={logOwnsStage}
                            onChange={(e) => actions.setItemStage([it.id], e.target.checked ? 'installed' : 'pending')}
                            style={{ width: 24, height: 24, cursor: logOwnsStage ? 'not-allowed' : 'pointer', accentColor: 'var(--status-installed-ink)', flexShrink: 0 }}
                          />
                          <button
                            type="button"
                            title={`${it.installed ? STAGE_META.installed.label : 'Not installed'} — click for Installation (OFCI)`}
                            aria-label={`Installation — ${it.installed ? STAGE_META.installed.label : 'not installed'}`}
                            onClick={() => onBreakdown(it.id)}
                            style={{
                              border: '1px solid transparent', background: 'transparent', cursor: 'pointer', fontSize: 14,
                              padding: '1px 4px', borderRadius: 'var(--radius-sm)', lineHeight: 1.3,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hairline)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
                          >
                            {it.installed ? STAGE_META.installed.icon : STAGE_META.pending.icon}
                          </button>
                        </div>
                      )) : editable ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="checkbox"
                            title={locked
                              ? `Locked — ${backorder} still on backorder. Register the rest via Breakdown Delivery (🚚) to complete it.`
                              : logOwnsStage
                                ? 'This item follows its delivery log — register arrivals and releases in Breakdown Delivery (🚚).'
                                : it.delivered && it.receivedDate
                                  ? `Received ${fmtMDY(it.receivedDate)} — date auto-stamped, editable in the ${supplyOnly ? 'Delivery' : 'Delivery & Installation'} modal`
                                  : 'Mark as Received / Delivered (stamps today as the received date)'}
                            aria-label="Mark as Received / Delivered"
                            checked={it.delivered}
                            disabled={locked || logOwnsStage}
                            onChange={(e) => set(it.id, { delivered: e.target.checked })}
                            style={{ width: 24, height: 24, cursor: locked || logOwnsStage ? 'not-allowed' : 'pointer', accentColor: 'var(--success-border)', flexShrink: 0 }}
                          />
                          {/* The stage icon IS the indicator: 🚚 not received → 🏭 warehouse
                              → 📍 on site → 🔩 installed. Click opens the Delivery &
                              Installation modal (partial deliveries + stage). */}
                          <button
                            type="button"
                            title={`${STAGE_META[itemStage(it)].label} — click for ${supplyOnly ? 'Delivery (partial deliveries, warehouse / on site)' : 'Delivery & Installation (partial deliveries, warehouse / on site / installed)'}`}
                            aria-label={`${supplyOnly ? 'Delivery' : 'Delivery and installation'} — ${STAGE_META[itemStage(it)].label}`}
                            onClick={() => onBreakdown(it.id)}
                            style={{
                              border: '1px solid transparent', background: 'transparent', cursor: 'pointer', fontSize: 14,
                              padding: '1px 4px', borderRadius: 'var(--radius-sm)', lineHeight: 1.3,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--hairline)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
                          >
                            {STAGE_META[itemStage(it)].icon}
                          </button>
                        </div>
                      ) : (
                        <RoText mono muted={!it.delivered && !it.installed}>
                          {it.installed
                            ? `🔩 ${it.installedDate ? fmtMDY(it.installedDate) : ''}`
                            : it.delivered
                              ? `${STAGE_META[itemStage(it)].icon} ${it.receivedDate ? fmtMDY(it.receivedDate) : ''}`
                              : '—'}
                        </RoText>
                      )}
                      {/* Stage stamp under the checkbox — the date that matters at this
                          point of the cycle (received → on-site release → installation).
                          Read-only on purpose: the cell can't say WHICH of the three dates
                          a bare date input would be writing. All three are edited, each
                          under its own label, in the Delivery & Installation modal. */}
                      {editable && (it.installed || it.siteDate || it.delivered) && (() => {
                        const st = itemStage(it);
                        const stamp = st === 'installed' ? it.installedDate : st === 'on-site' ? it.siteDate : it.receivedDate;
                        return (
                          <div
                            title={`${STAGE_META[st].label} — edit the date in ${supplyOnly ? 'Delivery' : 'Delivery & Installation'} (${STAGE_META[st].icon} above)`}
                            style={{ font: 'var(--text-mono-sm)', color: it.installed ? 'var(--status-installed-ink)' : 'var(--muted)', fontWeight: 600 }}
                          >
                            {STAGE_META[st].icon} {stamp ? fmtMDY(stamp) : STAGE_META[st].label}
                          </div>
                        );
                      })()}
                      {isPartial(it) && (
                        <div style={{ font: 'var(--text-mono-sm)', color: 'var(--status-partial-ink)' }}>{it.receivedQty}/{it.qty}</div>
                      )}
                      {/* Part of it is up on the wall (lote 44) — the same renglón the
                          delivery fraction uses, in the installed ink so the two read as
                          two steps of one chain: what arrived, then what went up. */}
                      {isPartiallyInstalled(it) && (
                        <div
                          title={`🔩 ${it.installedQty} of ${it.qty} installed — register the rest in ${supplyOnly ? 'Delivery' : 'Delivery & Installation'} (${STAGE_META[itemStage(it)].icon} above)`}
                          style={{ font: 'var(--text-mono-sm)', color: 'var(--status-installed-ink)', fontWeight: 600 }}
                        >
                          🔩 {it.installedQty}/{it.qty}
                        </div>
                      )}
                    </td>
                  )}
                  <td style={td}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <StatusBadge status={c.status} solid />
                      {/* Received but not installed: the badge alone can't say whether the
                          material is still in the warehouse or already at the jobsite. */}
                      {!client && awaitingInstall(it, supplyOnly) && (() => {
                        const st = itemStage(it);
                        const urg = installUrgency(it, cfg);
                        const waited = daysWaiting(it);
                        return (
                          <span
                            title={[
                              `${STAGE_META[st].label}${waited != null ? ` — ${waited} day${waited === 1 ? '' : 's'} since received` : ''}`,
                              it.onsite ? `On-Site Req. ${fmtMDY(it.onsite)}` : 'No On-Site Req. date set',
                              urg === 'overdue' ? '⚠ On-Site date passed — not installed yet' : urg === 'due-soon' ? '🟠 Needed on site soon — release it from the warehouse' : '',
                            ].filter(Boolean).join(' · ')}
                            style={{ fontSize: 14, lineHeight: 1, cursor: 'help', flexShrink: 0, filter: urg === 'overdue' ? 'none' : undefined }}
                          >
                            {STAGE_META[st].icon}{urg === 'overdue' ? '⚠' : ''}
                          </span>
                        );
                      })()}
                      {/* Third clock, same shape as the 🏭/📍 above: the badge keeps saying
                          ORDERED (the PM must not lose sight of the fact that it's bought) and
                          the ⏰ rides alongside it. Only 'late' shows — the promise passed and
                          nothing arrived; the two ways out are in the tooltip. */}
                      {!client && late && (
                        <span
                          title={[
                            `⏰ Promised ${fmtMDY(it.shipDate)}${behind != null ? ` — ${behind} day${behind === 1 ? '' : 's'} late` : ''}`,
                            'Reschedule it to the new promised date, or mark it received.',
                          ].join(' · ')}
                          style={{ fontSize: 14, lineHeight: 1, cursor: 'help', flexShrink: 0 }}
                        >
                          ⏰
                        </span>
                      )}
                      {!client && orderable && (
                        <span
                          title={blockers.length ? `Blocked by submittal: ${blockers.join(', ')}` : 'Ready to order — submittal cleared'}
                          aria-label={blockers.length ? 'Blocked by submittal' : 'Ready to order'}
                          style={{ fontSize: 14, lineHeight: 1, cursor: 'help', flexShrink: 0 }}
                        >
                          {blockers.length ? '⛔' : '✅'}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={colCount} style={{ ...td, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No items yet — add one, or import a materials list.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
