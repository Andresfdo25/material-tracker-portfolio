import type { ReactNode } from 'react';
import type { ItemStatus } from '../../store/types';

export interface StatusBadgeProps {
  status?: ItemStatus;
  solid?: boolean;
  dot?: boolean;
  /** Filter-chip variant (Material List top bar): bigger pill with the item count inside. */
  big?: boolean;
  count?: number;
  children?: ReactNode;
}

const STATUS: Record<ItemStatus, { label: string; fill: string; ink: string; dot: string }> = {
  'order-now': { label: 'ORDER NOW', fill: 'var(--status-order-now)', ink: 'var(--status-order-now-ink)', dot: '#d84343' },
  'order-soon': { label: 'Order soon', fill: 'var(--status-order-soon)', ink: 'var(--status-order-soon-ink)', dot: '#e08a1e' },
  ordered: { label: 'Ordered', fill: 'var(--status-ordered)', ink: 'var(--status-ordered-ink)', dot: '#5a8a2a' },
  partial: { label: 'Partially Delivered', fill: 'var(--status-partial)', ink: 'var(--status-partial-ink)', dot: '#d97a1e' },
  // "Received" (not "Delivered / In"): with INSTALLED in play, "delivered" was ambiguous
  // — delivered by the vendor, or delivered to the jobsite? The PDF keeps the old label,
  // which is the wording the GC/client already knows from the Excel template.
  delivered: { label: 'Received', fill: 'var(--status-ordered)', ink: 'var(--status-ordered-ink)', dot: '#5a8a2a' },
  // Terminal badge of a supply-only package: the material reached the jobsite and our
  // scope ends there. Supply-AND-install items on site keep reading "Received" + 📍.
  'on-site': { label: 'On Site', fill: 'var(--status-on-site)', ink: 'var(--status-on-site-ink)', dot: '#2a8a6a' },
  installed: { label: 'Installed', fill: 'var(--status-installed)', ink: 'var(--status-installed-ink)', dot: '#2a8a80' },
  'needs-data': { label: 'Needs data', fill: 'var(--status-needs-data)', ink: 'var(--status-needs-data-ink)', dot: '#9a9484' },
  planned: { label: 'Planned', fill: 'var(--status-planned)', ink: 'var(--status-planned-ink)', dot: '#9297a0' },
  na: { label: 'N/A', fill: 'var(--status-na)', ink: 'var(--status-na-ink)', dot: '#7a879c' },
};

/**
 * StatusBadge — the semaphore. This is the product's signature primitive: every item
 * resolves to exactly one status via the buy-by cascade.
 */
export function StatusBadge({ status = 'planned', solid = false, dot = true, big = false, count, children }: StatusBadgeProps) {
  const s = STATUS[status] || STATUS.planned;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-xs)',
        font: 'var(--text-caption)',
        fontSize: big ? 13 : undefined,
        fontWeight: 600,
        color: s.ink,
        background: solid ? s.fill : `color-mix(in srgb, ${s.fill} 45%, white)`,
        padding: big ? '6px 14px' : '4px 10px',
        borderRadius: 'var(--radius-md)',
        border: solid ? 'none' : `1px solid color-mix(in srgb, ${s.fill} 70%, white)`,
        whiteSpace: 'nowrap',
      }}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />}
      {children || s.label}
      {count != null && (
        <span style={{ font: '700 21px/1 var(--font-text)', fontVariantNumeric: 'tabular-nums', marginLeft: 4 }}>{count}</span>
      )}
    </span>
  );
}
