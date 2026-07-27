// ImportMaterialsModal.tsx — brings an estimate / materials spreadsheet into a project.
// Flow: upload (.csv/.xlsx/.xls) → parse + classify (spinner) → grouped preview with
// per-row reassign and an existing-package conflict policy (append / duplicate / skip)
// → append to the Material List as draft.
//
// The preview step is the point of the screen. Column matching is fuzzy and grouping is
// a fallback chain, so the import is a guess — showing the guess grouped, editable and
// reversible before anything is written beats a silent import that files 200 rows wrong.
import { useRef, useState, type CSSProperties } from 'react';
import { useApp } from '../store/useApp';
import { matchVendor, prefixCompare } from '../store/logic';
import { parseCsvText } from '../store/csv';
import { classifyImportRow, parseImportGrid, UNCATEGORIZED_LABEL, type ImportVia } from '../store/materialsImport';
import type { Project } from '../store/types';
import { Modal } from './ds/Modal';
import { Button } from './ds/Button';
import { Checkbox } from './ds/Checkbox';
import { Banner } from './ds/Banner';

type Step = 'select' | 'parsing' | 'preview';
type Policy = 'append' | 'duplicate' | 'skip';

interface PRow {
  rid: number;
  name: string;
  part: string;
  qty: number;
  um: string;
  mfr: string;
  cc: string;
  via: ImportVia;
  prefix: string;
  label: string;
  inc: boolean;
}

const VIA_STYLE: Record<string, CSSProperties> = {
  'work package': { color: 'var(--success)', fontWeight: 600 },
  section: { color: 'var(--success)', fontWeight: 600 },
  'cost code': { color: 'var(--body)' },
  manual: { color: 'var(--info)', fontWeight: 600 },
  uncategorized: { background: 'var(--status-order-soon)', color: 'var(--status-order-soon-ink)', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-pill)' },
};

const MAX_PREVIEW_ROWS = 300;

