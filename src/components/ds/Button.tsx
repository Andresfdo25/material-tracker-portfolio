import type { ButtonHTMLAttributes, CSSProperties } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'legal';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  pill?: boolean;
}

/**
 * Button — the editorial CTA. Primary is near-black ink with a 12px radius; secondary
 * is a hairline-outlined button that pairs with it.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  pill = false,
  disabled = false,
  children,
  style,
  ...rest
}: ButtonProps) {
  const pad = size === 'sm' ? '10px 16px' : '16px 24px';
  const font = size === 'sm' ? 'var(--text-body)' : 'var(--text-button)';
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-xs)',
    font,
    fontWeight: 500,
    padding: variant === 'legal' ? '12px 10px' : pad,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: pill ? 'var(--radius-pill)' : variant === 'legal' ? 'var(--radius-xs)' : 'var(--radius-lg)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 120ms ease, border-color 120ms ease',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  };
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: { background: 'var(--primary)', color: 'var(--on-primary)', boxShadow: disabled ? 'none' : 'var(--shadow-button)' },
    secondary: { background: 'var(--canvas)', color: 'var(--ink)', borderColor: disabled ? 'var(--border-strong)' : 'var(--hairline)' },
    ghost: { background: 'transparent', color: 'var(--ink)' },
    legal: { background: 'var(--link)', color: 'var(--on-primary)', font: 'var(--text-legal)' },
  };
  return (
    <button type="button" disabled={disabled} style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </button>
  );
}
