// SubmittalsScreen.tsx — the submittal chase list. Shows every item whose submittal
// still blocks ordering (Pending / In Review / Revise & Resubmit), scoped to the open
// project or all active projects. Reads the live working draft — the PM chases
// submittals on current data, not the last published report.
import { useState, type CSSProperties } from 'react';
import { useApp } from '../store/useApp';
import { computeItem, fmtMDY, submittalBlockers } from '../store/logic';
import type { MaterialItem, Project, WorkPackage } from '../store/types';
import { usePersisted } from '../store/usePersisted';
import { GroupByBar, type GroupDim } from '../components/ds/GroupByBar';
import { StatusBadge } from '../components/ds/StatusBadge';
import { SubmittalBadge } from '../components/ds/SubmittalBadge';
import { Button } from '../components/ds/Button';

// Blocker categories — an item lands here if ANY submittal component still blocks it.
const CATEGORIES = ['Product data', 'Samples', 'Shop drawings', 'Field measurements', 'Other'];
const inCategory = (blockers: string[], cat: string) => blockers.some((b) => (cat === 'Other' ? b.startsWith('Other') : b === cat));

interface Row {
  i: MaterialItem;
  pkg: WorkPackage;
  project: Project;
  buyby: string;
  days: number | null;
}

export function SubmittalsScreen() {
  const { db, activeProjectId, thresholdsFor, jumpToItem } = useApp();
  const activeProjects = db.projects
    .filter((p) => !p.archived)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const defaultId = activeProjects.some((p) => p.id === activeProjectId) ? activeProjectId : activeProjects[0]?.id ?? '';
  const [projectSel, setProjectSel] = useState(defaultId);
  // Filters persist across navigation (and reloads) so the last view stays applied.
  const [allProjects, setAllProjects] = usePersisted('submittals:allProjects', false);
  const [typeFilter, setTypeFilter] = usePersisted<string[]>('submittals:typeFilter', []);
  // De-saturated by default: grouped Project › Work package, groups collapsed to counts.
  const [groupBy, setGroupBy] = usePersisted<GroupDim[]>('submittals:groupBy', ['project', 'pkg']);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Groups default collapsed — flip the effective state so the first click always expands.
  const toggleCollapsed = (k: string) => setCollapsed((c) => ({ ...c, [k]: !(c[k] ?? true) }));

  const scope = new Set(allProjects ? activeProjects.map((p) => p.id) : [projectSel]);

  const rows: Row[] = db.items
    .filter((i) => submittalBlockers(i).length > 0 && !i.delivered)
    .map((i) => {
      const pkg = db.packages.find((p) => p.id === i.wpId)!;
      const project = db.projects.find((p) => p.id === pkg.projectId)!;
      const t = thresholdsFor(project.id);
      const c = computeItem(i, { window: t.window });
      return { i, pkg, project, buyby: c.buyby, days: c.days };
    })
    .filter((x) => scope.has(x.project.id) && !x.project.archived)
    .sort((a, b) => (a.buyby || '9999').localeCompare(b.buyby || '9999'));

  const byCat = (cat: string) => rows.filter((x) => inCategory(submittalBlockers(x.i), cat));
  // Multi-select filter — a row shows if it's blocked by ANY selected category.
  const shown = typeFilter.length ? rows.filter((x) => typeFilter.some((cat) => inCategory(submittalBlockers(x.i), cat))) : rows;

  // Grouping — GroupByBar keeps groupBy in hierarchy order (Project > Work package > Vendor).
  const dimValue = (x: Row, d: GroupDim) => (d === 'project' ? x.project.name : d === 'pkg' ? x.pkg.label : x.i.vendor || 'No vendor');
  const groupKey = (x: Row) => groupBy.map((d) => dimValue(x, d)).join('  ›  ');

  // Collapse All targets the table's groups — there's nothing to collapse without grouping.
  const collapsibleKeys: string[] = groupBy.length ? [...new Set(shown.map(groupKey))].map((k) => `main|${k}`) : [];
  const keyCollapsed = (k: string) => collapsed[k] ?? true; // groups collapse to counts by default
  const allCollapsed = collapsibleKeys.length > 0 && collapsibleKeys.every(keyCollapsed);
  const collapseAll = () => {
    const target = !allCollapsed;
    setCollapsed((c) => { const n = { ...c }; collapsibleKeys.forEach((k) => { n[k] = target; }); return n; });
  };

  // Deep link: lands on the Material List, scrolls to the exact item and flashes it.
  const jump = (projectId: string, itemId: string) => jumpToItem(projectId, itemId);

  const th: CSSProperties = { textAlign: 'left', padding: '9px 12px', font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--hairline)', whiteSpace: 'nowrap' };
  const td: CSSProperties = { padding: '10px 12px', font: 'var(--text-body)', color: 'var(--ink)', borderBottom: '1px solid var(--hairline)', whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1180 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--title)', fontWeight: 600 }}>Submittals</div>
          <div style={{ font: 'var(--text-body)', color: 'var(--muted)', marginTop: 4 }}>
            Items whose submittal cycle still blocks ordering — product data, samples, shop drawings, field measurements or other
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <select
            value={projectSel}
            disabled={allProjects}
            onChange={(e) => setProjectSel(e.target.value)}
            style={{
              height: 34, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)',
              background: 'var(--canvas)', font: 'var(--text-body)', color: 'var(--body)', padding: '0 10px',
              cursor: 'pointer', opacity: allProjects ? 0.5 : 1,
            }}
          >
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--text-body)', color: 'var(--ink)', cursor: 'pointer' }}>
            <input type="checkbox" checked={allProjects} onChange={(e) => setAllProjects(e.target.checked)} style={{ width: 20, height: 20, cursor: 'pointer', accentColor: 'var(--brand-slate)' }} />
            All Projects
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ font: 'var(--text-caption)', color: 'var(--muted)', fontWeight: 600 }}>Filter:</span>
        {CATEGORIES.map((cat) => {
          const active = typeFilter.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setTypeFilter((f) => (active ? f.filter((x) => x !== cat) : [...f, cat]))}
              title={active ? 'Remove this category from the filter' : 'Add this category to the filter (multi-select)'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                border: '1px solid var(--hairline)', background: active ? 'color-mix(in srgb, var(--info-border) 12%, white)' : 'var(--canvas)',
                padding: '5px 12px', borderRadius: 'var(--radius-pill)',
                opacity: typeFilter.length && !active ? 0.45 : 1,
                outline: active ? '2px solid var(--info-border)' : 'none', outlineOffset: 1,
              }}
            >
              <span style={{ font: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink)' }}>{cat}</span>
              <span style={{ font: '700 17px/1.1 var(--font-mono)', color: 'var(--ink)' }}>{byCat(cat).length}</span>
            </button>
          );
        })}
        {typeFilter.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setTypeFilter([])} style={{ padding: '4px 8px', color: 'var(--muted)' }}>✕ Clear filters</Button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <GroupByBar value={groupBy} onChange={setGroupBy} />
        <span style={{ flex: 1 }} />
        <Button
          variant="ghost"
          size="sm"
          onClick={collapseAll}
          disabled={collapsibleKeys.length === 0}
          title={collapsibleKeys.length === 0 ? 'Nothing to collapse — group the list first' : undefined}
          style={{ padding: '6px 10px', color: 'var(--muted)' }}
        >
          {allCollapsed ? '⊞ Expand All' : '⊟ Collapse All'}
        </Button>
      </div>

      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--canvas)' }}>
        {/* Fixed layout — long work-package titles wrap instead of dragging the columns. */}
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            {allProjects && <col style={{ width: 150 }} />}
            <col style={{ width: 190 }} />
            <col />
            <col style={{ width: 130 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 108 }} />
            <col style={{ width: 108 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 36 }} />
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--surface-soft)' }}>
              {allProjects && <th style={th}>Project</th>}
              <th style={th}>Work package</th><th style={th}>Item</th><th style={th}>Vendor</th>
              <th style={th}>Submittal</th><th style={th}>Buy-By</th><th style={th}>On-Site Req.</th>
              <th style={th}>Status</th><th style={th} />
            </tr>
          </thead>
          <tbody>
            {(() => {
              const colCount = (allProjects ? 1 : 0) + 8;
              const renderRow = (x: Row, key: string) => (
                <tr
                  key={key}
                  onClick={() => jump(x.project.id, x.i.id)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {allProjects && <td style={{ ...td, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{x.project.name}</td>}
                  <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'normal', overflowWrap: 'break-word' }}>{x.pkg.label}</td>
                  <td style={{ ...td, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{x.i.description}</td>
                  <td style={{ ...td, whiteSpace: 'normal', overflowWrap: 'break-word' }}>{x.i.vendor}</td>
                  <td style={{ ...td, whiteSpace: 'normal' }}>
                    <SubmittalBadge status={x.i.submittal} />
                    {(() => {
                      const extra = submittalBlockers(x.i).filter((b) => b !== 'Product data');
                      return extra.length ? <div style={{ font: 'var(--text-mono-sm)', color: 'var(--status-order-now-ink)', marginTop: 3 }}>⛔ {extra.join(', ')}</div> : null;
                    })()}
                  </td>
                  <td style={{ ...td, font: 'var(--text-mono)', fontWeight: 600, color: x.days != null && x.days <= 0 ? 'var(--status-order-now-ink)' : 'var(--ink)' }}>
                    {x.buyby ? fmtMDY(x.buyby) : '—'}
                  </td>
                  <td style={{ ...td, font: 'var(--text-mono)' }}>{x.i.onsite ? fmtMDY(x.i.onsite) : 'Confirm Date'}</td>
                  <td style={td}><StatusBadge status={computeItem(x.i, { window: thresholdsFor(x.project.id).window }).status} /></td>
                  <td style={{ ...td, color: 'var(--muted)', textAlign: 'center' }}>›</td>
                </tr>
              );
              const parts: React.ReactNode[] = [];
              if (groupBy.length === 0) {
                parts.push(...shown.map((x, i) => renderRow(x, `r${i}`)));
              } else {
                const groups = new Map<string, Row[]>();
                [...shown].sort((a, b) => groupKey(a).localeCompare(groupKey(b))).forEach((x) => {
                  const k = groupKey(x);
                  const g = groups.get(k);
                  if (g) g.push(x);
                  else groups.set(k, [x]);
                });
                groups.forEach((g, k) => {
                  const ck = `main|${k}`;
                  const isCollapsed = collapsed[ck] ?? true; // collapsed to a count row by default
                  const buys = g.map((x) => x.buyby).filter(Boolean).sort();
                  const overdue = g.some((x) => x.days != null && x.days <= 0);
                  parts.push(
                    <tr
                      key={`g:${k}`}
                      onClick={() => toggleCollapsed(ck)}
                      title="Click to expand / collapse this package"
                      style={{ background: 'var(--surface-soft)', cursor: 'pointer' }}
                    >
                      <td colSpan={colCount} style={{ ...td, font: 'var(--text-caption)', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'normal' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--muted)' }}>{isCollapsed ? '▸' : '▾'}</span>
                          <span>{k}</span>
                          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({g.length} item{g.length === 1 ? '' : 's'})</span>
                          <span style={{ flex: 1 }} />
                          {buys[0] && <span style={{ font: 'var(--text-mono-sm)', fontWeight: 600, color: overdue ? 'var(--status-order-now-ink)' : 'var(--muted)' }}>Buy-By {fmtMDY(buys[0])}</span>}
                        </span>
                      </td>
                    </tr>,
                    ...(isCollapsed ? [] : g.map((x, i) => renderRow(x, `g:${k}:r${i}`))),
                  );
                });
              }
              if (shown.length === 0) {
                parts.push(<tr key="empty"><td colSpan={colCount} style={{ ...td, color: 'var(--muted)', textAlign: 'center' }}>No blocking submittals — clear.</td></tr>);
              }
              return parts;
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
