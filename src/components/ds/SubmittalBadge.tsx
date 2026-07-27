export interface SubmittalBadgeProps {
  status?: string;
}

type Tone = 'neutral' | 'info' | 'success' | 'alert' | 'muted';

const SUBMITTAL: Record<string, Tone> = {
  Pending: 'neutral',
  'In Review': 'info',
  Approved: 'success',
  'Appr. as Noted': 'success',
  'Revise & Resubmit': 'alert',
  'N/A': 'muted',
};

const TONES: Record<Tone, { bg: string; ink: string; bd: string }> = {
  neutral: { bg: 'var(--surface-soft)', ink: 'var(--body)', bd: 'var(--hairline)' },
  info: { bg: 'color-mix(in srgb, var(--info-border) 14%, white)', ink: 'var(--info)', bd: 'color-mix(in srgb, var(--info-border) 45%, white)' },
  success: { bg: 'color-mix(in srgb, var(--success-border) 16%, white)', ink: 'var(--success)', bd: 'color-mix(in srgb, var(--success-border) 45%, white)' },
  alert: { bg: 'color-mix(in srgb, var(--status-order-now) 45%, white)', ink: 'var(--status-order-now-ink)', bd: 'color-mix(in srgb, var(--status-order-now) 70%, white)' },
  muted: { bg: 'transparent', ink: 'var(--muted)', bd: 'var(--hairline)' },
};

/** SubmittalBadge — the submittal-workflow state that gates ORDER NOW into ready vs blocked. */
export function SubmittalBadge({ status = 'Pending' }: SubmittalBadgeProps) {
  const tone = TONES[SUBMITTAL[status] ?? 'neutral'];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        font: 'var(--text-caption)',
        fontWeight: 500,
        color: tone.ink,
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
        padding: '3px 9px',
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  );
}
