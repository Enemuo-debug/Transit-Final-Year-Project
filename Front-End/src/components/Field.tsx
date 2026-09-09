import { useId } from 'react';

interface FieldProps {
  label: string;
  icon: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
}

export function Field({
  label,
  icon,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
}: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label-caps text-on-surface-variant">
        {label}
      </label>
      <div className="flex items-center gap-2 bg-surface-dim px-3 hairline transition-colors focus-within:border-on-tertiary-container">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent py-3 text-[14px] text-on-surface placeholder:text-outline"
        />
      </div>
      {error ? (
        <span className="data-mono text-[11px] text-error">{error}</span>
      ) : null}
    </div>
  );
}