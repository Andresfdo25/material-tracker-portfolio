// StatusFilterBar.tsx — the quick filter on the Material List's find bar: every status
// badge is a click-to-filter toggle. Multi-select — clicking adds/removes a status and the
// table shows the union.
//
// Since lote 67 it lives on the WHITE find bar, not the purple action band, so its text
// went back to normal ink. The reason for the move is the badges themselves: `StatusBadge`
// draws in the semaphore's pastels, which are tuned to read over `--canvas` — over the
// deep-purple band a pale pink or beige lands at a contrast that says nothing, in exactly
// the row that needs to be scanned at a glance.
import { FILTERABLE } from '../store/logic';
import type { ItemStatus } from '../store/types';
import { Button } from './ds/Button';
import { StatusBadge } from './ds/StatusBadge';

export function StatusFilterBar({ counts, filter, onToggle, onClear, lateCount, lateOnly, onToggleLate }: {
  counts: Record<ItemStatus, number>;
  filter: ItemStatus[];
  onToggle: (f: ItemStatus) => void;
  onClear: () => void;
  /** ⏰ Late is a different AXIS, not a status (SPEC-delivery-watch §5.1): a late item is
   * still ORDERED in the semaphore, so it gets its own chip and ANDs with the badges
   * above instead of joining their union. Hidden while nothing is late — unless it is
   * the filter currently on, or turning it back off would be impossible. */
  lateCount: number;
  lateOnly: boolean;
  onToggleLate: () => void;
}) {
  return (
    // Takes a whole row of the find bar to itself: ten badges are the widest block on the
    // screen, and sharing a row pushed the list tools to a third level. At full width they
    // fit on one line and scan at a glance, which is exactly what they're for.
    <div className="toolgroup toolgroup--on-canvas toolgroup--inline" style={{ flex: 1, minWidth: 0 }}>
      <span className="toolgroup__label">Status</span>
      <div className="toolgroup__row" style={{ gap: 4 }}>
        {FILTERABLE.map((s) => {
          const active = filter.includes(s);
          return (
            <button
              key={s}
              type="button"
              className="chip-btn"
              aria-pressed={active}
              onClick={() => onToggle(s)}
              title={active ? 'Remove this status from the filter' : 'Add this status to the filter (multi-select)'}
              style={{
                border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                // A status with no items stays in the row — the zero is information, it
                // says that bucket is clean — but it recedes: the row reads by what it has.
                opacity: (counts[s] ?? 0) === 0 ? 0.42 : filter.length && !active ? 0.55 : 1,
                outline: active ? '2px solid var(--info-border)' : 'none',
                outlineOffset: 1, borderRadius: 'var(--radius-md)',
              }}
            >
              <StatusBadge status={s} solid={active} big count={counts[s] ?? 0} />
            </button>
          );
        })}
        {(lateCount > 0 || lateOnly) && (
          <button
            type="button"
            className="chip-btn"
            aria-pressed={lateOnly}
            onClick={onToggleLate}
            title={lateOnly
              ? 'Show every item again, not just the late deliveries'
              : 'Only items whose promised ship/delivery date has passed — narrows whatever the badges already select'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              borderWidth: 2, borderStyle: 'solid', borderColor: lateOnly ? 'var(--info-border)' : 'var(--status-order-now-ink)',
              borderRadius: 'var(--radius-pill)', padding: '4px 12px',
              background: lateOnly ? 'var(--status-order-now)' : 'transparent',
              color: lateOnly ? 'var(--status-order-now-ink)' : 'var(--alert-ink)',
              font: 'var(--text-caption)', fontWeight: 700, letterSpacing: 0.3,
            }}
          >
            ⏰ LATE <span style={{ font: 'var(--text-mono)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{lateCount}</span>
          </button>
        )}
        {(filter.length > 0 || lateOnly) && (
          <Button variant="ghost" size="sm" onClick={onClear} style={{ padding: '5px 10px', color: 'var(--muted)' }}>✕ Clear filters</Button>
        )}
      </div>
    </div>
  );
}
