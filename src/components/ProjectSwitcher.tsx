// ProjectSwitcher.tsx — the project picker on the navy band.
// Prev/next arrows step through the (alphabetical) active-projects list, the
// native <select> stays for the familiar dropdown, and 🔍 opens a type-to-filter
// popover for jumping to a project by name when the list gets long.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../store/types';

export function ProjectSwitcher({
  projects,
  project,
  onSelect,
}: {
  projects: Project[]; // active projects, already sorted
  project: Project; // currently open project
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLSpanElement>(null);

  const idx = projects.findIndex((p) => p.id === project.id);
  const prev = idx > 0 ? projects[idx - 1] : null;
  const next = idx >= 0 && idx < projects.length - 1 ? projects[idx + 1] : null;

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(s) || p.gc.toLowerCase().includes(s));
  }, [q, projects]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openSearch = () => {
    setQ('');
    setOpen((o) => !o);
  };

  const pick = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  // Square icon button styled to match the <select> so the group reads as one control.
  // The box is `.icon-btn --flush`'s; this only sizes it to the select's 36px. The canvas
  // fill lives in the class (not here) so the hover rule can still override it.
  const iconBtn: React.CSSProperties = {
    height: 36, width: 34, padding: 0, color: 'var(--body)', font: '600 15px/1 var(--font-text)',
  };

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        className={`icon-btn icon-btn--flush${open ? ' is-on' : ''}`}
        title="Search projects by name"
        aria-label="Search projects by name"
        aria-expanded={open}
        onClick={openSearch}
        style={iconBtn}
      >
        🔍
      </button>

      <select
        value={project.id}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          height: 36, border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)',
          background: 'var(--canvas)', font: 'var(--text-body)', color: 'var(--body)', padding: '0 10px', cursor: 'pointer', maxWidth: 260,
        }}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
        {idx < 0 && <option value={project.id}>📁 {project.name} (completed)</option>}
      </select>

      <button
        type="button"
        className="icon-btn icon-btn--flush"
        title={prev ? `Previous project — ${prev.name}` : 'No previous project'}
        aria-label="Previous project"
        onClick={() => prev && onSelect(prev.id)}
        disabled={!prev}
        style={iconBtn}
      >
        ▲
      </button>

      <button
        type="button"
        className="icon-btn icon-btn--flush"
        title={next ? `Next project — ${next.name}` : 'No next project'}
        aria-label="Next project"
        onClick={() => next && onSelect(next.id)}
        disabled={!next}
        style={iconBtn}
      >
        ▼
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: '120%', left: 0, zIndex: 60, width: 300,
            background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-pop)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) pick(matches[0].id);
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="Type a project name…"
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box', height: 36, padding: '0 10px', borderRadius: 'var(--radius-sm)',
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', outline: 'none',
            }}
          />
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {matches.length === 0 && (
              <div style={{ padding: '8px 10px', font: 'var(--text-caption)', color: 'var(--muted)' }}>No projects match.</div>
            )}
            {matches.map((p) => {
              const active = p.id === project.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className="menu-item"
                  onClick={() => pick(p.id)}
                  style={{
                    padding: '8px 10px',
                    ...(active ? { background: 'var(--brand-mint)', borderColor: 'var(--border-strong)' } : {}),
                    font: active ? '600 var(--text-body)' : 'var(--text-body)',
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                >
                  <span>{active ? '✓ ' : ''}{p.name}</span>
                  <span style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>{p.gc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}
