import { clsx } from 'clsx';
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={clsx(
        'h-4 w-4 cursor-pointer rounded border-slate-300 text-dopamine-blue focus:ring-2 focus:ring-blue-500/30',
        className,
      )}
      {...props}
    />
  );
});

Checkbox.displayName = 'Checkbox';
