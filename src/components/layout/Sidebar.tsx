import { Edit2, Folder, FolderOpen, Pin, Plus, Tags, Trash2 } from 'lucide-react';

import type { DashboardFilter } from '@/app/state';
import { Button } from '@/components/ui/Button';
import type { CategoryRecord, TagRecord, ToolViewModel } from '@/types/schema';

interface SidebarProps {
  tools: ToolViewModel[];
  categories: CategoryRecord[];
  tags: TagRecord[];
  filter: DashboardFilter;
  readOnly?: boolean;
  onFilterChange: (next: DashboardFilter) => void;
  onCreateCategory: () => void;
  onEditCategory: (id: string) => void;
  onDeleteCategory: (id: string) => void;
  onCreateTag: () => void;
  onEditTag: (id: string) => void;
  onDeleteTag: (id: string) => void;
}

function countByCategory(tools: ToolViewModel[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const tool of tools) {
    if (!tool.categoryId) continue;
    map.set(tool.categoryId, (map.get(tool.categoryId) ?? 0) + 1);
  }
  return map;
}

function countByTag(tools: ToolViewModel[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const tool of tools) {
    for (const tagId of tool.tagIds) {
      map.set(tagId, (map.get(tagId) ?? 0) + 1);
    }
  }
  return map;
}

export function Sidebar({
  tools,
  categories,
  tags,
  filter,
  readOnly = false,
  onFilterChange,
  onCreateCategory,
  onEditCategory,
  onDeleteCategory,
  onCreateTag,
  onEditTag,
  onDeleteTag,
}: SidebarProps) {
  const categoryCounter = countByCategory(tools);
  const tagCounter = countByTag(tools);

  const visibleCategories = categories;
  const visibleTags = tags;

  return (
    <aside className="flex h-full w-72 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center border-b border-slate-200 px-4">
        <h1 className="text-[44px] font-semibold leading-none text-slate-900">CodeDeck</h1>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3">
        <section className="mb-4 space-y-1">
          <button
            type="button"
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
              filter.scope === 'all' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
            onClick={() => onFilterChange({ scope: 'all', categoryId: null, tagId: null })}
          >
            <span className="flex items-center gap-2">
              <FolderOpen size={16} /> 全部
            </span>
            <span className="text-xs opacity-80">{tools.length}</span>
          </button>

          <button
            type="button"
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
              filter.scope === 'pinned' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
            onClick={() => onFilterChange({ scope: 'pinned', categoryId: null, tagId: null })}
          >
            <span className="flex items-center gap-2">
              <Pin size={16} /> 置顶
            </span>
            <span className="text-xs opacity-80">{tools.filter((item) => item.pinned).length}</span>
          </button>
        </section>

        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Folder size={14} /> 分类
            </div>
            {!readOnly ? (
              <button
                type="button"
                onClick={onCreateCategory}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="新增分类"
              >
                <Plus size={14} />
              </button>
            ) : null}
          </div>
          <div className="space-y-1">
            {visibleCategories.map((category) => (
              <div key={category.id} className="group flex items-center gap-1 rounded-lg px-1 py-0.5 hover:bg-slate-50">
                <button
                  type="button"
                  className={`flex flex-1 items-center justify-between rounded-lg px-2 py-2 text-left text-sm ${
                    filter.scope === 'category' && filter.categoryId === category.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() =>
                    onFilterChange({
                      scope: 'category',
                      categoryId: category.id,
                      tagId: null,
                    })
                  }
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                    {category.name}
                  </span>
                  <span className="text-xs opacity-80">{categoryCounter.get(category.id) ?? 0}</span>
                </button>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => onEditCategory(category.id)}
                    className="hidden rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 group-hover:inline-flex"
                    title="编辑分类"
                  >
                    <Edit2 size={13} />
                  </button>
                ) : null}
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => onDeleteCategory(category.id)}
                    className="hidden rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:inline-flex"
                    title="删除分类"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Tags size={14} /> 标签
            </div>
            {!readOnly ? (
              <button
                type="button"
                onClick={onCreateTag}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="新增标签"
              >
                <Plus size={14} />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 px-2">
            {visibleTags.map((tag) => {
              const active = filter.scope === 'tag' && filter.tagId === tag.id;
              return (
                <div key={tag.id} className="group relative inline-flex items-center">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                      active ? 'border-transparent bg-slate-900 text-white' : 'hover:brightness-95'
                    }`}
                    style={
                      active
                        ? undefined
                        : {
                            borderColor: `${tag.color}66`,
                            color: tag.color,
                            backgroundColor: `${tag.color}15`,
                          }
                    }
                    onClick={() => onFilterChange({ scope: 'tag', categoryId: null, tagId: tag.id })}
                  >
                    <span>{tag.name}</span>
                    <span className="opacity-80">{tagCounter.get(tag.id) ?? 0}</span>
                  </button>

                  {!readOnly ? (
                    <div className="pointer-events-none absolute -right-1 -top-1 hidden items-center gap-1 rounded-full border border-slate-200 bg-white p-0.5 shadow-sm group-hover:flex group-hover:pointer-events-auto">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEditTag(tag.id);
                        }}
                        className="rounded-full p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        title="编辑标签"
                      >
                        <Edit2 size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteTag(tag.id);
                        }}
                        className="rounded-full p-0.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        title="删除标签"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {!readOnly ? (
        <div className="border-t border-slate-200 p-3">
          <Button className="w-full justify-center" onClick={onCreateCategory}>
            <Plus size={14} /> 新增分类
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
