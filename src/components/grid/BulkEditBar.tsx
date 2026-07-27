// BulkEditBar.tsx — the strip that appears above a package's table once rows are selected.
import { Button } from '../ds/Button';
import { HIGHLIGHTS } from './highlights';

/** Selection bar — deliberately NOT a bulk editor any more. Every field is edited from
 * its own column-header popover (which targets the selection when there is one), so this
 * bar only carries the actions that have no column to live in. */
export function BulkEditBar({ count, onDelete, onClear, onHighlight, onCover }: {
  count: number;
  onDelete: () => void;
  onClear: () => void;
  onHighlight: (color: string) => void;
  onCover: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', background: 'color-mix(in srgb, var(--info-border) 10%, white)', border: '1px solid var(--info-border)', borderRadius: 'var(--radius-sm)' }}>
      <strong style={{ font: 'var(--text-caption)', color: 'var(--info)', whiteSpace: 'nowrap' }}>{count} selected</strong>
      <span style={{ font: 'var(--text-caption)', color: 'var(--info)', opacity: 0.85 }}>
        — edit any field from its column header ▾
      </span>
      <Button size="sm" variant="secondary" onClick={onCover} title="Create Submittal Cover — fills the company cover-page template with the selected items">
        📄 Submittal Cover
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={onDelete}
        title="Delete selected"
        aria-label="Delete selected"
        style={{ color: 'var(--status-order-now-ink)', background: 'var(--status-order-now)', borderColor: 'var(--status-order-now-ink)', padding: '8px 12px' }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>🗑</span>
      </Button>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ font: 'var(--text-mono-sm)', color: 'var(--info)', fontWeight: 600 }}>Highlight:</span>
        {HIGHLIGHTS.map((h) => (
          <button
            key={h.key}
            type="button"
            className="swatch-btn"
            title={`Highlight selected ${h.label}`}
            aria-label={`Highlight selected ${h.label}`}
            onClick={() => onHighlight(h.key)}
            style={{ width: 22, height: 22, borderRadius: 5, background: h.token, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border-strong)' }}
          />
        ))}
        <button
          type="button"
          className="swatch-btn"
          title="Clear highlight on selected"
          aria-label="Clear highlight on selected"
          onClick={() => onHighlight('')}
          style={{ width: 22, height: 22, borderRadius: 5, background: 'var(--canvas)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border-strong)', color: 'var(--muted)', fontSize: 12 }}
        >
          ✕
        </button>
      </span>
      <Button size="sm" variant="ghost" onClick={onClear}>Clear selection</Button>
    </div>
  );
}
