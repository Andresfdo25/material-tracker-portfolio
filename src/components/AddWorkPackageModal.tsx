// AddWorkPackageModal.tsx — adds a work-package section to the material list, picked
// from the catalog. Duplicates are allowed (multi-phase projects reuse the same package).
//
// Creating a work package that ISN'T in the catalog was removed here (batch 43) and now
// lives only in Settings & Catalogs. The reason is what the field showed: a custom title
// is invented for one project and never reused, so every time it came up the PM was asked
// "add this to the global catalog?" — a decision with no good answer, on a list that
// already covers what the projects actually carry. Making it a settings-only, deliberate
// act removes the interruption from the daily path.
import { useApp } from '../store/useApp';
import { prefixCompare } from '../store/logic';
import { Modal } from './ds/Modal';

export function AddWorkPackageModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { db, actions } = useApp();
  const existing = new Set(db.packages.filter((p) => p.projectId === projectId).map((p) => p.prefix));

  const pick = (prefix: string, label: string) => {
    actions.addManualPackage(projectId, prefix, label);
    onClose();
  };

  return (
    <Modal title="Add work package" onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--muted)', marginBottom: 8 }}>
          Pick a work package from the catalog to add an empty section to this project's material list.
          Adding the same package twice is fine — e.g. separate phases or areas.
        </div>
        {[...db.catalog].sort((a, b) => prefixCompare(a.prefix, b.prefix)).map((w) => {
          const already = existing.has(w.prefix);
          return (
            <button
              key={w.prefix}
              type="button"
              onClick={() => pick(w.prefix, w.label)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left',
                border: '1px solid var(--hairline)', background: 'var(--canvas)', borderRadius: 'var(--radius-sm)',
                padding: '10px 14px', cursor: 'pointer',
                font: 'var(--text-body)', color: 'var(--ink)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-soft)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--canvas)'; }}
            >
              <span>{w.label}</span>
              {already && <span style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>already in project — adds a duplicate</span>}
            </button>
          );
        })}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)', font: 'var(--text-caption)', color: 'var(--muted)' }}>
          Not on the list? New work packages are created once, in <strong>Settings &amp; Catalogs</strong> (⚙ in the header) —
          from there they show up here for every project.
        </div>
      </div>
    </Modal>
  );
}
