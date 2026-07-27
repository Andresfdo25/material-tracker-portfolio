// ManageColumnsMenu.tsx — "Manage Columns" for the Internal view. Toggles column
// visibility on the material grid; the choice persists in localStorage. Description
// and Status stay fixed — they're the spine of the table.
import { useEffect, useRef, useState } from 'react';
import { HIDEABLE_COLUMNS } from '../store/columns';
import { Button } from './ds/Button';

export function ManageColumnsMenu({ hidden, onToggle, onReset }: {
  hidden: Record<string, boolean>;
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const hiddenCount = HIDEABLE_COLUMNS.filter((c) => hidden[c.key]).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
        📊 Columns{hiddenCount > 0 ? ` (${HIDEABLE_COLUMNS.length - hiddenCount}/${HIDEABLE_COLUMNS.length})` : ''} ▾
      </Button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '110%', right: 0, zIndex: 50, width: 260,
            background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-pop)', padding: 12, display: 'flex', flexDirection: 'column', gap: 4,
          }}
        >
          <div style={{ font: 'var(--text-caption)', fontWeight: 600, color: 'var(--muted)', padding: '2px 6px 6px' }}>
            Visible columns (Internal view)
          </div>
          {HIDEABLE_COLUMNS.map((c) => (
            <label
              key={c.key}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', font: 'var(--text-body)', color: 'var(--ink)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <input type="checkbox" checked={!hidden[c.key]} onChange={() => onToggle(c.key)} />
              {c.label}
            </label>
          ))}
          <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 6, paddingTop: 8 }}>
            <Button variant="ghost" size="sm" onClick={onReset} style={{ padding: '4px 8px', color: 'var(--muted)' }}>↺ Show all</Button>
          </div>
        </div>
      )}
    </div>
  );
}
