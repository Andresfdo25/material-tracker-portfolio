import type { ReactNode } from 'react';

export interface SignatureCardProps {
  tone?: 'coral' | 'forest' | 'dark' | 'cream';
  eyebrow?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}

const TONES = {
  coral: { background: 'var(--signature-coral)', color: 'var(--on-primary)' },
  forest: { background: 'var(--signature-forest)', color: 'var(--on-primary)' },
  dark: { background: 'var(--surface-dark)', color: 'var(--on-dark)' },
  cream: { background: 'var(--signature-cream)', color: 'var(--ink)' },
} as const;

/** SignatureCard — the brand voltage moment. Use to punctuate long scrolls, never as a small accent. */
export function SignatureCard({ tone = 'coral', eyebrow, title, children, action }: SignatureCardProps) {
  const t = TONES[tone];
  return (
    <div style={{ background: t.background, color: t.color, borderRadius: 'var(--radius-lg)', padding: 'var(--space-xxl)', boxSizing: 'border-box' }}>
      {eyebrow && (
        <div style={{ font: 'var(--text-caption)', letterSpacing: 'var(--tracking-caption)', textTransform: 'uppercase', opacity: 0.75, marginBottom: 'var(--space-md)' }}>
          {eyebrow}
        </div>
      )}
      {title && <h3 style={{ font: 'var(--text-display-md)', margin: 0, marginBottom: 'var(--space-md)' }}>{title}</h3>}
      {children && <div style={{ font: 'var(--text-body)', fontSize: 16, lineHeight: 1.5, opacity: 0.92, maxWidth: 560 }}>{children}</div>}
      {action && <div style={{ marginTop: 'var(--space-lg)' }}>{action}</div>}
    </div>
  );
}
