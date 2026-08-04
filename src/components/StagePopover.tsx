// StagePopover.tsx — moves material through the install cycle (warehouse → jobsite →
// installed) in one shot, with a single date. Two modes:
//   'toolbar' — "🔩 Delivery / Installation" pill: pick the work package right here and
//               register the stage of the whole package without scrolling to its table.
//               Sibling of FieldMeasurePopover.
//   'header'  — the 🔩 icon in the "Delivery / Installation" column header: applies to
//               the selected rows, or to the whole package when nothing is selected.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { itemStage, logDrivesStage, prefixCompare, STAGE_META } from '../store/logic';
import type { ItemStage, MaterialItem, WorkPackage } from '../store/types';
import { Button } from './ds/Button';
import { Select } from './ds/Select';
import { anchorBelow, localRect, localViewport } from './uiScale';

interface StageChoice {
  value: ItemStage;
  label: string;
  hint: string;
}
const CHOICES: StageChoice[] = [
  // The way BACK. The popover used to start at 🏭, so the only surface that could undo a
  // receipt in bulk was the row checkbox, one item at a time — the same one-way door the
  // modal's own buttons had before lote 43. Un-receiving cascades (see applyItemPatch), so
  // the hint says what goes with it and `apply` spells it out in the confirm.
  { value: 'pending', label: '🚚 Not received yet', hint: 'Undo the receipt — the material is not here. On-site and installed reset with it, and any installation entries are dropped.' },
  { value: 'warehouse', label: '🏭 In warehouse', hint: 'Received — sitting in the warehouse, not yet released to the jobsite.' },
  { value: 'on-site', label: '📍 On site', hint: 'Released from the warehouse and delivered to the jobsite, pending installation.' },
  { value: 'installed', label: '🔩 Installed', hint: 'Installed — this closes the item lifecycle.' },
];

