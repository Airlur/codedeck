import { clsx } from 'clsx';
import type { PropsWithChildren } from 'react';

interface BadgeProps {
  color?: string;
  className?: string;
}

export function Badge({ children, color, className }: PropsWithChildren<BadgeProps>) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{
        color: color ?? '#334155',
        borderColor: color ? `${color}55` : '#cbd5e1',
        backgroundColor: color ? `${color}1F` : '#f1f5f9',
      }}
    >
      {children}
    </span>
  );
}
