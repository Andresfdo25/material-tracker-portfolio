import type { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'canvas' | 'soft' | 'strong';
  pad?: string;
}

/** Card — the neutral content container. Flat by default, 10px radius, hairline border. */
export function Card({ tone = 'canvas', pad = 'var(--space-lg)', children, style, ...rest }: CardProps) {
  const tones = {
    canvas: { background: 'var(--canvas)', border: '1px solid var(--hairline)' },
    soft: { background: 'var(--surface-soft)', border: '1px solid var(--hairline)' },
    strong: { background: 'var(--surface-strong)', border: 'none' },
  } as const;
  return (
    <div style={{ borderRadius: 'var(--radius-md)', padding: pad, boxSizing: 'border-box', ...tones[tone], ...style }} {...rest}>
      {children}
    </div>
  );
}
