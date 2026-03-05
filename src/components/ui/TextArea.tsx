import { clsx } from 'clsx';
import type { TextareaHTMLAttributes } from 'react';

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        'min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-dopamine-blue focus:ring-2 focus:ring-blue-500/20',
        className,
      )}
      {...props}
    />
  );
}
