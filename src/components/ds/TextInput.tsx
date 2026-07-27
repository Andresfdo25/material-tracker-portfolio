import type { InputHTMLAttributes, ReactNode } from 'react';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  highlight?: boolean;
  invalid?: boolean;
  prefix?: ReactNode;
}

/** TextInput — 44px field, 6px radius. `highlight` paints the yellow driver-input background. */
export function TextInput({ highlight = false, invalid = false, prefix, style, ...rest }: TextInputProps) {
  const field = (
    <input
      style={{
        width: '100%',
        height: 44,
        boxSizing: 'border-box',
        padding: '12px 16px',
        paddingLeft: prefix ? 34 : 16,
        font: 'var(--text-body)',
        color: 'var(--ink)',
        background: highlight ? 'var(--input-highlight)' : 'var(--canvas)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: invalid ? 'var(--status-order-now-ink)' : 'var(--hairline)',
        borderRadius: 'var(--radius-sm)',
        outline: 'none',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
        ...style,
      }}
      onFocus={(e) => {
        e.target.style.borderColor = 'var(--info-border)';
        e.target.style.boxShadow = 'var(--shadow-focus)';
      }}
      onBlur={(e) => {
        e.target.style.borderColor = invalid ? 'var(--status-order-now-ink)' : 'var(--hairline)';
        e.target.style.boxShadow = 'none';
      }}
      {...rest}
    />
  );
  if (!prefix) return field;
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <span
        style={{
          position: 'absolute',
          left: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          font: 'var(--text-body)',
          color: 'var(--muted)',
          pointerEvents: 'none',
        }}
      >
        {prefix}
      </span>
      {field}
    </span>
  );
}
