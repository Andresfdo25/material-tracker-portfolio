// RenamePackageControl.tsx — the ✎ next to a work-package title. The title is edited
// DIRECTLY in a text field, or picked from the catalog dropdown (which fills the field).
// A title that isn't in the catalog stays LOCAL to this project — it no longer asks to
// push it to the global catalog (batch 43). Same reason the custom-title fields left the
// Add-work-package and Quick-Add modals: a one-off title is never reused, so the prompt
// was an interruption with no good answer. The catalog is edited in Settings & Catalogs.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/useApp';
import { prefixCompare } from '../store/logic';
import type { WorkPackage } from '../store/types';
import { Button } from './ds/Button';

export function RenamePackageControl({ pkg }: { pkg: WorkPackage }) {
  const { db, actions } = useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(pkg.label);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openMenu = () => {
    setText(pkg.label);
    setOpen((o) => !o);
  };

  const apply = () => {
    const label = text.trim();
    if (!label) return;
    const catalogHit = db.catalog.find((w) => w.label === label);
    // Custom prefixes aren't cost codes — use the label itself as the package's key.
    if (catalogHit) actions.renamePackage(pkg.id, catalogHit.prefix, catalogHit.label);
    else actions.renamePackage(pkg.id, label, label);
    setOpen(false);
  };

  const inCatalog = db.catalog.some((w) => w.label === text.trim());

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className={`icon-btn icon-btn--bare${open ? ' is-on' : ''}`}
        title="Rename work package"
        aria-label="Rename work package"
        aria-expanded={open}
        onClick={openMenu}
      >
        ✎
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '130%', left: 0, zIndex: 60, width: 360,
            background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-pop)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <div style={{ font: 'var(--text-caption)', fontWeight: 600, color: 'var(--muted)' }}>Work package title</div>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
            placeholder="Edit the title directly…"
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box', height: 38, padding: '0 10px', borderRadius: 'var(--radius-sm)',
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', outline: 'none',
            }}
          />
          <select
            value={inCatalog ? text.trim() : ''}
            onChange={(e) => { if (e.target.value) setText(e.target.value); }}
            style={{
              width: '100%', height: 36, padding: '0 10px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', background: 'var(--canvas)', cursor: 'pointer',
            }}
          >
            <option value="">…or pick from the catalog</option>
            {[...db.catalog].sort((a, b) => prefixCompare(a.prefix, b.prefix)).map((w) => (
              <option key={w.prefix} value={w.label}>{w.label}</option>
            ))}
          </select>
          <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
            {inCatalog || !text.trim()
              ? 'Prefer the predefined catalog titles — items group best under them.'
              : 'Custom title — stays in this project. Add it in Settings & Catalogs if you will reuse it.'}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={apply} disabled={!text.trim()}>Apply</Button>
          </div>
        </div>
      )}
    </span>
  );
}
