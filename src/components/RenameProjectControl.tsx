// RenameProjectControl.tsx — the ✎ next to the project title on the navy band.
// Small popover to edit the Project name and GC/Client in place.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/useApp';
import type { Project } from '../store/types';
import { Button } from './ds/Button';

export function RenameProjectControl({ project }: { project: Project }) {
  const { actions } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [gc, setGc] = useState(project.gc);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openMenu = () => {
    setName(project.name);
    setGc(project.gc);
    setOpen((o) => !o);
  };

  const apply = () => {
    if (!name.trim() || !gc.trim()) return;
    actions.renameProject(project.id, name, gc);
    setOpen(false);
  };

  const input = {
    width: '100%', boxSizing: 'border-box' as const, height: 38, padding: '0 10px', borderRadius: 'var(--radius-sm)',
    borderWidth: 1, borderStyle: 'solid' as const, borderColor: 'var(--hairline)', font: 'var(--text-body)', color: 'var(--ink)', outline: 'none',
  };

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        title="Edit project name & GC/Client"
        aria-label="Edit project name and GC/Client"
        onClick={openMenu}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.75)', fontSize: 16, padding: '4px 6px', lineHeight: 1 }}
      >
        ✎
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '120%', left: 0, zIndex: 60, width: 340,
            background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-pop)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, font: 'var(--text-caption)', color: 'var(--body)' }}>
            Project name
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} autoFocus style={input} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, font: 'var(--text-caption)', color: 'var(--body)' }}>
            GC / Client
            <input value={gc} onChange={(e) => setGc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} style={input} />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={apply} disabled={!name.trim() || !gc.trim()}>Apply</Button>
          </div>
        </div>
      )}
    </span>
  );
}
