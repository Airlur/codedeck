import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Code2, Eye, GripVertical, Pencil, Pin, PinOff, RotateCcw, Share2, Trash2 } from 'lucide-react';
import { useMemo } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { CategoryRecord, TagRecord, ToolViewModel } from '@/types/schema';

interface DashboardProps {
  tools: ToolViewModel[];
  categories: CategoryRecord[];
  tags: TagRecord[];
  totalToolCount: number;
  readOnly?: boolean;
  onEdit: (toolId: string) => void;
  onRun: (toolId: string) => void;
  onDelete: (toolId: string) => void;
  onShare: (toolId: string) => void;
  onTogglePinned: (toolId: string) => void;
  onResetOverride: (repoId: string) => void;
  onReorder: (nextOrderedToolIds: string[]) => void;
  onResetFilter?: () => void;
}

interface SortableCardProps {
  tool: ToolViewModel;
  categoryMap: Map<string, CategoryRecord>;
  tagMap: Map<string, TagRecord>;
  readOnly: boolean;
  onEdit: (toolId: string) => void;
  onRun: (toolId: string) => void;
  onDelete: (toolId: string) => void;
  onShare: (toolId: string) => void;
  onTogglePinned: (toolId: string) => void;
  onResetOverride: (repoId: string) => void;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function SortableCard({
  tool,
  categoryMap,
  tagMap,
  readOnly,
  onEdit,
  onRun,
  onDelete,
  onShare,
  onTogglePinned,
  onResetOverride,
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tool.id,
    disabled: readOnly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  };

  const category = tool.categoryId ? categoryMap.get(tool.categoryId) : null;
  const categoryNameNormalized = category ? normalizeName(category.name) : null;
  const tagRecords = useMemo(
    () =>
      tool.tagIds
        .map((id) => tagMap.get(id))
        .filter(Boolean)
        .filter((tag) => normalizeName((tag as TagRecord).name) !== categoryNameNormalized) as TagRecord[],
    [categoryNameNormalized, tagMap, tool.tagIds],
  );

  const isRepoBase = tool.origin === 'repo' && !tool.isOverride;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`will-change-transform rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-150 ${
        isDragging ? 'z-20 opacity-70 shadow-xl' : 'hover:shadow-md'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{tool.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{tool.description || '暂无描述'}</p>
        </div>
        {!readOnly ? (
          <button
            type="button"
            className="cursor-grab rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
            {...attributes}
            {...listeners}
            title="拖拽排序"
            style={{ touchAction: 'none' }}
          >
            <GripVertical size={16} />
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex min-h-6 flex-wrap items-center gap-2">
        {category ? <Badge color={category.color}>{category.name}</Badge> : null}
        {tagRecords.map((tag) => (
          <Badge key={tag.id} color={tag.color}>
            {tag.name}
          </Badge>
        ))}
        <Badge color={tool.isPublic !== false ? '#2563eb' : '#dc2626'}>
          {tool.isPublic !== false ? '公开' : '私密'}
        </Badge>
        {tool.isOverride ? <Badge color="#d946ef">本地覆盖</Badge> : null}
        {isRepoBase ? <Badge color="#0ea5e9">仓库基线</Badge> : null}
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
        <Code2 size={13} /> {tool.fileName}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" className="h-8 px-2.5" onClick={() => onRun(tool.id)}>
          <Eye size={14} /> 运行
        </Button>
        <Button
          variant="custom"
          className="h-8 border border-green-200 bg-green-50 px-2.5 text-green-700 hover:bg-green-100"
          onClick={() => onShare(tool.id)}
        >
          <Share2 size={14} /> 分享
        </Button>
        {!readOnly ? (
          <Button
            variant="custom"
            className="h-8 border border-indigo-200 bg-indigo-50 px-2.5 text-indigo-700 hover:bg-indigo-100"
            onClick={() => onEdit(tool.id)}
          >
            <Pencil size={14} /> 编辑
          </Button>
        ) : null}
        {!readOnly ? (
          <Button
            variant="custom"
            className={
              tool.pinned
                ? 'h-8 border border-amber-500 bg-amber-500 px-2.5 text-white hover:bg-amber-600'
                : 'h-8 border border-amber-200 bg-amber-50 px-2.5 text-amber-700 hover:bg-amber-100'
            }
            onClick={() => onTogglePinned(tool.id)}
          >
            {tool.pinned ? <PinOff size={14} /> : <Pin size={14} />} {tool.pinned ? '取消置顶' : '置顶'}
          </Button>
        ) : null}

        {!readOnly && tool.baseRepoToolId && tool.isOverride ? (
          <Button
            variant="secondary"
            className="h-8 px-2.5"
            onClick={() => onResetOverride(tool.baseRepoToolId as string)}
            title="恢复仓库版本"
          >
            <RotateCcw size={14} /> 恢复
          </Button>
        ) : null}

        {!readOnly ? (
          <Button variant="danger" className="h-8 px-2.5" onClick={() => onDelete(tool.id)}>
            <Trash2 size={14} /> 删除
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function Dashboard({
  tools,
  categories,
  tags,
  totalToolCount,
  readOnly = false,
  onEdit,
  onRun,
  onDelete,
  onShare,
  onTogglePinned,
  onResetOverride,
  onReorder,
  onResetFilter,
}: DashboardProps) {
  const sensors = useSensors(useSensor(PointerSensor));
  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const tagMap = useMemo(() => new Map(tags.map((item) => [item.id, item])), [tags]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tools.findIndex((item) => item.id === active.id);
    const newIndex = tools.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const moved = arrayMove(tools, oldIndex, newIndex).map((item) => item.id);
    onReorder(moved);
  };

  if (tools.length === 0) {
    if (totalToolCount > 0) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-900">当前筛选无结果</h2>
          <p className="mt-2 text-sm text-slate-500">请清空搜索词或切换分类/标签筛选。</p>
          {onResetFilter ? (
            <div className="mt-4">
              <Button variant="secondary" onClick={onResetFilter}>
                清空搜索与筛选
              </Button>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <h2 className="text-lg font-semibold text-slate-900">还没有工具</h2>
        <p className="mt-2 text-sm text-slate-500">点击右上角“新建工具”开始。</p>
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tools.map((tool) => (
          <SortableCard
            key={tool.id}
            tool={tool}
            categoryMap={categoryMap}
            tagMap={tagMap}
            readOnly={readOnly}
            onEdit={onEdit}
            onRun={onRun}
            onDelete={onDelete}
            onShare={onShare}
            onTogglePinned={onTogglePinned}
            onResetOverride={onResetOverride}
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tools.map((item) => item.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => (
            <SortableCard
              key={tool.id}
              tool={tool}
              categoryMap={categoryMap}
              tagMap={tagMap}
              readOnly={readOnly}
              onEdit={onEdit}
              onRun={onRun}
              onDelete={onDelete}
              onShare={onShare}
              onTogglePinned={onTogglePinned}
              onResetOverride={onResetOverride}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
