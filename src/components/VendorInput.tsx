import { useApp } from '../store/useApp';

/** VendorInput — free-text field with an autocomplete dropdown of the project's
 * vendor catalog (see the single shared <datalist id="vendor-catalog-options">
 * rendered once by VendorDatalist in App.tsx). Pre-populates from materials imports
 * (manufacturer → vendor); stays editable and suggests catalog vendors when typed or
 * empty.
 *
 * There is no "+" button on the row any more (lote 48, pedido del usuario): one per row
 * meant a column of buttons competing with the data, for something that happens once in a
 * while. The catalog is now fed from the two places the PM is already looking — ⚙ Settings
 * & Catalogs, and the moment a name is typed that isn't in the base, which asks right
 * there. Saying no still keeps the typed name on the item: the catalog is a convenience,
 * never a gate. */
export function VendorInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const { db, actions } = useApp();

  const commit = (next: string) => {
    const name = next.trim();
    // Only ask when the PM actually typed something NEW. A plain blur, an Escape revert or
    // re-picking a catalog name are all no-ops and must stay silent — a confirm that fires
    // on every tab-out is worse than the button that was just removed.
    if (name && name !== value.trim() && !db.vendors.some((v) => v.toLowerCase() === name.toLowerCase())) {
      if (window.confirm(`"${name}" isn't in the vendor catalog yet. Add it, so it autocompletes on every other item?`)) {
        actions.addVendor(name);
      }
    }
    onCommit(next);
  };

  return (
    <input
      list="vendor-catalog-options"
      defaultValue={value}
      key={value}
      placeholder="Vendor"
      data-cell="vendor"
      onBlur={(e) => commit(e.target.value)}
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
