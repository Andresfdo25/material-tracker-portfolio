// cells.tsx — the editable cell itself, its read-only twin, and the column-header
// wrapper. Extracted verbatim from MaterialListScreen (SPEC-hardening §4).
import { useEffect, useRef, useState } from 'react';
import { cellInputStyle, focusCellBelow } from './cellStyles';

/** Column header: label + its bulk-edit popover icon, kept on one baseline. */
export function Hdr({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {label}
      {children}
    </span>
  );
}

export function EditCell({
  value, onCommit, type = 'text', align, mono, driver, placeholder, width, multiline, newlines, cellKey, ink,
}: {
  value: string | number; onCommit: (v: string) => void; type?: string; align?: 'left' | 'right';
  mono?: boolean; driver?: boolean; placeholder?: string; width?: string | number;
  /** Text colour override — the promised ship date reads red once it has passed. */
  ink?: string;
  /** Fixed-width columns (Description, PO#, Notes): wrap instead of overflowing — the row grows. */
  multiline?: boolean;
  /** Shift+Enter / Alt+Enter insert a line break instead of committing (Description, Notes). */
  newlines?: boolean;
  /** Column id for Enter-to-jump-down navigation (data-cell attribute). */
  cellKey?: string;
}) {
  const [v, setV] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const cancelled = useRef(false); // Escape pressed — the pending blur must NOT commit
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const el = taRef.current;
    if (!multiline || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [v, multiline]);
  const focus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'var(--info-border)';
    e.target.style.boxShadow = 'var(--shadow-focus)';
  };
  const blur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'transparent';
    e.target.style.boxShadow = 'none';
    if (cancelled.current) { cancelled.current = false; return; }
    onCommit(String(v));
  };
  const cancelEdit = (el: HTMLInputElement | HTMLTextAreaElement) => {
    cancelled.current = true;
    setV(value); // revert to the last committed value
    el.blur();
  };
  const hoverIn = (e: React.MouseEvent<HTMLElement>) => {
    if (document.activeElement !== e.target) e.currentTarget.style.borderColor = 'var(--hairline)';
  };
  const hoverOut = (e: React.MouseEvent<HTMLElement>) => {
    if (document.activeElement !== e.target) e.currentTarget.style.borderColor = 'transparent';
  };
  if (multiline) {
    return (
      <textarea
        ref={taRef}
        value={v ?? ''}
        rows={1}
        placeholder={placeholder}
        data-cell={cellKey}
        onChange={(e) => setV(e.target.value)}
        onFocus={focus}
        onBlur={blur}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { cancelEdit(e.target as HTMLTextAreaElement); return; }
          if (e.key !== 'Enter') return;
          if (newlines && e.shiftKey) return; // native line break
          if (newlines && e.altKey) {
            // Alt+Enter does nothing natively in a textarea — insert the break by hand.
            e.preventDefault();
            const el = e.target as HTMLTextAreaElement;
            const { selectionStart, selectionEnd } = el;
            const s = String(v ?? '');
            setV(s.slice(0, selectionStart) + '\n' + s.slice(selectionEnd));
            setTimeout(() => { el.selectionStart = el.selectionEnd = selectionStart + 1; });
            return;
          }
          e.preventDefault();
          const el = e.target as HTMLTextAreaElement;
          if (!focusCellBelow(el, cellKey)) el.blur(); // plain Enter commits (+ jumps down)
        }}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        style={cellInputStyle({
          textAlign: align || 'left', width: '100%', display: 'block',
          font: mono ? 'var(--text-mono)' : 'var(--text-body)', lineHeight: 1.4,
          background: driver ? 'var(--input-highlight)' : 'transparent',
          resize: 'none', overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
        })}
      />
    );
  }
  return (
    <input
      type={type}
      value={v ?? ''}
      placeholder={placeholder}
      data-cell={cellKey}
      onChange={(e) => setV(e.target.value)}
      onFocus={focus}
      onBlur={blur}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { cancelEdit(e.target as HTMLInputElement); return; }
        if (e.key === 'Enter') {
          const el = e.target as HTMLInputElement;
          if (!focusCellBelow(el, cellKey)) el.blur();
        }
      }}
      onMouseEnter={hoverIn}
      onMouseLeave={hoverOut}
      style={cellInputStyle({
        textAlign: align || 'left', width: width || '100%',
        font: mono ? 'var(--text-mono)' : 'var(--text-body)',
        background: driver ? 'var(--input-highlight)' : 'transparent',
        ...(ink ? { color: ink, fontWeight: 700 } : {}),
      })}
    />
  );
}

/** Read-only cell text — used when viewing an archived (completed) project, and for the
 * cells an OFCI row turns off (SPEC-delivery-watch §8), which is what `title` is for:
 * a disabled cell has to be able to say WHY it doesn't take an edit. */
export function RoText({ children, mono, muted, title, ink }: { children: React.ReactNode; mono?: boolean; muted?: boolean; title?: string; ink?: string }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-block', padding: '5px 7px', font: mono ? 'var(--text-mono)' : 'var(--text-body)',
        color: ink || (muted ? 'var(--muted)' : 'var(--ink)'), fontWeight: ink ? 700 : undefined,
        whiteSpace: 'pre-wrap', cursor: title ? 'help' : undefined,
      }}
    >
      {children}
    </span>
  );
}
