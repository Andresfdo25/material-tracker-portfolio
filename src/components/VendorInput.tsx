import { useState } from 'react';
import { useApp } from '../store/useApp';
import { QuickAddVendorModal } from './QuickAddVendorModal';

/** VendorInput — free-text field with an autocomplete dropdown of the project's
 * vendor catalog (see the single shared <datalist id="vendor-catalog-options">
 * rendered once by VendorDatalist in App.tsx). Pre-populates from materials imports
 * (manufacturer → vendor); stays editable and suggests catalog vendors when typed or
 * empty. The "+" opens a minimal Quick Add so a new vendor is one step away and
 * immediately available everywhere, not just on this row. */
export function VendorInput({ value, onCommit, quickAdd = true }: { value: string; onCommit: (v: string) => void; quickAdd?: boolean }) {
  const { actions } = useApp();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <input
        list="vendor-catalog-options"
        defaultValue={value}
        key={value}
        placeholder="Vendor"
        data-cell="vendor"
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          const el = e.target as HTMLInputElement;
          if (e.key === 'Escape') {
            // Revert to the committed value — the blur then commits a no-op.
            el.value = value;
            el.blur();
            return;
          }
          if (e.key !== 'Enter') return;
          // Excel-style: Enter commits and drops to the vendor cell of the next row.
          const below = el.closest('tr')?.nextElementSibling?.querySelector<HTMLInputElement>('[data-cell="vendor"]');
          if (below) { below.focus(); below.select(); } else el.blur();
        }}
        style={{
          width: '100%', boxSizing: 'border-box', font: 'var(--text-body)', color: 'var(--ink)',
          background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', borderRadius: 'var(--radius-sm)',
          padding: '5px 7px', outline: 'none',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--info-border)'; e.target.style.boxShadow = 'var(--shadow-focus)'; }}
        onMouseEnter={(e) => { if (document.activeElement !== e.target) e.currentTarget.style.borderColor = 'var(--hairline)'; }}
        onMouseLeave={(e) => { if (document.activeElement !== e.target) e.currentTarget.style.borderColor = 'transparent'; }}
      />
      {quickAdd && (
        <button
          type="button"
          title="Quick add vendor"
          aria-label="Quick add vendor"
          onClick={() => setShowAdd(true)}
          style={{
            flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--muted)', fontSize: 14, lineHeight: 1, padding: '2px 4px', borderRadius: 'var(--radius-sm)',
          }}
        >
          ＋
        </button>
      )}
      {showAdd && (
        <QuickAddVendorModal
          onAdd={(name) => { actions.addVendor(name); onCommit(name); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </span>
  );
}

/** Rendered once at the app root; every VendorInput points its `list` attribute here. */
export function VendorDatalist() {
  const { db } = useApp();
  return (
    <datalist id="vendor-catalog-options">
      {db.vendors.map((v) => <option key={v} value={v} />)}
    </datalist>
  );
}
