// RowMenu.tsx — the ⋮ row-actions popover. Portaled to <body> with flip/clamp, because
// the table wrapper's overflow would clip it otherwise.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../store/useApp';
import { isOfci, prefixCompare } from '../../store/logic';
import type { MaterialItem, WorkPackage } from '../../store/types';
import { HIGHLIGHTS } from './highlights';

/** Width of the row-actions popover — also used to keep it inside the viewport. */
const MENU_POPOVER_W = 220;

export function RowMenu({ item, packages, onBreakdown, onBreakdownSubmittals }: { item: MaterialItem; packages: WorkPackage[]; onBreakdown: (id: string) => void; onBreakdownSubmittals: (id: string) => void }) {
  const { actions } = useApp();
  const ofci = isOfci(item.po);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRectRef = useRef<DOMRect | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      // The menu is portaled to <body>, so it's outside `ref` — check both.
      if (ref.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Position is captured once at open time; scrolling the page (or the table's own
  // scroll container) moves the button but not this fixed panel, so it drifts over
  // whatever's now behind it. Closing on scroll is simpler and less fragile than
  // tracking the button live — same fix as StagePopover / BulkSetPopover / FieldMeasurePopover.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('scroll', close, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', close, { capture: true });
  }, [open]);

  // The button sits in the row's leftmost column, so the menu hangs to the RIGHT of
  // it (anchoring right-edge would run it off the left of the screen), clamped so a
  // narrow viewport can't push it past the right edge either.
  const openMenu = () => {
    const r = btnRef.current!.getBoundingClientRect();
    btnRectRef.current = r;
    const left = Math.min(r.left, window.innerWidth - MENU_POPOVER_W - 8);
    setPos({ top: r.bottom + 4, left: Math.max(8, left) });
    setOpen((o) => !o);
  };

  // After the menu renders, flip it above the button (or clamp it) when it would
  // spill past the viewport bottom — the last rows of the last package used to clip.
  useLayoutEffect(() => {
    if (!open) return;
    const pop = popRef.current, r = btnRectRef.current;
    if (!pop || !r) return;
    const h = pop.offsetHeight;
    const vh = window.innerHeight;
    let top = r.bottom + 4;
    if (top + h > vh - 8) {
      const above = r.top - h - 4;
      top = above >= 8 ? above : Math.max(8, vh - h - 8);
    }
    setPos((p) => (p.top === top ? p : { ...p, top }));
  }, [open]);

  return (
    <span ref={ref} style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        aria-label="Row actions"
        style={{
          border: 'none', background: open ? 'var(--surface-soft)' : 'transparent', cursor: 'pointer',
          color: 'var(--muted)', fontSize: 16, lineHeight: 1, padding: '2px 6px', borderRadius: 'var(--radius-sm)',
        }}
      >
        ⋮
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 60, minWidth: MENU_POPOVER_W,
            maxHeight: 'calc(100vh - 16px)', overflowY: 'auto',
            background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-pop)', padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
          }}
        >
          <button
            type="button"
            title="Insert a copy right below — same spec data, fresh draft (no PO / delivery state)"
            onClick={() => { actions.duplicateItem(item.id); setOpen(false); }}
            style={{
              textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--ink)', font: 'var(--text-body)', padding: '7px 6px', borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            ⧉ Duplicate item
          </button>
          {/* OFCI has no delivery to break down and no submittal to chase — the modal it
              opens is the install one, and it says so (SPEC-delivery-watch §8). */}
          <button
            type="button"
            onClick={() => { onBreakdown(item.id); setOpen(false); }}
            style={{
              textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--ink)', font: 'var(--text-body)', padding: '7px 6px', borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {ofci ? '🔩 Installation…' : '🚚 Breakdown Delivery…'}
          </button>
          {!ofci && (
            <button
              type="button"
              onClick={() => { onBreakdownSubmittals(item.id); setOpen(false); }}
              style={{
                textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'var(--ink)', font: 'var(--text-body)', padding: '7px 6px', borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              🧾 Breakdown Submittals…
            </button>
          )}
          <div style={{ height: 1, background: 'var(--hairline)', margin: '2px 0' }} />
          <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', padding: '2px 4px' }}>Highlight row</div>
          <div style={{ display: 'flex', gap: 6, padding: '2px 4px 4px' }}>
            {HIGHLIGHTS.map((h) => {
              const on = item.highlight === h.key;
              return (
                <button
                  key={h.key}
                  type="button"
                  title={`Highlight ${h.label}`}
                  aria-label={`Highlight ${h.label}`}
                  onClick={() => { actions.editItem(item.id, { highlight: on ? '' : h.key }); setOpen(false); }}
                  style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', background: h.token, borderWidth: 2, borderStyle: 'solid', borderColor: on ? 'var(--ink)' : 'var(--hairline)' }}
                />
              );
            })}
            <button
              type="button"
              title="Clear highlight"
              aria-label="Clear highlight"
              onClick={() => { actions.editItem(item.id, { highlight: '' }); setOpen(false); }}
              style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', background: 'var(--canvas)', borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--hairline)', color: 'var(--muted)', fontSize: 13 }}
            >
              ✕
            </button>
          </div>
          <div style={{ height: 1, background: 'var(--hairline)', margin: '2px 0' }} />
          <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', padding: '2px 4px' }}>move to:</div>
          <select
            value={item.wpId}
            onChange={(e) => { actions.moveItem(item.id, e.target.value); setOpen(false); }}
            style={{
              width: '100%', height: 36, padding: '0 10px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', background: 'var(--canvas)',
            }}
          >
            {[...packages].sort((a, b) => prefixCompare(a.prefix, b.prefix)).map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { actions.deleteItem(item.id); setOpen(false); }}
            style={{
              textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--status-order-now-ink)', font: 'var(--text-body)', padding: '7px 6px', borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--status-order-now) 30%, white)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            🗑 Delete item
          </button>
        </div>,
        document.body,
      )}
    </span>
  );
}
