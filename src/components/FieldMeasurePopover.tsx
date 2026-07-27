// FieldMeasurePopover.tsx — toolbar button "◆ Set Field Measure date" (orange diamond,
// the same marker the Overview timeline uses). Asks WHICH work package needs field
// measurements (toilet partitions one week, lockers & mailboxes another…), then stamps
// the chosen date on every item of that package (fieldDate). One date per package by
// design: if some items need a different measure date, the note suggests moving them to
// their own work package so they get their own ◆ milestone on the timeline.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ds/Button';
import { Select } from './ds/Select';
import { fmtMDY, prefixCompare } from '../store/logic';
import type { MaterialItem, WorkPackage } from '../store/types';
import { anchorBelow } from './uiScale';

export function FieldMeasurePopover({ packages, itemsOf, onApply, onClear, onNewPackage }: {
  packages: WorkPackage[];
  itemsOf: (wpId: string) => MaterialItem[];
  onApply: (ids: string[], iso: string) => void;
  onClear: (ids: string[]) => void;
  /** Closes the popover and opens the Add Work Package modal (split suggestion). */
  onNewPackage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [wpId, setWpId] = useState('');
  const [date, setDate] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      // The panel is portaled to <body> (see below), so it's outside `ref` — check both.
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Position is captured once at open time; scrolling the page (or the table's own
  // scroll container) moves the button but not this fixed panel, so it drifts over
  // whatever's now behind it. Closing on scroll is simpler and less fragile than
  // tracking the button live — see StagePopover for the same fix.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('scroll', close, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', close, { capture: true });
  }, [open]);

  const sorted = useMemo(() => [...packages].sort((a, b) => prefixCompare(a.prefix, b.prefix)), [packages]);
  /** Distinct fieldDates already set on a package's items, oldest first. */
  const datesOf = (id: string) => [...new Set(itemsOf(id).filter((i) => i.fieldDate).map((i) => i.fieldDate))].sort();

  const sel = sorted.find((p) => p.id === wpId);
  const selItems = sel ? itemsOf(sel.id) : [];
  const selDates = sel ? datesOf(sel.id) : [];
  const canApply = !!sel && !!date && selItems.length > 0;

  const toggle = () => {
    setPos(anchorBelow(btnRef.current!, 340));
    setWpId('');
    setDate('');
    setOpen((o) => !o);
  };

  const apply = () => {
    if (!canApply) return;
    const overwrite = selDates.length > 0 && !(selDates.length === 1 && selDates[0] === date);
    const n = selItems.length;
    if (window.confirm(`Set Field Measurements date to ${fmtMDY(date)} for all ${n} item${n === 1 ? '' : 's'} in "${sel!.label}"?${overwrite ? ' This overwrites the existing date(s).' : ''}`)) {
      onApply(selItems.map((i) => i.id), date);
      setOpen(false);
    }
  };
  const clear = () => {
    if (!sel || selDates.length === 0) return;
    if (window.confirm(`Clear the Field Measurements date from "${sel.label}"? Its ◆ milestone leaves the timeline.`)) {
      onClear(selItems.map((i) => i.id));
      setOpen(false);
    }
  };

  const diamond = (size: number): React.CSSProperties => ({
    width: size, height: size, background: 'var(--brand-orange)', borderRadius: 2, transform: 'rotate(45deg)', display: 'inline-block', flexShrink: 0,
  });
  const toolbarStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8, height: 34, padding: '0 14px', cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--hairline)', borderRadius: 'var(--radius-lg)',
    background: 'var(--canvas)', color: 'var(--ink)', font: 'var(--text-body)', fontWeight: 500, whiteSpace: 'nowrap',
  };

  // Per-package status under the pickers: none / single date / mixed dates (split hint).
  const status = !sel ? null
    : selItems.length === 0 ? <>This package has no items yet.</>
    : selDates.length === 0 ? <>No Field Measurements date on this package yet.</>
    : selDates.length === 1 ? <>Current date: <b>{fmtMDY(selDates[0])}</b> — Apply overwrites it.</>
    : <>⚠ Items here have <b>{selDates.length} different dates</b> ({fmtMDY(selDates[0])} – {fmtMDY(selDates[selDates.length - 1])}). The timeline shows one ◆ per package (earliest wins) — move the other-date items to their own work package.</>;

  return (
    <span ref={ref} style={{ display: 'inline-flex' }}>
      <button ref={btnRef} type="button" className="btn" onClick={toggle} aria-label="Set Field Measurements date" aria-expanded={open} style={toolbarStyle}>
        <span aria-hidden style={diamond(10)} />
        Set Field Measure date
      </button>
      {open && createPortal(
        // Portaled to <body> for the same reason as StagePopover / BulkSetPopover: the
        // sticky toolbar band this button sits in is its own stacking context, so a
        // `position: fixed` child painted inside it isn't guaranteed to stack above
        // content outside it just because its own z-index is higher.
        <div ref={popRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 80, width: 320, background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-pop)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ font: 'var(--text-caption)', fontWeight: 600, color: 'var(--muted)' }}>Which work package needs field measurements?</div>
          <Select
            value={wpId}
            onChange={(e) => setWpId(e.target.value)}
            placeholder="— select work package —"
            style={{ height: 38 }}
            options={sorted.map((p) => {
              const ds = datesOf(p.id);
              const suffix = ds.length === 1 ? ` — ◆ ${fmtMDY(ds[0])}` : ds.length > 1 ? ` — ◆ ${ds.length} dates` : '';
              return { value: p.id, label: `${p.label}${suffix}` };
            })}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
            style={{ height: 38, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', background: 'var(--canvas)' }}
          />
          {status && <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>{status}</div>}
          <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', borderTop: '1px solid var(--hairline)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
            <span>Different dates for just some items? Put them in a separate work package — each package gets its own <span aria-hidden style={diamond(8)} /> milestone on the timeline.</span>
            <Button variant="ghost" size="sm" onClick={() => { setOpen(false); onNewPackage(); }}>＋ New work package…</Button>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            {selDates.length > 0 && <Button variant="ghost" size="sm" onClick={clear} style={{ marginRight: 'auto' }}>✕ Clear date</Button>}
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!canApply} onClick={apply}>Apply</Button>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
