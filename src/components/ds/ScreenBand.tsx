// ScreenBand.tsx — the visual grammar of the LIST screens (lote 67): the header, the
// scope control, the labeled band, a section head and the empty state. Submittals is
// composed entirely from these pieces.
//
// Why it doesn't reuse Overview's: `Band` / `SectionHead` live inside `OverviewScreen.tsx`
// and are local on purpose — that screen is a big board the user has already approved, and
// pulling the arrangement out to share it would mean touching it without a reason. This is
// the SAME grammar (small-caps label over a navy rule, title with controls to the right on
// the same line, one-line caption below) resolved for content that's a list, not a board.
// If the two ever need to change together, that's the moment to unify them, not before.
//
// Everything visual lives in `styles/screens.css`: this file is only structure.
import type { ReactNode } from 'react';

/** The screen header: title with its icon, one-line caption, and the scope controls
 * aligned to the right on the same line as the title. */
export function ScreenHead({ icon, title, caption, right }: {
  icon?: string;
  title: string;
  caption?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="screenhead">
      <div className="screenhead__row">
        <div className="screenhead__title">{icon ? `${icon} ` : ''}{title}</div>
        <span style={{ flex: 1, minWidth: 0 }} />
        {right}
      </div>
      {caption != null && <div className="screenhead__caption">{caption}</div>}
    </div>
  );
}

/** Project + "All Projects" as ONE control. Separate, the checkbox read as just another
 * filter in the row below instead of as the whole screen's scope. */
export function ScopeControl({ projects, value, onChange, allProjects, onAllProjects }: {
  projects: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  allProjects: boolean;
  onAllProjects: (v: boolean) => void;
}) {
  return (
    <span className="scope-group">
      <select
        className="scope-group__select"
        value={value}
        disabled={allProjects}
        onChange={(e) => onChange(e.target.value)}
        title={allProjects ? 'Showing every active project — clear the toggle to pick one' : 'Pick the project this screen reads'}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <label className="scope-group__toggle" title="Read every active project at once">
        <input
          type="checkbox"
          checked={allProjects}
          onChange={(e) => onAllProjects(e.target.checked)}
          style={{ width: 17, height: 17, margin: 0, cursor: 'pointer', accentColor: 'var(--brand-slate)' }}
        />
        All projects
      </label>
    </span>
  );
}

/** A band: the small-caps label over the navy rule and, below, its sections. */
export function Band({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <div className="band-label">{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>{children}</div>
    </section>
  );
}

/** A section head inside a band: the ▾, the badge that names it, the count in mono, and
 * the caption below aligned with the badge. */
export function SectionHead({ collapsed, onToggle, badge, count, caption }: {
  collapsed: boolean;
  onToggle: () => void;
  badge: ReactNode;
  count: number;
  caption: ReactNode;
}) {
  return (
    <div>
      <div className="section-head">
        <button
          type="button"
          className={`icon-btn icon-btn--bare section-toggle${collapsed ? '' : ' is-on'}`}
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand this section' : 'Collapse this section'}
          title={collapsed ? 'Expand this section' : 'Collapse this section'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        {badge}
        <span className="section-count">{count}</span>
      </div>
      <div className="section-caption">{caption}</div>
    </div>
  );
}

/** A resolved section is good news and has to read as one — it used to be a centered
 * table cell in muted ink, identical to an empty data row. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state__mark">✓</span>
      <span className="empty-state__text">{children}</span>
    </div>
  );
}