export function StagePopover(props: {
  mode: 'toolbar' | 'header';
  /** header mode: how many items the apply will hit, and the scope sentence. */
  count?: number;
  /** header mode: of those, how many follow their delivery log and will be skipped
   * (`logDrivesStage`). Toolbar mode counts them itself off the package it picks. */
  skipped?: number;
  note?: string;
  /** header mode: this package is supply only, so 🔩 Installed isn't on the menu.
   * In toolbar mode the scope comes from the package picked inside the popover. */
  supplyOnly?: boolean;
  /** toolbar mode: the PROJECT is supply only — the fallback for packages that carry no
   * flag of their own (closesAtSite: package flag wins, project's is the default). It
   * also drives the pill label: a supply-only project gets "📍 Delivery only". */
  projectSupplyOnly?: boolean;
  /** toolbar mode: pick the package here. */
  packages?: WorkPackage[];
  itemsOf?: (wpId: string) => MaterialItem[];
  /** header mode gets (stage, date); toolbar mode also gets the target ids. */
  onApply: (stage: ItemStage, date: string, ids?: string[]) => void;
}) {
  const { mode, count = 0, note, packages, itemsOf, onApply } = props;
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<ItemStage>('installed');
  const [date, setDate] = useState('');
  const [wpId, setWpId] = useState('');
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

  // The panel is `position: fixed` at the button's rect captured on open — correct at
  // that instant, but scrolling the page (or the table's own scroll container) moves the
  // button while the panel stays put, so it ends up floating over whatever is now behind
  // it instead of its trigger. Closing on scroll is the same call every popover in this
  // repo used to duck: simpler and less fragile than tracking the button live. `capture:
  // true` so it also catches the table wrapper's own internal scroll, not just the window's.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('scroll', close, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', close, { capture: true });
  }, [open]);

  const toolbar = mode === 'toolbar';
  const sorted = useMemo(() => [...(packages ?? [])].sort((a, b) => prefixCompare(a.prefix, b.prefix)), [packages]);
  const selItems = toolbar && wpId && itemsOf ? itemsOf(wpId) : [];
  const targetCount = toolbar ? selItems.length : count;
  const sel = sorted.find((p) => p.id === wpId);

  /** "3 🏭 · 1 📍 · 1 🔩" — where a package's material currently stands. */
  const stageSummary = (items: MaterialItem[]) => {
    const t: Record<ItemStage, number> = { pending: 0, warehouse: 0, 'on-site': 0, installed: 0 };
    items.forEach((i) => { t[itemStage(i)]++; });
    return (['warehouse', 'on-site', 'installed', 'pending'] as ItemStage[])
      .filter((s) => t[s] > 0)
      .map((s) => `${t[s]} ${STAGE_META[s].icon}`)
      .join(' · ');
  };

  const toggle = () => {
    btnRectRef.current = localRect(btnRef.current!);
    setPos(anchorBelow(btnRef.current!, toolbar ? 350 : 320));
    setDate('');
    if (toolbar) setWpId('');
    setOpen((o) => !o);
  };

  // Same flip RowMenu uses: once the panel has rendered, if it spills past the viewport
  // bottom (the 🔩 of the LAST work package opens near the fold) it goes above the
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
    // wpId/stage re-shape the panel (toolbar dropdown, per-stage hint), so the flip
    // re-measures when they change too — not only on open.
  }, [open, wpId, stage]);

  // Supply only: our scope ends at the jobsite, so the menu shrinks to the delivery
  // moves — 🔩 Installed isn't offered (it never applies) and neither is 🏭 In warehouse:
  // warehouse / from-stock is a rare detour that lives in the ITEM modal only, never in
  // a global setter (PM rule). The on-site hint changes to say it closes the lifecycle.
  // Toolbar mode reads the scope off the package chosen in the dropdown — with the
  // project's flag as the fallback, same as closesAtSite — so the menu re-shapes as you
  // switch packages.
  const supplyOnly = toolbar
    ? !!(sel ? (sel.supplyOnly ?? props.projectSupplyOnly) : props.projectSupplyOnly)
    : !!props.supplyOnly;
  const choices = supplyOnly ? CHOICES.filter((c) => c.value !== 'installed' && c.value !== 'warehouse') : CHOICES;
  const chosen = choices.find((c) => c.value === stage) ?? choices[choices.length - 1];
  const hint = supplyOnly && chosen.value === 'on-site'
    ? 'Delivered to the jobsite — supply only, so this closes the item lifecycle.'
    : chosen.hint;
  // Items whose delivery log records movements follow the log, not this popover — the
  // write would be refused by stagePatch, so it is counted here and said out loud
  // instead of looking like it worked. (This is the same rule the modal enforces by
  // hiding its stage buttons; before the consolidation these two popovers ignored it.)
  const skipped = toolbar ? selItems.filter((i) => logDrivesStage(i.deliveries)).length : (props.skipped ?? 0);
  const writable = Math.max(0, targetCount - skipped);
  const canApply = writable > 0 && (!toolbar || !!sel);
  const apply = () => {
    if (!canApply) return;
    const scope = toolbar ? `"${sel!.label}"` : 'this scope';
    const skipNote = skipped > 0 ? `\n\n${skipped} item${skipped === 1 ? '' : 's'} follow${skipped === 1 ? 's' : ''} its delivery log and will be left alone.` : '';
    // Going back to 🚚 is the only choice here that DESTROYS something (the received date,
    // the on-site and installed marks, the installation entries), and in bulk. Say it.
    const undoNote = chosen.value === 'pending'
      ? '\n\nThis undoes the receipt: the received date is cleared, and anything marked on site or installed reverts with it — including any installation entries logged on those items.'
      : '';
    if (window.confirm(`Mark ${writable} item${writable === 1 ? '' : 's'} in ${scope} as "${chosen.label}"?${skipNote}${undoNote}`)) {
      onApply(chosen.value, date, toolbar ? selItems.map((i) => i.id) : undefined);
      setOpen(false);
    }
  };

  const toolbarStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--hairline)', borderRadius: 'var(--radius-lg)',
    background: 'var(--canvas)', color: 'var(--ink)', font: 'var(--text-body)', fontWeight: 500, whiteSpace: 'nowrap',
  };
  // The toolbar pill's label follows the PROJECT, not the package picked inside: in a
  // supply-only project there is no installation half at all, so the pill says so.
  const title = toolbar
    ? props.projectSupplyOnly ? 'Register Delivery for a work package' : 'Register Delivery / Installation for a work package'
    : supplyOnly ? 'Set delivery stage' : 'Set delivery / installation stage';

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
        {toolbar ? (props.projectSupplyOnly ? '📍 Delivery only' : '🔩 Delivery / Installation') : supplyOnly ? '📍' : '🔩'}
      </button>
      {open && createPortal(
        // Portaled to <body>, same reasoning as RowMenu (CLAUDE.md trampa): the sticky
        // column header this button lives in (`th` — position: sticky, its own z-index)
        // is a stacking context, so a `position: fixed` child painted inside it is only
        // ever stacked against ITS siblings, not globally — the next package's sticky
        // header (same z-index, later in the DOM) painted right over it. Escaping to
        // <body> puts the panel in the root stacking context where its own z-index rules.
        <div ref={popRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 80, width: toolbar ? 330 : 300, background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-pop)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ font: 'var(--text-caption)', fontWeight: 600, color: 'var(--muted)' }}>
            {toolbar ? 'Which work package are you registering?' : 'Set stage for this scope'}
          </div>

          {toolbar && (
            <Select
              value={wpId}
              onChange={(e) => setWpId(e.target.value)}
              placeholder="— select work package —"
              style={{ height: 38 }}
              autoFocus
              options={sorted.map((p) => {
                const its = itemsOf ? itemsOf(p.id) : [];
                const sum = stageSummary(its);
                return { value: p.id, label: `${p.label}${sum ? ` — ${sum}` : ''}` };
              })}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {choices.map((c) => {
              const on = chosen.value === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  className="chip-btn"
                  onClick={() => setStage(c.value)}
                  style={{
                    textAlign: 'left', cursor: 'pointer', padding: '7px 9px', borderRadius: 'var(--radius-sm)',
                    borderWidth: 2, borderStyle: 'solid',
                    borderColor: on ? 'var(--status-installed-ink)' : 'var(--hairline)',
                    background: on ? 'var(--status-installed)' : 'var(--canvas)',
                    color: on ? 'var(--status-installed-ink)' : 'var(--ink)',
                    font: 'var(--text-body)', fontWeight: on ? 700 : 400,
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>{hint}</div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, font: 'var(--text-caption)', color: 'var(--body)' }}>
            Date (blank = keep the stamp it has, or today)
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ height: 36, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', font: 'var(--text-mono)', color: 'var(--ink)', background: 'var(--canvas)' }}
            />
          </label>

          <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
            {toolbar
              ? (sel ? `Applies to all ${targetCount} item${targetCount === 1 ? '' : 's'} in this package.` : 'Pick a package to see how many items it covers.')
              : note}
            {' '}Items with an open backorder keep their lock.
          </div>
          {skipped > 0 && (
            <div style={{ font: 'var(--text-caption)', color: 'var(--status-order-soon-ink)' }}>
              🚚 {skipped === 1 ? '1 of them follows its' : `${skipped} of them follow their`} delivery log and will be skipped — set those from Breakdown Delivery.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!canApply} onClick={apply}>Apply</Button>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
