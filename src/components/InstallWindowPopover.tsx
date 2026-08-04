// InstallWindowPopover.tsx — schedules the planned install window. Two modes:
//   'header'  — the 🛠 in the "Delivery / Installation" column header: applies to the
//               selected rows, or the whole package when nothing is selected.
//   'toolbar' — the 🛠 pill in the top bar, split off the 🔩 Delivery / Installation
//               pill: one window across the whole project. The parent pre-filters
//               `items` to the install scope (supply-only packages close at the dock and
//               have no installation phase) and names that scope in `note`/`scopeName`.
// Sibling of StagePopover — same door, same mechanics — but the window is a PLAN
// (schedule), so unlike StagePopover it never moves any item's stage: Apply writes
// installStart/installEnd and nothing else.
//
// The glyph is 🛠 on purpose: 📅 is the BulkSetPopover icon (On-Site Req. and friends)
// and 🗓 belongs to the Overview clock modals — three calendars on one header row would
// be indistinguishable.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { distinctWindowCount, fmtMD, installWindow, installWindowSummary } from '../store/logic';
import type { MaterialItem } from '../store/types';
import { Button } from './ds/Button';
import { InstallWindowFields } from './InstallWindowFields';
import { anchorBelow, localRect, localViewport } from './uiScale';

export function InstallWindowPopover({ items, note, onApply, onClear, mode = 'header', scopeName }: {
  /** The rows Apply will hit — header mode: the selected ones, or the whole package when
   * nothing is selected; toolbar mode: the project's whole install scope, pre-filtered
   * by the parent. The state line is computed from exactly this set. */
  items: MaterialItem[];
  /** The scope sentence, same one the sibling popovers show. */
  note: string;
  onApply: (next: { start: string; end: string }) => void;
  onClear: () => void;
  mode?: 'header' | 'toolbar';
  /** Toolbar mode: names the scope in the confirms ("all 4 packages in "X""). */
  scopeName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const ref = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRectRef = useRef<ReturnType<typeof localRect> | null>(null);
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

  // The panel is `position: fixed` at the button's rect captured on open — scrolling
  // moves the button but not the panel, so it closes instead of drifting (the same call
  // every popover in this repo makes — see StagePopover).
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('scroll', close, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', close, { capture: true });
  }, [open]);

  const aggregate = installWindow(items);
  const distinct = distinctWindowCount(items);
  const n = items.length;

  const toggle = () => {
    btnRectRef.current = localRect(btnRef.current!);
    setPos(anchorBelow(btnRef.current!, 320));
    // Pre-fill from the current aggregate only when every voter agrees; mixed (or no)
    // windows open blank, because guessing one of several dates would lie.
    setStart(distinct === 1 ? aggregate.start : '');
    setEnd(distinct === 1 ? aggregate.end : '');
    setOpen((o) => !o);
  };

  // Same flip RowMenu uses: once the panel has rendered, if it spills past the viewport
  // bottom (the 🛠 of the LAST work package opens near the fold) it goes above the
  // button — or clamps — instead of hiding its buttons off-screen.
  useLayoutEffect(() => {
    if (!open) return;
    const pop = popRef.current, r = btnRectRef.current;
    if (!pop || !r) return;
    const h = pop.offsetHeight;
    const { vh } = localViewport();
    let top = r.bottom + 4;
    if (top + h > vh - 8) {
      const above = r.top - h - 4;
      top = above >= 8 ? above : Math.max(8, vh - h - 8);
    }
    setPos((p) => (p.top === top ? p : { ...p, top }));
  }, [open]);

  const boundsText = (s: string, e: string) =>
    s && e ? `${fmtMD(s)} → ${fmtMD(e)}` : e ? `by ${fmtMD(e)}` : `starts ${fmtMD(s)}`;

  // Per-scope state above the pickers, mirroring FieldMeasurePopover's status line.
  const status = distinct === 0 ? <>No dates</>
    : distinct === 1 ? <>Current: <b>{boundsText(aggregate.start, aggregate.end)}</b> — Apply overwrites</>
      : <>⚠ Items here have <b>{distinct} different windows</b> — Apply overwrites all.</>;

  const canApply = n > 0 && (!!start || !!end);
  // Bulk edits write the WORKING DRAFT — they are not published (Save to report does
  // that) and they are not what ↩ Undo reverts (that one covers the last save), so the
  // confirm says exactly this much and no more.
  const scope = scopeName ?? 'this scope';
  const draftNote = `\n\nThis writes the working draft — ${mode === 'toolbar' ? 'the packages show' : 'the package shows'} as unsaved until saved to report.`;
  const apply = () => {
    if (!canApply) return;
    const overwrite = distinct > 0 ? `\n\nThis overwrites the existing dates${distinct > 1 ? ` on all ${distinct} different windows` : ''}.` : '';
    if (window.confirm(`Set the installation schedule of ${n} item${n === 1 ? '' : 's'} in ${scope} to "${installWindowSummary(start, end)}"?${overwrite}${draftNote}`)) {
      onApply({ start, end });
      setOpen(false);
    }
  };
  const clear = () => {
    if (distinct === 0) return;
    if (window.confirm(`Clear the installation schedule from ${n} item${n === 1 ? '' : 's'} in ${scope}?${draftNote}`)) {
      onClear();
      setOpen(false);
    }
  };

  // The toolbar pill shares its 34px height with the other "Set across the project"
  // popovers (see toolBtn's comment in MaterialListToolbar) — same style StagePopover
  // uses for its own toolbar mode.
  const toolbar = mode === 'toolbar';
  const toolbarStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--hairline)', borderRadius: 'var(--radius-lg)',
    background: 'var(--canvas)', color: 'var(--ink)', font: 'var(--text-body)', fontWeight: 500, whiteSpace: 'nowrap',
  };
  const title = toolbar ? 'Set the installation schedule across the project' : 'Set installation schedule';

  return (
    <span ref={ref} style={{ display: 'inline-flex' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={title}
        aria-expanded={open}
        title={title}
        className={toolbar ? 'btn' : `icon-btn${open ? ' is-on' : ''}`}
        style={toolbar ? toolbarStyle : undefined}
      >
        {toolbar ? '🛠 Installation schedule' : '🛠'}
      </button>
      {open && createPortal(
        // Portaled to <body> for the same reason as StagePopover: the sticky column
        // header this button lives in is its own stacking context, so a `position: fixed`
        // child painted inside it is only stacked against ITS siblings — the next
        // package's sticky header painted right over it.
        <div ref={popRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 80, width: 300, background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-pop)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ font: 'var(--text-caption)', fontWeight: 600, color: 'var(--muted)' }}>
            {toolbar ? 'Installation schedule for the project' : 'Installation schedule for this scope'}
          </div>

          <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>{status}</div>

          <InstallWindowFields start={start} end={end} onChange={(v) => { setStart(v.start); setEnd(v.end); }} />

          <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
            {note} A plan only — it never marks anything installed.
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            {distinct > 0 && <Button variant="ghost" size="sm" onClick={clear} style={{ marginRight: 'auto' }}>✕ Clear</Button>}
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!canApply} onClick={apply}>Apply</Button>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
