import { CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'warn' | 'info';

interface ToastProps {
  open: boolean;
  message: string;
  type: ToastType;
}

const typeStyle: Record<ToastType, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-slate-200 bg-white text-slate-700',
};

const typeIcon: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error: <XCircle size={16} />,
  warn: <AlertTriangle size={16} />,
  info: <Info size={16} />,
};

export function Toast({ open, message, type }: ToastProps) {
  return (
    <div className="pointer-events-none fixed right-5 top-7 z-[70] -translate-y-1/2">
      <div
        className={`transition-all duration-200 ${open ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}
      >
        <div
          className={`flex max-w-[420px] items-center gap-2 rounded-xl border px-3 py-2 text-sm shadow-soft ${typeStyle[type]}`}
        >
          {typeIcon[type]}
          <span>{message}</span>
        </div>
      </div>
    </div>
  );
}

export type { ToastType };
