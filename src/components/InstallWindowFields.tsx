// InstallWindowFields.tsx — the planned install window (installStart / installEnd) as a
// dumb controlled field pair, shared by the two entry doors: section 2 of
// BreakdownDeliveryModal (one item) and InstallWindowPopover (the whole package), so the
// same decision reads the same in both — one implementation, same vocabulary.
//
// The window is a PLAN (schedule), not a record: editing it never touches
// installed / installedDate / installations, and marking 🔩 never touches this.
//
// The END is the primary bound — "install by this date" is a complete plan on its own;
// the start is the optional refinement. `onChange` fires ONLY with valid states: an end
// before the start is rejected here (the picker snaps back, the hint below says why) and
// never reaches the parent.
import { useState } from 'react';
import { installWindowSummary } from '../store/logic';

export function InstallWindowFields({ start, end, onChange, disabled = false }: {
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
  disabled?: boolean;
}) {
  const [rejected, setRejected] = useState(false);
  const emit = (next: { start: string; end: string }) => {
    if (next.start && next.end && next.end < next.start) {
      setRejected(true); // invalid transition — held back from the parent
      return;
    }
    setRejected(false);
    onChange(next);
  };

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    primary?: boolean,
  ) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, font: 'var(--text-caption)', color: 'var(--body)', flex: '1 1 140px' }}>
      <span>
        {label}
        {!primary && <span style={{ color: 'var(--muted)' }}> (optional)</span>}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          type="date"
          value={value}
          disabled={disabled}
          onChange={(e) => set(e.target.value)}
          style={{ height: 34, padding: '0 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--hairline)', font: 'var(--text-mono)', color: 'var(--ink)', background: 'var(--canvas)' }}
        />
        {/* Native date inputs have no clear button of their own in Chrome — the ✕ is how
            each bound comes off independently. */}
        {value && !disabled && (
          <button
            type="button"
            title={`Clear ${label.toLowerCase()}`}
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => set('')}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, padding: 2, color: 'var(--muted)' }}
          >
            ✕
          </button>
        )}
      </span>
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {field('Install by', end, (v) => emit({ start, end: v }), true)}
        {field('Starts', start, (v) => emit({ start: v, end }))}
      </div>
      {rejected ? (
        <div style={{ font: 'var(--text-caption)', color: 'var(--alert-ink)' }}>
          The end date can't be before the start — that change was not applied.
        </div>
      ) : (
        <div style={{ font: 'var(--text-caption)', color: 'var(--muted)' }}>
          {installWindowSummary(start, end)}
        </div>
      )}
    </div>
  );
}