export function ImportMaterialsModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { db, actions, nav } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('select');
  const [rows, setRows] = useState<PRow[]>([]);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [policies, setPolicies] = useState<Record<string, Policy>>({});

  const projectPackages = db.packages.filter((p) => p.projectId === project.id);
  const existingPrefixes = new Set(projectPackages.map((p) => p.prefix));

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let cells: string[][];
      if (/\.xlsx?$|\.xls$/i.test(file.name)) {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        cells = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
      } else {
        cells = parseCsvText(await file.text());
      }
      setGrid(cells);
      setFileName(file.name);
      setUploadError(null);
      setStep('select');
      setRows([]);
    } catch (err) {
      console.error('[Materials import] read failed:', err);
      setUploadError(err instanceof Error ? err.message : String(err));
      setGrid(null);
      setFileName(null);
    } finally {
      e.target.value = '';
    }
  }

  function parse() {
    if (!grid) return;
    setStep('parsing');
    setTimeout(() => {
      try {
        const { rows: parsed, unmappedColumns } = parseImportGrid(grid);
        setUnmapped(unmappedColumns);
        setRows(parsed.map((r, i) => {
          const cl = classifyImportRow(r, db.catalog);
          // Manufacturer/Supplier → vendor, canonicalized against the vendor catalog.
          return { rid: i, name: r.name, part: r.part, qty: r.qty, um: r.um, mfr: matchVendor(r.mfr, db.vendors), cc: r.costCode, via: cl.via, prefix: cl.prefix, label: cl.label, inc: cl.inc };
        }));
        setPolicies({});
        setStep('preview');
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : String(err));
        setStep('select');
      }
    }, 350);
  }

  const setRow = (rid: number, patch: Partial<PRow>) => setRows((rs) => rs.map((r) => (r.rid === rid ? { ...r, ...patch } : r)));
  const relabel = (rid: number, label: string) => {
    const cat = db.catalog.find((x) => x.label === label);
    const peer = rows.find((x) => x.label === label);
    setRow(rid, { label, prefix: cat ? cat.prefix : peer ? peer.prefix : label, via: 'manual' });
  };

  const th: CSSProperties = { textAlign: 'left', padding: '9px 12px', font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--hairline)', whiteSpace: 'nowrap' };
  const td: CSSProperties = { padding: '8px 12px', font: 'var(--text-body)', color: 'var(--ink)', borderBottom: '1px solid var(--hairline)', verticalAlign: 'middle' };

  const sel = rows.filter((r) => r.inc);
  const selPrefixes = [...new Set(sel.map((r) => r.prefix))];
  const conflicts = selPrefixes.filter((p) => existingPrefixes.has(p));
  const newPkgs = selPrefixes.filter((p) => !existingPrefixes.has(p));
  const appendPkgs = conflicts.filter((p) => (policies[p] ?? 'append') === 'append');
  const nUncat = sel.filter((r) => r.via === 'uncategorized').length;

  // WP options: the catalog (sorted by cost code) plus any dynamic titles the file produced.
  const wpOptions = (() => {
    const opts = [...db.catalog].sort((a, b) => prefixCompare(a.prefix, b.prefix)).map((w) => w.label);
    rows.forEach((r) => { if (!opts.includes(r.label)) opts.push(r.label); });
    if (!opts.includes(UNCATEGORIZED_LABEL)) opts.push(UNCATEGORIZED_LABEL);
    return opts;
  })();

  const labelOf = (prefix: string) => rows.find((r) => r.prefix === prefix)?.label ?? prefix;

  function doImport() {
    const existing = new Set(existingPrefixes);
    const dupNames = new Map<string, { prefix: string; label: string }>();
    const out: { name: string; qty: number; um: string; mfr: string; part: string; label: string; prefix: string }[] = [];
    for (const r of sel) {
      const policy: Policy = existing.has(r.prefix) ? (policies[r.prefix] ?? 'append') : 'append';
      if (existing.has(r.prefix) && policy === 'skip') continue;
      let prefix = r.prefix;
      let label = r.label;
      if (existing.has(r.prefix) && policy === 'duplicate') {
        let d = dupNames.get(r.prefix);
        if (!d) {
          let n = 2;
          while (existing.has(`${r.prefix} (${n})`)) n++;
          d = { prefix: `${r.prefix} (${n})`, label: `${r.label} (${n})` };
          dupNames.set(r.prefix, d);
        }
        prefix = d.prefix;
        label = d.label;
      }
      out.push({ name: r.name, qty: r.qty, um: r.um, mfr: r.mfr, part: r.part, label, prefix });
    }
    if (out.length === 0) { onClose(); return; }
    // Dynamic titles not in the catalog — offer to save them, like manual custom packages.
    const seen = new Set<string>();
    for (const x of out) {
      if (seen.has(x.label) || db.catalog.some((w) => w.label === x.label) || x.label === UNCATEGORIZED_LABEL) continue;
      seen.add(x.label);
      if (window.confirm(`Work package "${x.label}" isn't in the global catalog. Add it?`)) {
        actions.addCatalogEntry(x.prefix, x.label);
      }
    }
    actions.importItems(project.id, out);
    onClose();
    nav('list', { flash: `Imported ${out.length} item${out.length === 1 ? '' : 's'} into ${project.name} as draft.` });
  }

  // Grouped preview: rows under their assigned work package, packages in cost-code order.
  const grouped = (() => {
    const byLabel = new Map<string, PRow[]>();
    rows.forEach((r) => {
      const g = byLabel.get(r.label);
      if (g) g.push(r);
      else byLabel.set(r.label, [r]);
    });
    return [...byLabel.entries()].sort((a, b) => prefixCompare(a[1][0].prefix, b[1][0].prefix));
  })();
  let shownRows = 0;

  return (
    <Modal title="Import materials list" onClose={onClose} width={1020}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--muted)' }}>
          Importing into <strong style={{ color: 'var(--body)' }}>{project.name}</strong>. Items are filed by the file's own
          <strong style={{ color: 'var(--body)' }}> work-package sections</strong>, falling back to the
          <strong style={{ color: 'var(--body)' }}> Cost Code</strong> (first 5 digits), and to <em>{UNCATEGORIZED_LABEL}</em> as a last resort.
          Check every group before importing — you can reassign any row below.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-md)', background: 'var(--surface-soft)' }}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>Upload a materials list (.csv, .xlsx or .xls):</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={onUpload} style={{ display: 'none' }} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                padding: '8px 12px', borderRadius: 'var(--radius-sm)', font: 'var(--text-mono)',
                border: `1px solid ${fileName ? 'var(--primary)' : 'var(--hairline)'}`,
                background: fileName ? 'var(--surface-strong)' : 'var(--canvas)', color: 'var(--ink)',
              }}
            >
              📤 {fileName ?? 'Choose a file…'}
            </button>
            <span style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={parse} disabled={step === 'parsing' || !grid}>
              {step === 'parsing' ? '⏳ Parsing…' : '🔎 Parse file'}
            </Button>
          </div>
        </div>

        {uploadError && <Banner tone="danger" icon="⚠">{uploadError}</Banner>}

        {step === 'select' && !uploadError && (
          <Banner tone="info" icon="ℹ">
            Parser reads <strong>Name, Part, Quantity, U/M, Manufacturer, Cost Code</strong> plus the file's section titles. Column matching is
            fuzzy, so header variations ("Qty" / "Quantity" / "QTY.") are fine and unrecognized columns are reported, not fatal. Quantities cap at
            2 decimals; Part → notes; non-Material lines (Labor, Equipment…) start unchecked.
          </Banner>
        )}

        {step === 'parsing' && (
          <div style={{ padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--muted)', font: 'var(--text-body)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)' }}>
            <span className="spinner" aria-hidden />
            Reading {fileName} and organizing items into work packages…
          </div>
        )}

        {step === 'preview' && (
          <>
            <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--ink)' }}>{sel.length}</strong> of {rows.length} items selected ·{' '}
              <strong style={{ color: 'var(--ink)' }}>{newPkgs.length}</strong> new work package{newPkgs.length === 1 ? '' : 's'} will be created
              {appendPkgs.length > 0 && <> · appending to <strong style={{ color: 'var(--ink)' }}>{appendPkgs.length}</strong> existing</>}
              {unmapped.length > 0 && <> · ignored columns: {unmapped.join(', ')}</>}
            </div>

            {conflicts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, border: '1px solid var(--status-order-soon)', background: 'color-mix(in srgb, var(--status-order-soon) 18%, white)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ font: 'var(--text-caption)', fontWeight: 600, color: 'var(--status-order-soon-ink)' }}>
                  ⚠ {conflicts.length} work package{conflicts.length === 1 ? ' title' : ' titles'} already exist in this project — choose what to do:
                </div>
                {conflicts.map((p) => (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ font: 'var(--text-body)', color: 'var(--ink)', minWidth: 260 }}>{labelOf(p)}</span>
                    <select
                      value={policies[p] ?? 'append'}
                      onChange={(e) => setPolicies((pl) => ({ ...pl, [p]: e.target.value as Policy }))}
                      style={{ height: 32, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', background: 'var(--canvas)', cursor: 'pointer' }}
                    >
                      <option value="append">A) Append items to the existing work package</option>
                      <option value="duplicate">B) Create a duplicate work package (adds a suffix)</option>
                      <option value="skip">C) Skip these items</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--canvas)', maxHeight: 420, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-soft)' }}>
                    <th style={{ ...th, width: 60, textAlign: 'center' }}>Import</th>
                    <th style={th}>Item (from file)</th>
                    <th style={{ ...th, textAlign: 'right', width: 64 }}>QTY</th>
                    <th style={{ ...th, width: 44 }}>U/M</th>
                    <th style={{ ...th, width: 110 }}>Cost Code</th>
                    <th style={{ ...th, width: 116 }}>Grouped by</th>
                    <th style={{ ...th, width: 280 }}>Work package (reassignable)</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([label, g]) => {
                    if (shownRows >= MAX_PREVIEW_ROWS) return null;
                    const isNew = !existingPrefixes.has(g[0].prefix);
                    const header = (
                      <tr key={`g:${label}`} style={{ background: 'var(--surface-soft)' }}>
                        <td colSpan={7} style={{ ...td, font: 'var(--text-caption)', fontWeight: 600 }}>
                          📦 {label} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({g.length} item{g.length === 1 ? '' : 's'} · {isNew ? 'new package' : 'exists in project'})</span>
                        </td>
                      </tr>
                    );
                    const body = g.slice(0, MAX_PREVIEW_ROWS - shownRows).map((r) => (
                      <tr key={r.rid} style={{ opacity: r.inc ? 1 : 0.5 }}>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <Checkbox checked={r.inc} onChange={(v) => setRow(r.rid, { inc: v })} />
                        </td>
                        <td style={{ ...td, whiteSpace: 'normal' }}>
                          {r.name}
                          {r.mfr && <span style={{ font: 'var(--text-caption)', color: 'var(--success)', marginLeft: 8 }}>· {r.mfr}</span>}
                          {r.part && <span style={{ font: 'var(--text-mono-sm)', color: 'var(--muted)', marginLeft: 8 }}>· {r.part}</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', font: 'var(--text-mono)' }}>{r.qty}</td>
                        <td style={{ ...td, font: 'var(--text-mono)' }}>{r.um}</td>
                        <td style={{ ...td, font: 'var(--text-mono)', color: r.cc ? 'var(--ink)' : 'var(--muted)' }}>{r.cc || '—'}</td>
                        <td style={td}><span style={{ font: 'var(--text-caption)', ...VIA_STYLE[r.via] }}>{r.via}</span></td>
                        <td style={td}>
                          <select
                            value={r.label}
                            onChange={(e) => relabel(r.rid, e.target.value)}
                            style={{
                              width: '100%', height: 36, padding: '0 10px', borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)',
                              background: isNew && r.inc ? 'color-mix(in srgb, var(--info-border) 10%, white)' : 'var(--canvas)', cursor: 'pointer',
                            }}
                          >
                            {wpOptions.map((l) => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ));
                    shownRows += g.length;
                    return [header, ...body];
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > MAX_PREVIEW_ROWS && (
              <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
                Preview shows the first {MAX_PREVIEW_ROWS} rows — all {rows.length} parsed rows are included in the import.
              </div>
            )}

            {nUncat > 0 && (
              <Banner tone="warning" icon="⚠">
                {nUncat} selected item{nUncat === 1 ? '' : 's'} had no work package or cost code — they'll land in <strong>{UNCATEGORIZED_LABEL}</strong> for manual review.
              </Banner>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <Button variant="primary" onClick={doImport} disabled={sel.length === 0}>✅ Confirm Import ({sel.length})</Button>
              <Button variant="secondary" onClick={() => { setStep('select'); setRows([]); }}>✖ Discard preview</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
