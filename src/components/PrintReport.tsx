// PrintReport.tsx — the dedicated print/PDF layout. Hidden on screen; @media print
// hides the app UI and shows only this, replacing the Excel-era procurement log this
// tool grew out of: branded header block (logo, Project / GC-Client / Status as of), then
// one boxed table per work package. Rendered for both Internal and Client·GC exports —
// Internal adds the procurement columns (Lead, Buy-By, Submittal, PO#, PO Date).
import { Fragment, type CSSProperties } from 'react';
import { closesAtSite, computeItem, deliveryLogRows, fmtMDY, isPartial, isPartiallyInstalled, pendingSubmittalApproval, submittalBlockers, today } from '../store/logic';
import type { Cfg, DeliveryKind, ExportMode, ItemStatus, MaterialItem, Project, WorkPackage } from '../store/types';
import logoUrl from '../assets/demo-contractor-logo.svg';

const NAVY = '#1f3864';
const BLUE = '#2e74b5';
const GRID = '#8c8c8c';

const STATUS_PRINT: Record<ItemStatus, { label: string; bg: string }> = {
  'order-now': { label: 'ORDER NOW', bg: '#f4b8b8' },
  'order-soon': { label: 'Order soon', bg: '#ffe699' },
  ordered: { label: 'Ordered', bg: '#ddebf7' },
  partial: { label: 'Partially Delivered', bg: '#f8cbad' },
  delivered: { label: 'Delivered / in', bg: '#c6e0b4' },
  'on-site': { label: 'Delivered to site', bg: '#bfe8d5' },
  installed: { label: 'Installed', bg: '#b7e1dd' },
  'needs-data': { label: 'Needs data', bg: '#efefef' },
  planned: { label: 'Planned', bg: '#ffffff' },
  na: { label: 'N/A', bg: '#dbe1ea' },
};

const cell: CSSProperties = {
  border: `0.7pt solid ${GRID}`,
  padding: '3px 6px',
  fontSize: 10,
  color: '#000',
  verticalAlign: 'middle',
  overflowWrap: 'break-word',
  whiteSpace: 'pre-wrap', // multiline Description / Notes keep their line breaks on paper
};

/* Shared column widths — one identical <colgroup> per package table (fixed layout, the
 * description column absorbs the rest) so columns line up across the whole report. */
// qty is wider than a raw number needs: partially-delivered items print
// "received/total" (e.g. 120/320), which must stay on one line (see qtyCell).
const PRINT_COLS = { qty: 62, um: 30, vendor: 86, lead: 36, buyby: 72, submittal: 62, po: 66, poDate: 72, ship: 76, onsite: 72, notes: 100, status: 70 };
/* QTY prints "received/total" for open backorders — never let that break mid-number
 * (the base cell wraps on overflow, which split "120/320" across two lines). */
const qtyCell: CSSProperties = { ...cell, textAlign: 'right', whiteSpace: 'nowrap', padding: '3px 4px' };

const head: CSSProperties = {
  ...cell,
  background: '#dbdbdb',
  fontWeight: 700,
  textAlign: 'center',
  fontSize: 9,
};

/* Delivery log in print: emoji don't render reliably in a PDF, so each movement gets a
 * short word. A plain legacy entry (no kind) is just a receipt and needs no label. */
const KIND_PRINT: Record<DeliveryKind, string> = {
  site: 'to site', 'wh-in': 'to whse', 'wh-out': 'whse → site', stock: 'from stock',
};

function shipText(it: MaterialItem): string {
  // Prefer the actual received date (auto-stamped, editable); legacy items fall back to shipDate.
  if (it.delivered) {
    const d = it.receivedDate || it.shipDate;
    return d ? `Delivered ${fmtMDY(d)}` : 'Delivered';
  }
  if (isPartial(it)) return `Partial ${it.receivedQty}/${it.qty}`;
  return it.shipDate ? fmtMDY(it.shipDate) : 'Confirm Date';
}

