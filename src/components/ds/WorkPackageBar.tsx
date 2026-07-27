import type { ReactNode } from 'react';
import type { ItemStatus } from '../../store/types';

/** Icon-only status chips on the package bar — same semaphore as the top filter bar,
 * but clicking one filters THIS package's table only. */
export interface StatusChip {
  status: ItemStatus;
  count: number;
}

const CHIP_ICON: Record<ItemStatus, { icon: string; label: string }> = {
  'order-now': { icon: '🔴', label: 'ORDER NOW' },
  'order-soon': { icon: '🟠', label: 'Order soon' },
  'needs-data': { icon: '❔', label: 'Needs data' },
  planned: { icon: '▫️', label: 'Planned' },
  ordered: { icon: '📦', label: 'Ordered' },
  partial: { icon: '🚚', label: 'Partially Delivered' },
  delivered: { icon: '✅', label: 'Received' },
  'on-site': { icon: '📍', label: 'On Site (supply only)' },
  installed: { icon: '🔩', label: 'Installed' },
  na: { icon: '⚪', label: 'N/A (Owner Furnished)' },
};

export interface WorkPackageBarProps {
  label: string;
  dirty?: boolean;
  collapsed?: boolean;
  stateText?: string;
  actions?: ReactNode;
  renameControl?: ReactNode;
  onToggle?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  moveUpDisabled?: boolean;
  moveDownDisabled?: boolean;
  statusChips?: StatusChip[];
  /** Multi-select — clicking a chip toggles that status in/out of this package's filter. */
  activeStatuses?: ItemStatus[];
  onStatusFilter?: (s: ItemStatus) => void;
}

function ArrowButton({ dir, onClick, disabled }: { dir: '↑' | '↓'; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === '↑' ? 'Move work package up' : 'Move work package down'}
      style={{
        background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--border-strong)' : 'var(--muted)', fontSize: 13, padding: '2px 3px', lineHeight: 1,
      }}
    >
      {dir}
    </button>
  );
}

/**
 * WorkPackageBar — the collapsible package header. Carries the yellow/green save-state
 * dot, the CSI work-package label + rename control, icon-only per-package status
 * filters, up/down reorder arrows, a Save-to-report slot, and the state caption.
 */
export function WorkPackageBar({
  label, dirty = false, collapsed = false, stateText, actions, renameControl, onToggle,
  onMoveUp, onMoveDown, moveUpDisabled, moveDownDisabled, statusChips, activeStatuses, onStatusFilter,
}: WorkPackageBarProps) {
  return (
    <div
      onClick={(e) => {
        // The whole title bar toggles collapse — except clicks on its interactive children.
        if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
        onToggle?.();
      }}
      title={onToggle ? (collapsed ? 'Click to expand this work package' : 'Click to collapse this work package') : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
        padding: 'var(--space-sm) var(--space-md)',
        background: 'var(--wp-bar)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--wp-bar-border)',
        borderRadius: 'var(--radius-md)',
        cursor: onToggle ? 'pointer' : 'default',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label="Collapse / expand"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 4, lineHeight: 1 }}
      >
        {collapsed ? '▸' : '▾'}
      </button>
      {(onMoveUp || onMoveDown) && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <ArrowButton dir="↑" onClick={onMoveUp} disabled={moveUpDisabled} />
          <ArrowButton dir="↓" onClick={onMoveDown} disabled={moveDownDisabled} />
        </span>
      )}
      <span
        title={dirty ? 'Unsaved changes — this package has edits not yet saved to the report' : 'All changes saved to the report'}
        style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, cursor: 'help', background: dirty ? '#f0b429' : 'var(--success-border)', boxShadow: dirty ? '0 0 0 3px color-mix(in srgb, #f0b429 25%, transparent)' : 'none' }}
      />
      <span style={{ font: 'var(--text-title-sm)', color: 'var(--ink)' }}>{label}</span>
      {renameControl && <span onClick={(e) => e.stopPropagation()}>{renameControl}</span>}
      {statusChips && statusChips.length > 0 && (
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {statusChips.map((chip) => {
            const meta = CHIP_ICON[chip.status];
            const active = !!activeStatuses?.includes(chip.status);
            return (
              <button
                key={chip.status}
                type="button"
                title={active ? `Remove ${meta.label} from this package's filter` : `Also show ${meta.label} rows in this package (multi-select)`}
                onClick={() => onStatusFilter?.(chip.status)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer',
                  font: 'var(--text-mono-sm)', fontWeight: 600, color: 'var(--body)',
                  padding: '2px 7px', borderRadius: 'var(--radius-pill)',
                  borderWidth: 1, borderStyle: 'solid',
                  borderColor: active ? 'var(--info-border)' : 'var(--hairline)',
                  background: active ? 'color-mix(in srgb, var(--info-border) 12%, white)' : 'var(--canvas)',
                  opacity: activeStatuses?.length && !active ? 0.45 : 1,
                }}
              >
                {meta.icon} {chip.count}
              </button>
            );
          })}
        </span>
      )}
      <span style={{ flex: 1 }} />
      {stateText && <span style={{ font: 'var(--text-caption)', color: dirty ? 'var(--wp-dirty-ink)' : 'var(--muted)' }}>{stateText}</span>}
      {actions && <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center' }}>{actions}</span>}
    </div>
  );
}
