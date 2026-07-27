// CatalogsModal.tsx — the strict lists behind the app: work-package catalog (the
// cost-code prefixes the importer matches on), vendors, units, submittal statuses.
// Opened from the gear icon, top-right — no longer a nav tab.
import { useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { useApp } from '../store/useApp';
import { downloadBackup, parseBackup } from '../store/backup';
import { prefixCompare, SUBMITTALS, UNITS } from '../store/logic';
import { applyTheme, getTheme, type Theme } from '../store/theme';
import { Modal } from './ds/Modal';
import { Card } from './ds/Card';
import { Button } from './ds/Button';
import { TextInput } from './ds/TextInput';
import { StatusBadge } from './ds/StatusBadge';
import { SubmittalBadge } from './ds/SubmittalBadge';
import type { ItemStatus } from '../store/types';

const ITEM_STATUSES: ItemStatus[] = ['order-now', 'order-soon', 'ordered', 'delivered', 'on-site', 'installed', 'needs-data', 'planned', 'na'];

export function CatalogsModal({ onClose }: { onClose: () => void }) {
  const { db, actions, setActiveProjectId } = useApp();
  const [prefix, setPrefix] = useState('');
  const [label, setLabel] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [theme, setTheme] = useState<Theme>(getTheme());
  const pickTheme = (t: Theme) => { setTheme(t); applyTheme(t); };

  // ---- Backup & restore (see store/backup.ts) ----
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState('');
  const plural = (n: number) => `${n} project${n === 1 ? '' : 's'}`;

  const doExport = () => {
    downloadBackup(db);
    setBackupMsg(`Backed up ${plural(db.projects.length)} to your Downloads folder.`);
  };

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the user re-pick the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = parseBackup(String(reader.result));
        if (!window.confirm(`Import ${plural(next.projects.length)}?\n\nThis REPLACES everything currently in this browser profile. Export a backup first if you want to keep the current data.`)) return;
        actions.replaceDb(next);
        setActiveProjectId(next.projects[0]?.id ?? '');
        onClose();
      } catch (err) {
        setBackupMsg(err instanceof Error ? err.message : 'Could not read that file.');
      }
    };
    reader.onerror = () => setBackupMsg('Could not read that file.');
    reader.readAsText(file);
  };

  const add = () => {
    if (!prefix.trim() || !label.trim()) return;
    actions.addCatalogEntry(prefix.trim(), label.trim());
    setPrefix('');
    setLabel('');
  };
  const addVendor = () => {
    if (!vendorName.trim()) return;
    actions.addVendor(vendorName.trim());
    setVendorName('');
  };

  const th: CSSProperties = { textAlign: 'left', padding: '9px 12px', font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--hairline)', whiteSpace: 'nowrap' };
  const td: CSSProperties = { padding: '10px 12px', font: 'var(--text-body)', color: 'var(--ink)', borderBottom: '1px solid var(--hairline)' };
  const chip: CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', background: 'var(--canvas)' };

  return (
    <Modal title="Settings & Catalogs" onClose={onClose} width={860}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Appearance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ font: 'var(--text-title-sm)', color: 'var(--ink)' }}>Appearance</div>
          <div style={{ display: 'flex', padding: 2, borderRadius: 8, background: 'var(--surface-soft)', border: '1px solid var(--hairline)' }}>
            {(['light', 'dark'] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => pickTheme(t)}
                style={{
                  border: 'none', borderRadius: 6, cursor: 'pointer', padding: '7px 16px', font: 'var(--text-caption)', fontWeight: theme === t ? 700 : 500,
                  background: theme === t ? 'var(--canvas)' : 'transparent', color: theme === t ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: theme === t ? 'var(--shadow-card)' : 'none',
                }}
              >
                {t === 'light' ? '☀️ Light' : '🌙 Dark'}
              </button>
            ))}
          </div>
        </div>

        {/* Backup & restore — the app has no server; data lives in this browser only. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', background: 'var(--surface-soft)' }}>
          <div style={{ font: 'var(--text-title-sm)', color: 'var(--ink)' }}>Backup &amp; restore</div>
          <div style={{ font: 'var(--text-body)', color: 'var(--muted)' }}>
            Your projects live only in this browser profile. <strong>Export</strong> saves a file you can keep as a backup or carry to another computer or profile; <strong>Import</strong> loads that file back in. Importing replaces the data in this profile.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
            <Button variant="secondary" size="sm" onClick={doExport}>⬇ Export backup</Button>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>⬆ Import backup…</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onPickFile} />
            {backupMsg && <span style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>{backupMsg}</span>}
          </div>
        </div>

        {/* Auto-save to disk — the unattended half of the same job (SPEC-hardening §2). */}

        <div style={{ font: 'var(--text-body)', color: 'var(--muted)' }}>
          The controlled lists the tracker validates against. The <strong>work-package prefix</strong> is the key the materials importer maps a cost code onto.
        </div>

        <div>
          <div style={{ font: 'var(--text-title-sm)', color: 'var(--ink)', marginBottom: 10 }}>Work packages</div>
          <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--canvas)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-soft)' }}>
                  <th style={{ ...th, width: 140 }}>Cost-code prefix</th><th style={th}>Work package label</th>
                </tr>
              </thead>
              <tbody>
                {[...db.catalog].sort((a, b) => prefixCompare(a.prefix, b.prefix)).map((w) => (
                  <tr key={w.label}>
                    <td style={{ ...td, font: 'var(--text-mono)' }}>{w.prefix}</td>
                    <td style={td}>{w.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ width: 130 }}><TextInput placeholder="10.51" value={prefix} onChange={(e) => setPrefix(e.target.value)} /></span>
            <span style={{ width: 320 }}><TextInput placeholder="10.51_ Lockers" value={label} onChange={(e) => setLabel(e.target.value)} /></span>
            <Button variant="secondary" size="sm" onClick={add}>＋ Add work package</Button>
          </div>
        </div>

        <div>
          <div style={{ font: 'var(--text-title-sm)', color: 'var(--ink)', marginBottom: 12 }}>Vendors <span style={{ font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 400 }}>({db.vendors.length})</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 220, overflowY: 'auto', padding: '2px' }}>
            {db.vendors.map((v) => <span key={v} style={chip}>{v}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ width: 320 }}><TextInput placeholder="New vendor name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addVendor(); }} /></span>
            <Button variant="secondary" size="sm" onClick={addVendor}>＋ Add vendor</Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <Card>
            <div style={{ font: 'var(--text-title-sm)', color: 'var(--ink)', marginBottom: 12 }}>Units of measure</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {UNITS.map((u) => <span key={u} style={{ ...chip, font: 'var(--text-mono)' }}>{u}</span>)}
            </div>
          </Card>
          <Card>
            <div style={{ font: 'var(--text-title-sm)', color: 'var(--ink)', marginBottom: 12 }}>Submittal statuses</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUBMITTALS.map((s) => <SubmittalBadge key={s} status={s} />)}
            </div>
          </Card>
          <Card>
            <div style={{ font: 'var(--text-title-sm)', color: 'var(--ink)', marginBottom: 12 }}>Item statuses (semaphore)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ITEM_STATUSES.map((s) => <StatusBadge key={s} status={s} />)}
            </div>
          </Card>
        </div>
      </div>
    </Modal>
  );
}
