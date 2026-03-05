interface SyncStatusBannerProps {
  message: string;
  type: 'idle' | 'success' | 'error' | 'warn';
}

export function SyncStatusBanner({ message, type }: SyncStatusBannerProps) {
  if (!message) return null;

  const colorClass =
    type === 'success'
      ? 'border-green-200 bg-green-50 text-green-800'
      : type === 'error'
        ? 'border-red-200 bg-red-50 text-red-800'
        : type === 'warn'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-slate-200 bg-slate-50 text-slate-700';

  return <div className={`border-b px-4 py-2 text-xs ${colorClass}`}>{message}</div>;
}
