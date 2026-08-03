// ThresholdsPopover.tsx — semaphore thresholds are material-list-specific (per
// project), not global. Small popover anchored under a button in the Material List header.
import { useState } from 'react';
import { useApp } from '../store/useApp';
import { Button } from './ds/Button';

/** The (i) info icon — hover or click reveals what a threshold slider actually does. */
function InfoTip({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label="What does this threshold do?"
        onClick={() => setShow((s) => !s)}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--border-strong)',
          background: 'var(--surface-soft)', color: 'var(--muted)', fontSize: 10, fontWeight: 700,
          lineHeight: 1, cursor: 'help', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        i
      </button>
      {show && (
        <span
          style={{
            position: 'absolute', bottom: '140%', left: '50%', transform: 'translateX(-72%)', zIndex: 70, width: 250,
            background: 'var(--surface-dark)', color: 'var(--on-dark)', font: 'var(--text-caption)', lineHeight: 1.45,
            padding: '10px 12px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-pop)',
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

export function ThresholdsPopover({ projectId }: { projectId: string }) {
  const { thresholdsFor, actions } = useApp();
  const [open, setOpen] = useState(false);
  const t = thresholdsFor(projectId);

  return (
    <div style={{ position: 'relative' }}>
      {/* Short label and 8px padding (lote 67): shares the "SET ACROSS THE PROJECT" group
          with the three stage/date popovers, which draw at 34px tall, and the group's own
          label already says this applies to the whole project — "window" repeated that
          and was what pushed the other two groups to a second line. The full name is still
          in the popover's own header. */}
      <Button variant="secondary" size="sm" style={{ padding: '8px 13px' }} onClick={() => setOpen((o) => !o)}>⏱ Order-soon</Button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: 'absolute', top: '110%', right: 0, zIndex: 40, width: 280,
            background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-pop)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          <div style={{ font: 'var(--text-caption)', fontWeight: 600, color: 'var(--muted)' }}>
            This project's Order-soon window
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: 'var(--text-caption)', color: 'var(--body)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Order-soon window
                <InfoTip>
                  <strong>"Order-soon window"</strong> (Yellow/Orange): flags items whose Buy-By date is within
                  this many days. Default is 7 days — raise it to start seeing the warning earlier.
                </InfoTip>
              </span>
              <span style={{ color: 'var(--muted)' }}>{t.window} d</span>
            </div>
            <input
              type="range" min={1} max={60} step={1} value={t.window}
              onChange={(e) => actions.setThresholds(projectId, { window: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
