import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'custom';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-dopamine-blue text-white hover:bg-blue-700 border border-dopamine-blue shadow-sm',
  secondary:
    'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
  danger: 'bg-dopamine-red text-white border border-dopamine-red hover:bg-red-700',
  ghost: 'bg-transparent text-slate-600 border border-transparent hover:bg-slate-100',
  custom: '',
};

export function Button({
  children,
  className,
  variant = 'secondary',
  type = 'button',
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dopamine-blue/40 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
