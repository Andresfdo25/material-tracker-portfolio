import type { ReactNode } from 'react';

export interface TabItem {
  key: string;
  label: string;
  icon?: ReactNode;
}

export interface TabBarProps {
  items: TabItem[];
  active: string;
  onSelect: (key: string) => void;
}

/** TabBar — the top horizontal nav. Reclaims the sidebar's width for the tables. */
export function TabBar({ items, active, onSelect }: TabBarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onSelect(it.key)}
            aria-current={on ? 'page' : undefined}
            // Only the ACTIVE tab paints its background inline; the inactive ones leave it
            // to `.tab-btn` so the hover fill in controls.css can land on them.
            className="tab-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, border: 'none', cursor: 'pointer',
              padding: '10px 16px', borderRadius: 'var(--radius-sm)', font: 'var(--text-body)',
              fontWeight: on ? 600 : 400, color: on ? 'var(--ink)' : 'var(--body)',
              ...(on ? { background: 'var(--surface-soft)', boxShadow: 'inset 0 -2px 0 var(--brand-slate)' } : {}),
            }}
          >
            {it.icon && <span>{it.icon}</span>}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
