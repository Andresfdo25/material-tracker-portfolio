// cellStyles.ts — the shared look and keyboard behavior of a grid cell. Kept apart from
// cells.tsx so that file exports components only (fast-refresh stays happy).
import type { CSSProperties } from 'react';

/* Sticky within each package's scroll wrapper (72vh max) — solid background and inset
 * shadows instead of borders (collapse-borders drop when sticking): bottom line +
 * vertical separators between header cells. */
export const th: CSSProperties = {
  textAlign: 'left', padding: '7px 10px', font: 'var(--text-caption)',
  color: 'var(--muted)', fontWeight: 600,
  boxShadow: 'inset -1px 0 0 var(--hairline), inset 0 -1px 0 var(--hairline)',
  position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface-soft)',
};
export const td: CSSProperties = {
  padding: '4px 10px', borderBottom: '1px solid var(--hairline)', verticalAlign: 'middle',
  font: 'var(--text-mono-sm)', color: 'var(--ink)', overflowWrap: 'break-word',
};

/** The 🕒 "set to today" shortcut sitting next to a date cell. */
export const todayBtn: CSSProperties = {
  flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer',
  fontSize: 13, lineHeight: 1, padding: '2px 2px', borderRadius: 'var(--radius-sm)',
};

export function cellInputStyle(extra: CSSProperties): CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box', font: 'inherit', color: 'var(--ink)',
    background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', borderRadius: 'var(--radius-sm)',
    padding: '5px 7px', outline: 'none', transition: 'border-color 120ms ease, box-shadow 120ms ease',
    ...extra,
  };
}

/** Excel-style flow: focusing the same column in the next row commits this cell (blur)
 * and keeps the keyboard on the data. Returns false when there is no row below. */
export function focusCellBelow(el: HTMLElement, cellKey?: string): boolean {
  if (!cellKey) return false;
  const below = el.closest('tr')?.nextElementSibling?.querySelector<HTMLElement>(`[data-cell="${cellKey}"]`);
  if (!below) return false;
  below.focus();
  if (below instanceof HTMLInputElement || below instanceof HTMLTextAreaElement) below.select();
  return true;
}
