// CompletedProjectsModal.tsx — the "Completed Projects" folder. Closed (archived)
// projects leave the main dashboard and live here; they open read-only, or can be
// reopened back into the active list.
import { useApp } from '../store/useApp';
import { Modal } from './ds/Modal';
import { Button } from './ds/Button';

export function CompletedProjectsModal({ onClose }: { onClose: () => void }) {
  const { db, actions, setActiveProjectId, nav } = useApp();
  const archived = db.projects
    .filter((p) => p.archived)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const view = (id: string) => {
    setActiveProjectId(id);
    nav('list');
    onClose();
  };

  return (
    <Modal title="📁 Completed Projects" onClose={onClose} width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {archived.length === 0 && (
          <div style={{ color: 'var(--muted)', font: 'var(--text-body)', textAlign: 'center', padding: 20 }}>
            No completed projects yet. "Close Project" on a material list moves it here.
          </div>
        )}
        {archived.map((p) => {
          const wpIds = new Set(db.packages.filter((w) => w.projectId === p.id).map((w) => w.id));
          const itemCount = db.items.filter((i) => wpIds.has(i.wpId)).length;
          return (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', background: 'var(--surface-soft)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ font: 'var(--text-title-sm)', color: 'var(--ink)' }}>{p.name}</div>
                <div style={{ font: 'var(--text-caption)', color: 'var(--muted)', marginTop: 2 }}>
                  {p.gc} · {wpIds.size} package{wpIds.size === 1 ? '' : 's'} · {itemCount} item{itemCount === 1 ? '' : 's'} · closed {p.archivedAt ?? ''}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => view(p.id)}>👁 View (read-only)</Button>
              <Button variant="ghost" size="sm" onClick={() => actions.reopenProject(p.id)}>↩ Reopen</Button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
