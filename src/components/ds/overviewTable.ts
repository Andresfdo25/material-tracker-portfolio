// overviewTable.ts — shared table chrome for Overview's own tables and the gauge modals
// in OverviewClockModals.tsx (lote 63). Split out of OverviewScreen.tsx because a file
// that exports a component AND plain constants trips the fast-refresh lint rule; the
// styling itself hasn't changed, only where it lives.
import type { CSSProperties } from 'react';

/* La caja de una tarjeta del tablero. `overflow` lo pisa quien necesite scroll. */
export const card: CSSProperties = { border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--canvas)' };

/* Shared table cells (both stage tables, Portfolio, Buy-By and the gauge modals). */
export const th: CSSProperties = { textAlign: 'right', padding: '9px 12px', font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--hairline)', whiteSpace: 'nowrap' };
export const thL: CSSProperties = { ...th, textAlign: 'left' };
export const td: CSSProperties = { textAlign: 'right', padding: '10px 12px', font: 'var(--text-mono)', color: 'var(--ink)', borderBottom: '1px solid var(--hairline)' };
export const tdL: CSSProperties = { ...td, textAlign: 'left', font: 'var(--text-body)' };
