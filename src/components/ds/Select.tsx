import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options?: (string | SelectOption)[];
  placeholder?: string;
  highlight?: boolean;
}

/** Select — strict-list dropdown (vendors, U/M, submittal status). */
export function Select({ options = [], placeholder, highlight = false, style, ...rest }: SelectProps) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <select
        style={{
          width: '100%',
          height: 44,
          boxSizing: 'border-box',
          padding: '0 36px 0 16px',
          font: 'var(--text-body)',
          color: 'var(--ink)',
          background: highlight ? 'var(--input-highlight)' : 'var(--canvas)',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: 'var(--hairline)',
          borderRadius: 'var(--radius-sm)',
          outline: 'none',
          appearance: 'none',
          WebkitAppearance: 'none',
          cursor: 'pointer',
          transition: 'border-color 120ms ease, box-shadow 120ms ease',
          ...style,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--info-border)';
          e.target.style.boxShadow = 'var(--shadow-focus)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--hairline)';
          e.target.style.boxShadow = 'none';
        }}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value;
          const lbl = typeof o === 'string' ? o : o.label;
          return (
            <option key={val} value={val}>
              {lbl}
            </option>
          );
        })}
      </select>
      <span
        style={{
          position: 'absolute',
          right: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--muted)',
          pointerEvents: 'none',
          fontSize: 12,
        }}
      >
        ▾
      </span>
    </span>
  );
}
