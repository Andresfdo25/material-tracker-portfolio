import { Button } from './Button';

export type GroupDim = 'project' | 'pkg' | 'vendor';

/** Fixed grouping hierarchy — whatever the click order, selections always nest Project > Work package > Vendor. */
const GROUP_ORDER: GroupDim[] = ['project', 'pkg', 'vendor'];

const LABEL: Record<GroupDim, string> = { project: 'Project', pkg: 'Work package', vendor: 'Vendor' };

/**
 * GroupByBar — toggle buttons that group the Submittals tables. Active
 * dimensions render as filled buttons; the resulting array is always in GROUP_ORDER.
 */
export function GroupByBar({ value, onChange }: { value: GroupDim[]; onChange: (v: GroupDim[]) => void }) {
  const toggle = (d: GroupDim) => {
    const next = new Set(value);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onChange(GROUP_ORDER.filter((k) => next.has(k)));
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 600 }}>Group by:</span>
      {GROUP_ORDER.map((d) => {
        const on = value.includes(d);
        return (
          <Button
            key={d}
            size="sm"
            variant={on ? 'primary' : 'secondary'}
            onClick={() => toggle(d)}
            title={on ? 'Remove this grouping level' : 'Group rows by this level'}
            style={{ padding: '5px 12px' }}
          >
            {LABEL[d]}
          </Button>
        );
      })}
      {value.length > 0 && (
        <Button size="sm" variant="ghost" onClick={() => onChange([])} style={{ padding: '4px 8px', color: 'var(--muted)' }}>✕ Clear grouping</Button>
      )}
    </div>
  );
}
