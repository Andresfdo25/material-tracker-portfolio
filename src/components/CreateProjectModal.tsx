// CreateProjectModal.tsx — minimal by design: a new project only asks for its name and
// GC/Client (both required). No starter template — it lands straight on the Material
// List, where the PM adds work packages manually (Add Work Package / Import Materials).
import { useState } from 'react';
import { useApp } from '../store/useApp';
import { Modal } from './ds/Modal';
import { Button } from './ds/Button';
import { TextInput } from './ds/TextInput';

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const { actions, setActiveProjectId, nav } = useApp();
  const [name, setName] = useState('');
  const [gc, setGc] = useState('');
  const [supplyOnly, setSupplyOnly] = useState(false);

  const ready = name.trim() && gc.trim();

  const create = () => {
    if (!ready) return;
    const id = actions.createProject(name.trim(), gc.trim(), supplyOnly);
    setActiveProjectId(id);
    onClose();
    nav('list', { flash: `Project "${name.trim()}" created — add work packages or import a materials list to get started.` });
  };

  return (
    <Modal title="Create new project" onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-caption)', color: 'var(--body)' }}>
          Project name
          <TextInput placeholder="e.g. Sunset Tower Renovation" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-caption)', color: 'var(--body)' }}>
          GC / Client
          <TextInput
            placeholder="e.g. Vantree Builders"
            value={gc}
            onChange={(e) => setGc(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
          />
        </label>
        {/* Scope: supply only = we furnish the material but don't install it, so items
            close when they reach the jobsite. It's the DEFAULT every work package of the
            project inherits — individual packages can be flipped from their header. */}
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={supplyOnly}
            onChange={(e) => setSupplyOnly(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: 'var(--brand-slate)', marginTop: 1, flexShrink: 0 }}
          />
          <span style={{ font: 'var(--text-caption)', color: 'var(--body)' }}>
            <strong>Supply only</strong> — we furnish the material but don't install it
            <span style={{ display: 'block', color: 'var(--muted)', marginTop: 2 }}>
              Items close at 📍 On site instead of 🔩 Installed. Applies to every work package by default; you can flip a single package later.
            </span>
          </span>
        </label>
        <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
          The project opens empty on the Material List — add work packages there, or import a materials spreadsheet.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={create} disabled={!ready}>Create project</Button>
        </div>
      </div>
    </Modal>
  );
}
