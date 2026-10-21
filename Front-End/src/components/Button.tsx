import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'outline';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-on-tertiary-container text-white hover:bg-on-tertiary-container/90',
  ghost: 'bg-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
  outline: 'hairline bg-transparent text-on-surface hover:bg-surface-container-high',
  danger: 'bg-transparent text-error hover:bg-error/10 hover:text-error',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'primary', children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`label-caps inline-flex items-center justify-center gap-2 px-4 py-3 transition-all duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0 ${VARIANT_CLASS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}