export function PrintReport({ project, packages, itemsOf, mode, cfg, showSubmittalSummary = false, showDeliveryLog = true }: {
  project: Project;
  packages: WorkPackage[];
  itemsOf: (wpId: string) => MaterialItem[];
  mode: ExportMode;
  cfg: Cfg;
  /** Append a compact "items pending submittal approval" summary, grouped by work
   * package, at the end of the report. Opt-in from the Export PDF dialog. */
  showSubmittalSummary?: boolean;
  /** Append the delivery log. Opt-OUT from the Export PDF dialog (it defaults to on:
   * it was unconditional before the dialog learned to ask). */
  showDeliveryLog?: boolean;
}) {
  const internal = mode === 'internal';
  const todayMDY = fmtMDY(today());

  // Blocked-by-submittal roll-up for the optional client summary.
  const pendingGroups = packages
    .map((pkg) => ({ pkg, blocked: itemsOf(pkg.id).filter(pendingSubmittalApproval) }))
    .filter((g) => g.blocked.length > 0);
  const pendingTotal = pendingGroups.reduce((s, g) => s + g.blocked.length, 0);

  // Delivery log roll-up — every registered entry, flattened item by item.
  const deliveryGroups = packages
    .map((pkg) => ({
      pkg,
      // deliveryLogRows, not it.deliveries: an item moved with the stage buttons has no
      // registered entries and still belongs in the log (see the function's comment).
      entries: itemsOf(pkg.id).flatMap((it) => deliveryLogRows(it).map((d) => ({ it, d }))),
    }))
    .filter((g) => g.entries.length > 0);
  const deliveryTotal = deliveryGroups.reduce((s, g) => s + g.entries.length, 0);

  /* The two end-of-report summaries share their chrome (navy title bar + italic caption)
   * so they read as a matched pair when they sit side by side. */
  const summaryBlock = (title: string, caption: string, table: React.ReactNode) => (
    <div style={{ breakInside: 'avoid' }}>
      <div style={{ background: NAVY, color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: 0.3, padding: '5px 8px' }}>{title}</div>
      <div style={{ fontSize: 8.5, fontStyle: 'italic', color: '#333', margin: '3px 0 5px' }}>{caption}</div>
      {table}
    </div>
  );

  /* ---------------------------------------------------------------- delivery log
     Every delivery the PM registered, item by item. It lives in its own block instead of
     inside the Ship/Delivery cell because that column renders ~76pt wide in landscape —
     three log lines in there tripled every row's height. The client PDF hides the
     Received column, so this is the only place the GC ever sees what actually landed.
     NOTE (lote 44): **the Notes column is not exported.** Those entries carry invoice
     numbers and the PM's own references — internal bookkeeping, not something the GC is
     owed — and dropping it is also what lets the block live in half a page. */
  const deliveryBlock = !showDeliveryLog || deliveryGroups.length === 0 ? null : summaryBlock(
    // Not "REGISTERED" any more: a row can come from the stage instead of a log entry.
    `DELIVERY LOG — ${deliveryTotal} ENTR${deliveryTotal > 1 ? 'IES' : 'Y'}`,
    'Quantities received and moved, grouped by work package. "→" is a release out of the warehouse, not a new receipt.',
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col />
        <col style={{ width: 42 }} />
        <col style={{ width: 84 }} />
        <col style={{ width: 66 }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...head, textAlign: 'left' }}>Item</th>
          <th style={head}>QTY</th>
          <th style={{ ...head, textAlign: 'left' }}>Movement</th>
          <th style={{ ...head, textAlign: 'left' }}>Date</th>
        </tr>
      </thead>
      <tbody>
        {deliveryGroups.map((g) => (
          <Fragment key={g.pkg.id}>
            <tr style={{ breakInside: 'avoid' }}>
              <td colSpan={4} style={{ ...cell, background: '#dbdbdb', fontWeight: 700, fontSize: 9.5 }}>
                {g.pkg.label} <span style={{ fontWeight: 400, color: '#333' }}>({g.entries.length})</span>
              </td>
            </tr>
            {g.entries.map(({ it, d }, i) => (
              <tr key={`${it.id}_${i}`} style={{ breakInside: 'avoid' }}>
                <td style={{ ...cell, fontSize: 9 }}>{it.description}</td>
                <td style={{ ...qtyCell, fontSize: 9 }}>{d.kind === 'wh-out' ? '→' : '+'}{d.qty}</td>
                <td style={{ ...cell, fontSize: 9 }}>{d.kind ? KIND_PRINT[d.kind] : 'received'}</td>
                {/* A stage-derived row can be dateless (the PM never stamped one). */}
                <td style={{ ...cell, fontSize: 9 }}>{d.date ? fmtMDY(d.date) : '—'}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>,
  );

  /* ------------------------------------------------- optional submittal summary */
  const submittalBlock = !showSubmittalSummary || pendingTotal === 0 ? null : summaryBlock(
    `SUBMITTAL STATUS SUMMARY — ${pendingTotal} ITEM${pendingTotal > 1 ? 'S' : ''} PENDING APPROVAL`,
    'Items still awaiting submittal approval, grouped by work package.',
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col />
        <col style={{ width: 150 }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...head, textAlign: 'left' }}>Item</th>
          <th style={{ ...head, textAlign: 'left' }}>Pending approval</th>
        </tr>
      </thead>
      <tbody>
        {pendingGroups.map((g) => (
          <Fragment key={g.pkg.id}>
            <tr style={{ breakInside: 'avoid' }}>
              <td colSpan={2} style={{ ...cell, background: '#dbdbdb', fontWeight: 700, fontSize: 9.5 }}>
                {g.pkg.label} <span style={{ fontWeight: 400, color: '#333' }}>({g.blocked.length})</span>
              </td>
            </tr>
            {g.blocked.map((it) => (
              <tr key={it.id} style={{ breakInside: 'avoid' }}>
                <td style={{ ...cell, fontSize: 9 }}>{it.description}</td>
                <td style={{ ...cell, fontSize: 9, color: '#8a1d1d' }}>{submittalBlockers(it).join(', ')}</td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>,
  );
  const summaryBlocks = [deliveryBlock, submittalBlock].filter(Boolean);

  /* ------------------------------------------------ branded header block
     It rides in the <thead> of the sheet table below, so the browser reprints it at the
     top of EVERY page. Two reasons, and the second is not cosmetic: the Excel template
     this tool grew out of did the same ("repeat rows at top"), and page 2+ had no top
     margin at all — `.print-report`'s padding only applies once, at the start of the
     flow, and the `@page` margin box has to stay at 0 or Chrome draws its own
     header/footer band back in (see the trap in CLAUDE.md). The padding that opens each
     page therefore lives on this block, and the bottom one on the <tfoot> spacer. */
  const headerBlock = (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
        <tbody>
          <tr>
            <td style={{ ...cell, background: NAVY, color: '#fff', fontWeight: 700, width: '34%' }}>Project:</td>
            <td style={{ ...cell, background: NAVY, color: '#fff', fontWeight: 700, width: '22%' }}>{mode === 'client' ? 'GC-Client' : 'Internal'}</td>
            <td style={{ ...cell, background: BLUE, color: '#fff', fontWeight: 700, width: '22%', textAlign: 'center' }}>Status as of</td>
            <td style={{ ...cell, fontWeight: 700, width: '22%', textAlign: 'center' }}>{todayMDY}</td>
          </tr>
          <tr>
            <td style={{ ...cell, fontSize: 20, fontWeight: 700, padding: '10px 8px' }}>{project.name}</td>
            <td style={{ ...cell, fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>{project.gc}</td>
            <td colSpan={2} style={{ ...cell, textAlign: 'center', padding: '4px 8px' }}>
              <img src={logoUrl} alt="Kestrel Interiors LLC" style={{ height: 52, display: 'block', margin: '0 auto' }} />
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, marginTop: 2 }}>MATERIAL LIST / PROCUREMENT LOG</div>
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: 9, fontStyle: 'italic', color: '#333', marginBottom: 8 }}>Spec / Arq Ref. | Item Description</div>
    </>
  );

  return (
    <div className="print-report" style={{ fontFamily: 'Arial, Helvetica, sans-serif', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      {/* The sheet: one outer table whose header group repeats per page. `fixed` layout so
        * the nested package tables size against the page and not against their content. */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr><td style={{ padding: '9mm 0 0' }}>{headerBlock}</td></tr>
        </thead>
        {/* Repeats at the foot of every page, which is the only way to keep the last row
          * off the paper edge on a page that fills up. Empty on purpose. */}
        <tfoot>
          <tr><td style={{ height: '9mm' }} /></tr>
        </tfoot>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top' }}>
      {/* ------------------------------------------------ one boxed table per package */}
      {packages.map((pkg) => {
        const items = itemsOf(pkg.id);
        if (items.length === 0) return null;
        // Supply-only packages close at 'on-site' — the scope has to reach computeItem,
        // which only ever sees the item snapshot.
        const pkgCfg: Cfg = { ...cfg, supplyOnly: closesAtSite(pkg, project) };
        return (
          <table key={pkg.id} style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14, breakInside: 'auto', tableLayout: 'fixed' }}>
            <colgroup>
              <col />
              <col style={{ width: PRINT_COLS.qty }} />
              <col style={{ width: PRINT_COLS.um }} />
              <col style={{ width: PRINT_COLS.vendor }} />
              {internal && <col style={{ width: PRINT_COLS.lead }} />}
              {internal && <col style={{ width: PRINT_COLS.buyby }} />}
              {internal && <col style={{ width: PRINT_COLS.submittal }} />}
              {internal && <col style={{ width: PRINT_COLS.po }} />}
              {internal && <col style={{ width: PRINT_COLS.poDate }} />}
              <col style={{ width: PRINT_COLS.ship }} />
              <col style={{ width: PRINT_COLS.onsite }} />
              <col style={{ width: PRINT_COLS.notes }} />
              <col style={{ width: PRINT_COLS.status }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ ...head, textAlign: 'left', fontSize: 11 }}>{pkg.label}</th>
                <th style={head}>QTY</th>
                <th style={head}>U/M</th>
                <th style={head}>Manufacturer/<br />Supplier/<br />Vendor</th>
                {internal && <th style={head}>Lead<br />(wks)</th>}
                {internal && <th style={head}>Buy-By<br />Date</th>}
                {internal && <th style={head}>Submittal</th>}
                {internal && <th style={head}>PO#</th>}
                {internal && <th style={head}>PO Date</th>}
                <th style={head}>Anticipated<br />Ship/Delivery<br />Date</th>
                <th style={head}>On-Site Req.<br />Date</th>
                <th style={head}>Notes/Comments</th>
                <th style={head}>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const c = computeItem(it, pkgCfg);
                // Part of it is up on the wall (lote 44). The Status cell prints the
                // fraction instead of a bare word, the same way the Ship/Delivery cell
                // already prints "Partial 5/10" — it is the one place the GC would
                // otherwise read a half-installed item as finished. The installed fill
                // comes along: being partly installed IS the most advanced fact about it.
                const partlyUp = isPartiallyInstalled(it);
                const st = partlyUp
                  ? { label: `${it.installedQty}/${it.qty} installed`, bg: STATUS_PRINT.installed.bg }
                  : STATUS_PRINT[c.status];
                return (
                  <tr key={it.id} style={{ breakInside: 'avoid' }}>
                    <td style={cell}>{it.description}</td>
                    {/* Backorder open: QTY reads "received/total" (e.g. 3/4). */}
                    <td style={qtyCell}>{isPartial(it) ? `${it.receivedQty}/${it.qty}` : it.qty}</td>
                    <td style={cell}>{it.um}</td>
                    <td style={cell}>{it.vendor}</td>
                    {internal && <td style={{ ...cell, textAlign: 'right' }}>{it.lead}</td>}
                    {internal && <td style={cell}>{c.buyby ? fmtMDY(c.buyby) : '—'}</td>}
                    {internal && <td style={cell}>{it.submittal}</td>}
                    {internal && <td style={cell}>{it.po}</td>}
                    {internal && <td style={cell}>{it.poDate ? fmtMDY(it.poDate) : ''}</td>}
                    <td style={cell}>{shipText(it)}</td>
                    <td style={cell}>{it.onsite ? fmtMDY(it.onsite) : 'Confirm Date'}</td>
                    <td style={cell}>{it.notes}</td>
                    <td style={{ ...cell, background: st.bg, fontSize: 9, fontWeight: 600 }}>{st.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })}

      {summaryBlocks.length === 2 ? (
        /* Two summaries, one band, HALF the page each — they used to stack, and each one
         * burned a full page width on a table with two or three short columns. A <table>
         * does the two columns instead of flexbox on purpose: this is a print layout, and
         * a table fragments across pages predictably where a flex row gets clipped. */
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', marginTop: 18 }}>
          <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
          <tbody>
            <tr>
              <td style={{ verticalAlign: 'top', paddingRight: 9 }}>{summaryBlocks[0]}</td>
              <td style={{ verticalAlign: 'top', paddingLeft: 9 }}>{summaryBlocks[1]}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        /* Only one of the two — it keeps the full width; half a page of white space next
         * to it would be the opposite of the point. */
        summaryBlocks.length === 1 && <div style={{ marginTop: 18 }}>{summaryBlocks[0]}</div>
      )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
