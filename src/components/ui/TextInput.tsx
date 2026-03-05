import { clsx } from 'clsx';
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={clsx(
          'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-dopamine-blue focus:ring-2 focus:ring-blue-500/20',
          className,
        )}
        {...props}
      />
    );
  },
);

TextInput.displayName = 'TextInput';
