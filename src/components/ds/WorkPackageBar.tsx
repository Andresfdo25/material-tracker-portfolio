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
  statusChips?: StatusChip[];
  /** Multi-select — clicking a chip toggles that status in/out of this package's filter. */
  activeStatuses?: ItemStatus[];
  onStatusFilter?: (s: ItemStatus) => void;
}

function ArrowButton({ dir, onClick, disabled }: { dir: '↑' | '↓'; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="icon-btn icon-btn--lg"
      onClick={onClick}
      disabled={disabled}
      title={dir === '↑' ? 'Move this work package up' : 'Move this work package down'}
      aria-label={dir === '↑' ? 'Move work package up' : 'Move work package down'}
    >
      {dir}
    </button>
  );
}

/** Reordenar el paquete: el par ↑ ↓ (lote 49, pedido del usuario).
 *
 * Vivía pegado al borde izquierdo de la barra, apilado en vertical y a tamaño reducido para
 * caber ahí. Se mudó al grupo de acciones de la derecha —entre Undo y 🗑— porque es una acción
 * ocasional y estaba ocupando el lugar de más peso visual de la fila, justo antes del nombre
 * del paquete. Con el espacio del grupo de acciones ya no hace falta apretarlo: van en
 * horizontal y al mismo tamaño que el 🗑 con el que ahora comparten renglón.
 *
 * Vive acá y no en la pantalla para que el vocabulario de la barra de paquete siga junto. */
export function PackageMoveButtons({ onMoveUp, onMoveDown, upDisabled, downDisabled }: {
  onMoveUp: () => void;
  onMoveDown: () => void;
  upDisabled?: boolean;
  downDisabled?: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      <ArrowButton dir="↑" onClick={onMoveUp} disabled={upDisabled} />
      <ArrowButton dir="↓" onClick={onMoveDown} disabled={downDisabled} />
    </span>
  );
}

/**
 * WorkPackageBar — the collapsible package header. Carries the yellow/green save-state
 * dot, the CSI work-package label + rename control, icon-only per-package status
 * filters, a Save-to-report slot, and the state caption. Las flechas de reordenar ya no
 * están acá: viajan dentro de `actions` (ver `PackageMoveButtons`).
 */
export function WorkPackageBar({
  label, dirty = false, collapsed = false, stateText, actions, renameControl, onToggle,
  statusChips, activeStatuses, onStatusFilter,
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
        className="icon-btn icon-btn--bare"
        onClick={onToggle}
        title={collapsed ? 'Expand this work package' : 'Collapse this work package'}
        aria-label="Collapse / expand"
        aria-expanded={!collapsed}
        style={{ fontSize: 14, minWidth: 26, minHeight: 26 }}
      >
        {collapsed ? '▸' : '▾'}
      </button>
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
                className="chip-btn"
                aria-pressed={active}
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
      {/* A pill, not loose text (lote 67): the save state is the only thing on this bar
          that changes on its own, and sitting at the far right, gray, at 14px, it read
          like the row's footnote. The dot on the left stays where it is — with eight
          packages open, that column of dots is the fast way to see which carry a draft
          without reading a single word. */}
      {stateText && (
        <span className={`state-chip state-chip--${dirty ? 'draft' : 'saved'}`}>{stateText}</span>
      )}
      {actions && <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center' }}>{actions}</span>}
    </div>
  );
}
