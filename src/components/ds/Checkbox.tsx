export interface CheckboxProps {
  checked?: boolean;
  label?: string;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

/** Checkbox — Delivered / In-stock toggle and import-row Include toggle. */
export function Checkbox({ checked = false, label, disabled = false, onChange }: CheckboxProps) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-xs)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        font: 'var(--text-body)',
        color: 'var(--ink)',
      }}
    >
      <span
        onClick={() => !disabled && onChange && onChange(!checked)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 'var(--radius-xs)',
          border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border-strong)'}`,
          background: checked ? 'var(--primary)' : 'var(--canvas)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--on-primary)',
          fontSize: 12,
          lineHeight: 1,
          flexShrink: 0,
          transition: 'background 120ms ease, border-color 120ms ease',
        }}
      >
        {checked && '✓'}
      </span>
      {label}
    </label>
  );
}
