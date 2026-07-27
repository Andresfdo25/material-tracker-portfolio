import { useEffect, type ReactNode } from 'react';

export interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

/** Modal — centered overlay dialog used for Create Project, Add Work Package, Import, and Catalogs. */
export function Modal({ title, onClose, children, width = 560 }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(24,29,38,0.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px', overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: width, background: 'var(--canvas)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-pop)', border: '1px solid var(--hairline)', maxHeight: 'calc(calc(100vh / var(--ui-scale)) - 96px)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--hairline)' }}>
          <span style={{ font: 'var(--text-title-md)', color: 'var(--ink)' }}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, padding: 4 }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 24, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}
