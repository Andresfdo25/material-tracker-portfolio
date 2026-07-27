// QuickAddModal.tsx — paste-from-Excel quick capture. The PM almost always has the
// list in Excel (or an email/quote copied into Excel): up to 4 columns — Item, QTY,
// U/M, Manufacturer/Vendor — pasted here land as draft rows in a work package picked
// from the project's own sections or from the catalog. Columns are progressive: Item
// alone, Item+QTY, Item+QTY+U/M, or all 4.
import { useState } from 'react';
import { useApp } from '../store/useApp';
import { matchVendor, normalizeUm, normQty, prefixCompare } from '../store/logic';
import type { Project } from '../store/types';
import { Modal } from './ds/Modal';
import { Button } from './ds/Button';
import { Banner } from './ds/Banner';

interface ParsedRow {
  name: string;
  qty: number | string;
  um: string;
  vendor: string;
}

export function QuickAddModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { db, actions, nav } = useApp();
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');

  const pkgs = db.packages.filter((p) => p.projectId === project.id).sort((a, b) => prefixCompare(a.prefix, b.prefix));
  const catalog = [...db.catalog].sort((a, b) => prefixCompare(a.prefix, b.prefix));

  // Excel clipboard is tab-separated; a plain list of names (no tabs) also works.
  // Column order is progressive: Item · QTY · U/M · Manufacturer/Vendor.
  const rows: ParsedRow[] = text
    .split(/\r?\n/)
    .map((line) => {
      const parts = line.split('\t');
      const name = parts[0]?.trim() ?? '';
      if (!name) return null;
      return {
        name,
        qty: normQty(parts[1] ?? ''),
        um: normalizeUm(parts[2] ?? ''),
        vendor: matchVendor((parts[3] ?? '').trim(), db.vendors),
      };
    })
    .filter((r): r is ParsedRow => r !== null);

  const ready = rows.length > 0 && !!target;

  // The custom-title escape hatch went away with batch 43: a work package that isn't in
  // the catalog is created once, in Settings & Catalogs, not invented mid-paste with a
  // "add it to the global catalog?" prompt nobody had a good answer to.
  const confirm = () => {
    if (!ready) return;
    let prefix: string;
    let label: string;
    if (target.startsWith('pkg:')) {
      const pkg = pkgs.find((p) => p.id === target.slice(4))!;
      prefix = pkg.prefix;
      label = pkg.label;
    } else {
      const w = catalog.find((x) => x.prefix === target.slice(4))!;
      prefix = w.prefix;
      label = w.label;
    }
    actions.importItems(project.id, rows.map((r) => ({ name: r.name, qty: r.qty, um: r.um, mfr: r.vendor, part: '', label, prefix })));
    onClose();
    nav('list', { flash: `Quick-added ${rows.length} item${rows.length === 1 ? '' : 's'} to ${label}.` });
  };

  return (
    <Modal title="⚡ Quick Add items" onClose={onClose} width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Banner tone="info" icon="📋">
          Copy up to 4 columns from Excel — <strong>Item · QTY · U/M · Manufacturer/Vendor</strong> — and paste below, one item
          per line. Columns are progressive: just items, Item+QTY, Item+QTY+U/M, or all 4. Only the item name is required;
          units and vendors are matched against your catalogs, and everything else is filled in the grid.
        </Banner>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-caption)', color: 'var(--body)' }}>
          Add to work package
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{
              height: 40, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)',
              font: 'var(--text-body)', color: 'var(--ink)', background: 'var(--canvas)', cursor: 'pointer',
            }}
          >
            <option value="">— pick a work package —</option>
            {pkgs.length > 0 && (
              <optgroup label="Existing in this project">
                {pkgs.map((p) => <option key={p.id} value={`pkg:${p.id}`}>{p.label}</option>)}
              </optgroup>
            )}
            <optgroup label="Create new (from catalog)">
              {catalog.map((w) => <option key={w.prefix} value={`cat:${w.prefix}`}>{w.label}</option>)}
            </optgroup>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-caption)', color: 'var(--body)' }}>
          Paste your list (from Excel, an email, a quote…)
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={'FRP wall panels, Unit A\t120.5\tsq ft\tMeridian Panel Works\nGrab bars 42"\t8\tea\tNorthline Fixtures Co.\nToilet seat cover dispenser\t7\nFire extinguisher cabinets'}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--hairline)', font: 'var(--text-mono-sm)', color: 'var(--ink)',
              background: 'var(--canvas)', outline: 'none', resize: 'vertical', whiteSpace: 'pre',
            }}
          />
        </label>

        {rows.length > 0 && (
          <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-caption)' }}>
              <thead>
                <tr style={{ background: 'var(--surface-soft)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)' }}>Item ({rows.length})</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--muted)', width: 70 }}>QTY</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', width: 60 }}>U/M</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', width: 170 }}>Vendor</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--hairline)' }}>
                    <td style={{ padding: '5px 10px', color: 'var(--ink)' }}>{r.name}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', font: 'var(--text-mono-sm)' }}>{r.qty === '' ? '—' : r.qty}</td>
                    <td style={{ padding: '5px 10px', font: 'var(--text-mono-sm)' }}>{r.um}</td>
                    <td style={{ padding: '5px 10px', color: r.vendor ? 'var(--success)' : 'var(--muted)' }}>{r.vendor || '—'}</td>
                  </tr>
                ))}
                {rows.length > 8 && (
                  <tr style={{ borderTop: '1px solid var(--hairline)' }}>
                    <td colSpan={4} style={{ padding: '5px 10px', color: 'var(--muted)' }}>…and {rows.length - 8} more</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={confirm} disabled={!ready}>
            ⚡ Add {rows.length || ''} item{rows.length === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
