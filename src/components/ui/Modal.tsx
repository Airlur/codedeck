import { clsx } from 'clsx';
import type { PropsWithChildren, ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, title, onClose, footer, className, children }: PropsWithChildren<ModalProps>) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={clsx('w-full max-w-2xl rounded-2xl bg-white shadow-soft', className)}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-slate-200 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
