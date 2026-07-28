// SubmittalCoverModal.tsx — "Create Submittal Cover": prepares and generates the
// company's fillable cover-page PDF from the items selected in a work package.
// Everything is prefilled from the tracker (TO = GC, RE = project, contents table =
// selected items) and editable before generating. Spec / Arq Ref. comes from the
// "Ref - Description" convention (splitDescription); rows the PM edits here go to
// the PDF as-is. >11 items continue on extra template pages (11 rows per page).
// The PDF's deviation checkboxes and General Comments belong to the reviewer and
// are never filled. Generation is lazy — pdf-lib loads only on Generate.
import { useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '../store/useApp';
import { fmtMDY, splitDescription, today } from '../store/logic';
import type { MaterialItem } from '../store/types';
import type { CoverHeader, CoverRow } from '../store/submittalCover';
import { Modal } from './ds/Modal';
import { Button } from './ds/Button';
import { TextInput } from './ds/TextInput';
import coverTemplateUrl from '../assets/submittal-cover.pdf';

// Keep in sync with submittalCover.ts (type-only import there keeps pdf-lib lazy).
const ROWS_FIRST = 11;
const ROWS_CONT = 42;

const label: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, font: 'var(--text-caption)', color: 'var(--body)', fontWeight: 600 };
const cellInput: CSSProperties = {
  width: '100%', boxSizing: 'border-box', height: 30, padding: '0 8px', font: 'var(--text-mono-sm)', color: 'var(--ink)',
  border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', background: 'var(--canvas)',
};

type TypeKey = 'productData' | 'shopDrawings' | 'samples' | 'other';
const TYPE_LABELS: { key: TypeKey; label: string }[] = [
  { key: 'productData', label: 'Product Data' },
  { key: 'shopDrawings', label: 'Shop Drawings' },
  { key: 'samples', label: 'Samples' },
  { key: 'other', label: 'Other' },
];

