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
            style={{
              display: 'flex', alignItems: 'center', gap: 8, border: 'none', cursor: 'pointer',
              padding: '10px 16px', borderRadius: 'var(--radius-sm)', font: 'var(--text-body)',
              fontWeight: on ? 600 : 400, background: on ? 'var(--surface-soft)' : 'transparent',
              color: on ? 'var(--ink)' : 'var(--body)',
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
