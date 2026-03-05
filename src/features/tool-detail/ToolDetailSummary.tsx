import type { TodoItem } from '@/types/schema';

interface ToolDetailSummaryProps {
  todo: TodoItem[];
}

export function ToolDetailSummary({ todo }: ToolDetailSummaryProps) {
  const pending = todo.filter((item) => !item.completed).length;
  const total = todo.length;

  if (total === 0) {
    return <span className="text-xs text-slate-500">暂无 TODO</span>;
  }

  return (
    <span className="text-xs text-slate-600">
      TODO: {pending}/{total}
    </span>
  );
}
