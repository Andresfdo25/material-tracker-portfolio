import type { HTMLAttributes, ReactNode } from 'react';

export type BannerTone = 'info' | 'warning' | 'success' | 'danger';

export interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  tone?: BannerTone;
  icon?: ReactNode;
}

const TONES: Record<BannerTone, { bg: string; ink: string; bd: string }> = {
  info: { bg: 'color-mix(in srgb, var(--info-border) 10%, white)', ink: 'var(--info)', bd: 'var(--info-border)' },
  warning: { bg: 'color-mix(in srgb, var(--status-order-soon) 30%, white)', ink: 'var(--status-order-soon-ink)', bd: 'var(--status-order-soon)' },
  success: { bg: 'color-mix(in srgb, var(--success-border) 12%, white)', ink: 'var(--success)', bd: 'var(--success-border)' },
  danger: { bg: 'color-mix(in srgb, var(--status-order-now) 35%, white)', ink: 'var(--status-order-now-ink)', bd: 'var(--status-order-now)' },
};

/**
 * Banner — inline status message: unpublished-drafts warning, unmapped-import warning,
 * empty-state info, success toast-strip. Left accent keyed to tone.
 */
export function Banner({ tone = 'info', icon, children, style, ...rest }: BannerProps) {
  const t = TONES[tone];
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-sm)',
        alignItems: 'flex-start',
        background: t.bg,
        borderLeft: `3px solid ${t.bd}`,
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-sm) var(--space-md)',
        font: 'var(--text-body)',
        color: t.ink,
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ flexShrink: 0, lineHeight: 1.4 }}>{icon}</span>}
      <div>{children}</div>
    </div>
  );
}
