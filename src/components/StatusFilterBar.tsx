// StatusFilterBar.tsx — the quick filter on the navy toolbar band: every status badge is
// a click-to-filter toggle. Multi-select — clicking adds/removes a status and the table
// shows the union. Its own text runs light because it sits on the dark band.
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ font: 'var(--text-caption)', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>Filter:</span>
      {FILTERABLE.map((s) => {
        const active = filter.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onToggle(s)}
            title={active ? 'Remove this status from the filter' : 'Add this status to the filter (multi-select)'}
            style={{
              border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
              opacity: filter.length && !active ? 0.55 : 1,
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
          onClick={onToggleLate}
          title={lateOnly
            ? 'Show every item again, not just the late deliveries'
            : 'Only items whose promised ship/delivery date has passed — narrows whatever the badges above already select'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            borderWidth: 2, borderStyle: 'solid', borderColor: lateOnly ? 'var(--info-border)' : 'rgba(255,255,255,0.4)',
            borderRadius: 'var(--radius-pill)', padding: '3px 11px',
            background: lateOnly ? 'var(--status-order-now)' : 'transparent',
            color: lateOnly ? 'var(--status-order-now-ink)' : 'rgba(255,255,255,0.9)',
            font: 'var(--text-caption)', fontWeight: 700, letterSpacing: 0.3,
          }}
        >
          ⏰ LATE <span style={{ font: 'var(--text-mono-sm)', fontWeight: 700 }}>{lateCount}</span>
        </button>
      )}
      {(filter.length > 0 || lateOnly) && (
        <Button variant="ghost" size="sm" onClick={onClear} style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.85)' }}>✕ Clear filters</Button>
      )}
    </div>
  );
}
