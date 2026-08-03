import type { ButtonHTMLAttributes, CSSProperties } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'legal' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  pill?: boolean;
}

/**
 * Button — the editorial CTA. Primary is near-black ink with a 12px radius; secondary
 * is a hairline-outlined button that pairs with it.
 *
 * The hover / active / focus states live in `styles/controls.css` (`.btn`): an inline
 * style can't declare a pseudo-class. They're built out of `filter` + `transform`, which
 * no inline style here sets, so a caller that repaints the button (the red Delete
 * Project, the navy-band ghosts) keeps its colour and still responds.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  pill = false,
  disabled = false,
  children,
  className,
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
    borderRadius: pill ? 'var(--radius-pill)' : variant === 'legal' ? 'var(--radius-xs)' : 'var(--radius-lg)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  };
  // `ghost` deliberately declares NEITHER background nor borderColor: both are owned by
  // `.btn--ghost` in controls.css, which is what lets it carry a resting outline and a
  // hover wash built on `currentColor` (white over the navy band, ink over canvas).
  // A variant that sets them inline would win over the stylesheet and go flat again.
  // `danger` (lote 67) declares NOTHING for the same reason, and it's the stronger case:
  // its whole point is that the red only fills IN on hover/active, which is a state, and
  // a state can't be written inline. Colour, border and background all live in
  // `.btn--danger` — plus `.btn--danger.btn--on-dark` for the purple action band.
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: { background: 'var(--primary)', color: 'var(--on-primary)', borderColor: 'transparent', boxShadow: disabled ? 'none' : 'var(--shadow-button)' },
    secondary: { background: 'var(--canvas)', color: 'var(--ink)', borderColor: disabled ? 'var(--border-strong)' : 'var(--hairline)' },
    ghost: { color: 'var(--ink)' },
    // `--link-fill`, not `--link`: this is the blue as a BACKGROUND under white text, and
    // --link is re-declared lighter in dark mode so it survives as text on the canvas.
    // Pointing at it here would take white-on-blue from 5.8:1 down to 2.9:1.
    legal: { background: 'var(--link-fill)', color: 'var(--on-primary)', borderColor: 'transparent', font: 'var(--text-legal)' },
    danger: {},
  };
  return (
    <button
      type="button"
      disabled={disabled}
      className={['btn', `btn--${variant}`, className].filter(Boolean).join(' ')}
      style={{ ...base, ...variants[variant], ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