export function SubmittalCoverModal({ items, onClose }: { items: MaterialItem[]; onClose: () => void }) {
  const { db, actions } = useApp();
  // Resolve the project THROUGH the selected items' package — activeProjectId can be
  // stale (it boots as 'p1' and the screen falls back to the first project).
  const pkg = db.packages.find((w) => w.id === items[0]?.wpId);
  const project = db.projects.find((p) => p.id === pkg?.projectId);

  const [toName, setToName] = useState(project?.gc ?? '');
  const [toAddress, setToAddress] = useState(project?.gcAddress ?? '');
  const [re, setRe] = useState(project?.name ?? '');
  const [date, setDate] = useState(today());
  const [sentVia, setSentVia] = useState('');
  const [title, setTitle] = useState(pkg?.label ?? '');
  const [number, setNumber] = useState('');
  const [types, setTypes] = useState<Record<TypeKey, boolean>>({ productData: true, shopDrawings: false, samples: false, other: false });
  const [revs, setRevs] = useState<Record<TypeKey, string>>({ productData: '', shopDrawings: '', samples: '', other: '' });
  const [otherText, setOtherText] = useState('');
  const [rows, setRows] = useState<CoverRow[]>(() => items.map((it) => {
    const { ref, product } = splitDescription(it.description);
    return { ref, product, qty: `${it.qty ?? ''} ${it.um ?? ''}`.trim(), mfr: it.vendor };
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pageCount = useMemo(
    () => (rows.length <= ROWS_FIRST ? 1 : 1 + Math.ceil((rows.length - ROWS_FIRST) / ROWS_CONT)),
    [rows.length],
  );

  const setRow = (i: number, patch: Partial<CoverRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const generate = async () => {
    if (!project) {
      setError('Could not resolve the project for the selected items');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const [{ generateSubmittalCover, downloadPdf }, templateBytes] = await Promise.all([
        import('../store/submittalCover'),
        fetch(coverTemplateUrl).then((r) => {
          if (!r.ok) throw new Error('Could not load the cover template');
          return r.arrayBuffer();
        }),
      ]);
      const header: CoverHeader = {
        toName: toName.trim(), toAddress: toAddress.trim(), re: re.trim(), date: fmtMDY(date),
        sentVia: sentVia.trim(), title: title.trim(), number: number.trim(),
        types, revs, otherText: otherText.trim(),
      };
      const bytes = await generateSubmittalCover(templateBytes, header, rows);
      // "Submittal Cover - 10 21 Bron Tapes.pdf" — el nombre del paquete tal cual lo
      // lee el PM (el Title editado acá manda sobre pkg.label), con los caracteres
      // ilegales en nombres de archivo cambiados por "-", igual que el export del PDF.
      const wpName = title.trim() || pkg?.label || 'Cover';
      const name = `Submittal Cover - ${wpName}`.replace(/[\\/:*?"<>|]/g, '-');
      downloadPdf(bytes, `${name}.pdf`);
      if (toAddress.trim() !== (project.gcAddress ?? '')) actions.updateProject(project.id, { gcAddress: toAddress.trim() });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the PDF');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Create Submittal Cover — ${pkg?.label ?? ''}`} onClose={onClose} width={880}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <label style={label}>
            TO: (name)
            <TextInput value={toName} onChange={(e) => setToName(e.target.value)} placeholder="GC / Client" />
          </label>
          <label style={label}>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...cellInput, height: 38, font: 'var(--text-body)' }} />
          </label>
          <label style={label}>
            Sent Via
            <TextInput value={sentVia} onChange={(e) => setSentVia(e.target.value)} placeholder="e.g. e-mail, project portal, courier" />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr', gap: 12 }}>
          <label style={label}>
            TO: (address)
            <TextInput value={toAddress} onChange={(e) => setToAddress(e.target.value)} placeholder="GC address — remembered for this project" />
          </label>
          <label style={label}>
            RE:
            <TextInput value={re} onChange={(e) => setRe(e.target.value)} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <label style={label}>
            Submittal Title
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label style={label}>
            Submittal Number
            <TextInput value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 10.28-01" />
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ font: 'var(--text-caption)', color: 'var(--body)', fontWeight: 600 }}>Submittal Type</span>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
            {TYPE_LABELS.map(({ key, label: tl }) => (
              <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  id={`cover-type-${key}`}
                  checked={types[key]}
                  onChange={(e) => setTypes((t) => ({ ...t, [key]: e.target.checked }))}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-slate)' }}
                />
                <label htmlFor={`cover-type-${key}`} style={{ font: 'var(--text-body)', color: 'var(--ink)', cursor: 'pointer' }}>{tl}</label>
                {types[key] && (
                  <input
                    value={revs[key]}
                    onChange={(e) => setRevs((r) => ({ ...r, [key]: e.target.value }))}
                    placeholder="Rev"
                    title={`${tl} — Rev`}
                    style={{ ...cellInput, width: 52 }}
                  />
                )}
                {key === 'other' && types.other && (
                  <input value={otherText} onChange={(e) => setOtherText(e.target.value)} placeholder="Describe…" style={{ ...cellInput, width: 150 }} />
                )}
              </span>
            ))}
          </div>
          <span style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
            Deviations and General Comments stay empty — that section belongs to the reviewer.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ font: 'var(--text-caption)', color: 'var(--body)', fontWeight: 600 }}>
            Submittal Contents — {rows.length} item{rows.length === 1 ? '' : 's'}
            {pageCount > 1 && <span style={{ color: 'var(--info)' }}> → {pageCount} pages ({ROWS_FIRST} rows on the cover, then full-page sheets of {ROWS_CONT})</span>}
          </span>
          <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: 'calc(38vh / var(--ui-scale))' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 110 }} />
                <col />
                <col style={{ width: 90 }} />
                <col style={{ width: 170 }} />
              </colgroup>
              <thead>
                <tr>
                  {['Spec / Arq Ref.', 'Item / Product', 'QTY', 'Manufacturer / Series'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 600, background: 'var(--surface-soft)', borderBottom: '1px solid var(--hairline)', position: 'sticky', top: 0 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={i === ROWS_FIRST || (i > ROWS_FIRST && (i - ROWS_FIRST) % ROWS_CONT === 0) ? { borderTop: '2px dashed var(--info-border)' } : undefined}>
                    <td style={{ padding: '3px 4px' }}><input value={r.ref} onChange={(e) => setRow(i, { ref: e.target.value })} placeholder="—" style={cellInput} /></td>
                    <td style={{ padding: '3px 4px' }}><input value={r.product} onChange={(e) => setRow(i, { product: e.target.value })} style={cellInput} /></td>
                    <td style={{ padding: '3px 4px' }}><input value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} style={cellInput} /></td>
                    <td style={{ padding: '3px 4px' }}><input value={r.mfr} onChange={(e) => setRow(i, { mfr: e.target.value })} style={cellInput} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
            Spec / Arq Ref. is read from the text before the "|" in each item's description ("1004A | Grab bar"); edit any cell before generating.
          </span>
        </div>

        {error && <span style={{ font: 'var(--text-caption)', color: 'var(--status-order-now-ink)' }}>⚠ {error}</span>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={generate} disabled={busy || rows.length === 0}>
            {busy ? 'Generating…' : '⬇ Generate PDF'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
