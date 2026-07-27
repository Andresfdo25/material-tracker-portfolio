// BulkSetPopover.tsx — the little button that opens a one-field editor and writes the
// value to many items at once. (Was DateSetPopover; it long outgrew dates.)
//
// Two modes:
//   'toolbar' — a labelled pill on the toolbar band, project-wide scope.
//   'header'  — an icon inside a column header. THIS is where bulk editing lives now:
//               it targets the SELECTED rows when there's a selection, otherwise every
//               item in that package. The caller computes both the ids and the note, so
//               the popover itself stays scope-agnostic.
//
// Fixed positioning so the header variant escapes the material grid's scroll container.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ds/Button';
import { Select } from './ds/Select';

export type BulkInputType = 'date' | 'number' | 'vendor' | 'text' | 'select' | 'po';

export interface QuickValue {
  label: string;
  value: string;
  title: string;
}

export function BulkSetPopover({
  mode, title, label, note, confirmLabel = 'Apply', icon = '📅', inputType = 'date',
  placeholder, options, quickValues, quickApply = false, extraAction, onApply,
}: {
  mode: 'toolbar' | 'header';
  title: string;
  /** Toolbar mode only — the visible button text. */
  label?: string;
  note?: string;
  confirmLabel?: string;
  icon?: string;
  inputType?: BulkInputType;
  placeholder?: string;
  /** inputType 'select' — the choices. */
  options?: string[];
  /** One-tap shortcuts (PO#: From Stock / OFCI) — see `quickApply`. */
  quickValues?: QuickValue[];
  /** Shortcut taps apply immediately instead of pre-filling the field. */
  quickApply?: boolean;
  /** Extra button under the field, e.g. "Breakdown Submittals…" on the Submittal header. */
  extraAction?: { label: string; title?: string; onClick: () => void };
  onApply: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
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

  const toggle = () => {
    const r = btnRef.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 320)) });
    setValue('');
    setOpen((o) => !o);
  };

  const commit = () => {
    if (!value) return;
    onApply(value);
    setOpen(false);
  };

  const toolbarStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--hairline)', borderRadius: 'var(--radius-lg)',
    background: 'var(--canvas)', color: 'var(--ink)', font: 'var(--text-body)', fontWeight: 500, whiteSpace: 'nowrap',
  };
  const headerStyle: React.CSSProperties = {
    border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, lineHeight: 1, padding: '1px 3px', borderRadius: 'var(--radius-sm)',
  };
  const fieldStyle: React.CSSProperties = {
    height: 38, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)',
    font: 'var(--text-body)', color: 'var(--ink)', background: 'var(--canvas)', width: '100%', boxSizing: 'border-box',
  };

  return (
    <span ref={ref} style={{ display: 'inline-flex' }}>
      <button ref={btnRef} type="button" onClick={toggle} aria-label={title} title={title} style={mode === 'toolbar' ? toolbarStyle : headerStyle}>
        {mode === 'toolbar' ? `${icon} ${label ?? title}` : icon}
      </button>
      {open && createPortal(
        // Portaled to <body> — the column header this button lives in is a `position:
        // sticky` stacking context (its own z-index), so a `position: fixed` child
        // painted inside it only stacks against ITS siblings, not globally: the next
        // package's sticky header (same z-index, later in the DOM) paints right over it.
        // Same trap RowMenu already ducks — see CLAUDE.md.
        <div ref={popRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 80, width: 300, background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-pop)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ font: 'var(--text-caption)', fontWeight: 600, color: 'var(--muted)' }}>{title}</div>

          {inputType === 'select' ? (
            <Select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder ?? '— select —'}
              style={{ height: 38 }}
              options={options ?? []}
              autoFocus
            />
          ) : (
            <input
              type={inputType === 'number' ? 'number' : inputType === 'date' ? 'date' : 'text'}
              list={inputType === 'vendor' ? 'vendor-catalog-options' : undefined}
              value={value}
              min={inputType === 'number' ? 0 : undefined}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
              style={fieldStyle}
            />
          )}

          {/* Shortcuts. With `quickApply` a tap writes the value straight to the scope
              and closes — the value is fixed and visible on the button, so the extra
              Apply click was pure friction. Free text still goes through Apply. */}
          {quickValues && quickValues.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {quickValues.map((q) => {
                const on = !quickApply && value === q.value;
                return (
                  <button
                    key={q.value}
                    type="button"
                    title={q.title}
                    onClick={() => { if (quickApply) { onApply(q.value); setOpen(false); } else setValue(q.value); }}
                    style={{
                      flex: '1 1 auto', cursor: 'pointer', padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                      borderWidth: 2, borderStyle: 'solid', whiteSpace: 'nowrap',
                      borderColor: on ? 'var(--status-installed-ink)' : 'var(--hairline)',
                      background: on ? 'var(--status-installed)' : 'var(--canvas)',
                      color: on ? 'var(--status-installed-ink)' : 'var(--ink)',
                      font: 'var(--text-caption)', fontWeight: on ? 700 : 500,
                    }}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
          )}

          {note && <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>{note}</div>}

          {extraAction && (
            <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
              <Button variant="secondary" size="sm" title={extraAction.title} onClick={() => { setOpen(false); extraAction.onClick(); }}>
                {extraAction.label}
              </Button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!value} onClick={commit}>{confirmLabel}</Button>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
