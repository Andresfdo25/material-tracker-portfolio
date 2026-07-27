// cells.tsx — the editable cell itself, its read-only twin, and the column-header
// wrapper. Extracted verbatim from MaterialListScreen (SPEC-hardening §4).
import { useEffect, useRef, useState } from 'react';
import { cellInputStyle, focusCellBelow } from './cellStyles';

/* Two fixed slots. Reserving the TALLEST title (two lines of `--text-caption`, 14/1.35)
 * on every column is the whole point: with the icon inline, a one-line title and a
 * two-line one put their icons at different heights and the header row never lined up.
 * Fixed slots > `height: 100%` on the stack — a percentage height inside a `<th>` is
 * unreliable across browsers, and this row is `position: sticky`. */
const HDR_LABEL_H = 38;
const HDR_SLOT_H = 24;

/** Column header: the label on top, its bulk-edit popover on its own line underneath.
 * Every column uses this — including the ones with no popover — so all the titles start
 * on the same baseline and all the icons sit on the same row.
 *
 * **Siempre a la izquierda, sin excepción** (lote 49, pedido del usuario): antes había un
 * prop `align` y QTY / Lead salían a la derecha y Delivery al centro, siguiendo cada uno la
 * alineación de SUS datos. Leído de corrido, el renglón de títulos quedaba justificado y el
 * de iconos disparejo. Los datos conservan su alineación —los números siguen a la derecha,
 * que es donde se comparan—; el encabezado es otra cosa, es un índice, y un índice se lee en
 * una sola columna. El prop se eliminó para que no pueda volver a divergir. */
export function Hdr({ label, children }: {
  label: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', alignItems: 'flex-start' }}>
      <span style={{ minHeight: HDR_LABEL_H, display: 'block', width: '100%' }}>{label}</span>
      <span style={{ minHeight: HDR_SLOT_H, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{children}</span>
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
