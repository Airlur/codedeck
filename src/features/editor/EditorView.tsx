import { clsx } from 'clsx';
import Editor from '@monaco-editor/react';
import { Code2, Columns2, Download, Eye, GripVertical, Pencil, Plus, Save, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { TextInput } from '@/components/ui/TextInput';
import {
  contentTypeByRuntime,
  ensureFileName,
  inferRuntimeFromFileName,
  runtimeToExtension,
  runtimeToLanguage,
} from '@/lib/utils/fileType';
import { createRunnerToken, openRunnerWindow } from '@/lib/utils/runner';
import type { AppSettings, CategoryRecord, TagRecord, TodoItem, ToolRuntime, ToolViewModel } from '@/types/schema';

interface EditorSubmitPayload {
  base: ToolViewModel | null;
  name: string;
  description: string;
  categoryId: string | null;
  tagIds: string[];
  isPublic: boolean;
  fileName: string;
  runtime: ToolRuntime;
  language: string;
  code: string;
  todo: TodoItem[];
  pinned: boolean;
  sortOrder: number;
}

interface EditorViewProps {
  open: boolean;
  tool: ToolViewModel | null;
  categories: CategoryRecord[];
  tags: TagRecord[];
  settings: AppSettings;
  onClose: () => void;
  onSave: (payload: EditorSubmitPayload) => void;
  onCreateTag: (name: string) => Promise<{ id: string; created: boolean }>;
  onDeleteTag: (id: string) => Promise<void>;
}

type ViewMode = 'split' | 'code' | 'preview';

const runtimeOptions: Array<{ runtime: ToolRuntime; label: string }> = [
  { runtime: 'html', label: '.html' },
  { runtime: 'javascript', label: '.js' },
  { runtime: 'css', label: '.css' },
  { runtime: 'markdown', label: '.md' },
  { runtime: 'json', label: '.json' },
  { runtime: 'text', label: '.txt' },
];

function splitFileName(fileName: string, fallbackRuntime: ToolRuntime): { baseName: string; runtime: ToolRuntime } {
  const trimmed = fileName.trim();
  if (!trimmed) return { baseName: 'untitled', runtime: fallbackRuntime };

  if (!trimmed.includes('.')) {
    return { baseName: trimmed, runtime: fallbackRuntime };
  }

  const segments = trimmed.split('.');
  const extRuntime = inferRuntimeFromFileName(trimmed);
  return {
    baseName: segments.slice(0, -1).join('.') || 'untitled',
    runtime: extRuntime,
  };
}

export function EditorView({
  open,
  tool,
  categories,
  tags,
  settings,
  onClose,
  onSave,
  onCreateTag,
  onDeleteTag,
}: EditorViewProps) {
  const toolId = tool?.id ?? null;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [baseName, setBaseName] = useState('untitled');
  const [runtime, setRuntime] = useState<ToolRuntime>('html');
  const [language, setLanguage] = useState('html');
  const [code, setCode] = useState(
    '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8" />\n  <title>New Tool</title>\n</head>\n<body>\n  <h1>Hello CodeDeck</h1>\n</body>\n</html>',
  );
  const [todo, setTodo] = useState<TodoItem[]>([]);
  const [todoInput, setTodoInput] = useState('');
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const [todoDeleteTarget, setTodoDeleteTarget] = useState<TodoItem | null>(null);
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [newTagName, setNewTagName] = useState('');
  const [previewToken, setPreviewToken] = useState(() => createRunnerToken());
  const [recentlyCreatedTagIds, setRecentlyCreatedTagIds] = useState<string[]>([]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const initializedKeyRef = useRef<string>('');
  const findWidgetObserverRef = useRef<MutationObserver | null>(null);
  const findWidgetCleanupRef = useRef<Array<() => void>>([]);
  const findHoverRestoreTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      initializedKeyRef.current = '';
      findWidgetObserverRef.current?.disconnect();
      findWidgetObserverRef.current = null;
      findWidgetCleanupRef.current.forEach((cleanup) => cleanup());
      findWidgetCleanupRef.current = [];
      if (findHoverRestoreTimerRef.current !== null) {
        window.clearTimeout(findHoverRestoreTimerRef.current);
        findHoverRestoreTimerRef.current = null;
      }
      delete document.body.dataset.codedeckSuppressMonacoFindHover;
      return;
    }

    const initKey = toolId ?? '__new__';
    if (initializedKeyRef.current === initKey) return;
    initializedKeyRef.current = initKey;

    setPreviewToken(createRunnerToken());
    setRecentlyCreatedTagIds([]);

    if (tool) {
      const split = splitFileName(tool.fileName, tool.runtime);
      setName(tool.name);
      setDescription(tool.description);
      setCategoryId(tool.categoryId);
      setTagIds(tool.tagIds);
      setIsPublic(tool.isPublic !== false);
      setBaseName(split.baseName);
      setRuntime(split.runtime);
      setLanguage(tool.language || runtimeToLanguage[split.runtime]);
      setCode(tool.code);
      setTodo(tool.todo);
      setTodoInput('');
      setEditingTodoId(null);
      setEditingTodoText('');
      setTodoDeleteTarget(null);
      setDraggingTodoId(null);
      setViewMode('split');
      setNewTagName('');
      setDetailOpen(false);
      return;
    }

    setName('');
    setDescription('');
    setCategoryId(null);
    setTagIds([]);
    setIsPublic(true);
    setBaseName('untitled');
    setRuntime('html');
    setLanguage('html');
    setCode(
      '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8" />\n  <title>New Tool</title>\n</head>\n<body>\n  <h1>Hello CodeDeck</h1>\n</body>\n</html>',
    );
    setTodo([]);
    setTodoInput('');
    setEditingTodoId(null);
    setEditingTodoText('');
    setTodoDeleteTarget(null);
    setDraggingTodoId(null);
    setViewMode('split');
    setNewTagName('');
    // New tool should open detail dialog first so user can fill name/metadata.
    setDetailOpen(true);
  }, [open, tool, toolId]);

  useEffect(() => {
    return () => {
      findWidgetObserverRef.current?.disconnect();
      findWidgetObserverRef.current = null;
      findWidgetCleanupRef.current.forEach((cleanup) => cleanup());
      findWidgetCleanupRef.current = [];
      if (findHoverRestoreTimerRef.current !== null) {
        window.clearTimeout(findHoverRestoreTimerRef.current);
        findHoverRestoreTimerRef.current = null;
      }
      delete document.body.dataset.codedeckSuppressMonacoFindHover;
    };
  }, []);

  useEffect(() => {
    setLanguage(runtimeToLanguage[runtime]);
  }, [runtime]);

  const finalFileName = ensureFileName(baseName, runtime);
  const editorTheme = 'vs-dark';

  const postPreview = useCallback(() => {
    if (!open) return;
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;

    frame.contentWindow.postMessage(
      {
        type: 'CODEDECK_RUNNER_RENDER',
        token: previewToken,
        title: name || `${baseName}.${runtimeToExtension[runtime]}`,
        code,
      },
      '*',
    );
  }, [baseName, code, name, open, previewToken, runtime, iframeRef]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      postPreview();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [postPreview, viewMode]);

  const handleEditorMount = useCallback((editorInstance: Monaco.editor.IStandaloneCodeEditor) => {
    const container = editorInstance.getContainerDomNode();

    const patchFindWidgetButtons = () => {
      const targets = container.querySelectorAll<HTMLElement>(
        '.find-widget .monaco-custom-toggle.codicon-find-selection, .find-widget > .button.codicon-widget-close',
      );

      targets.forEach((button) => {
        if (button.dataset.codedeckHoverPatched === '1') return;

        const suppressHover = () => {
          if (findHoverRestoreTimerRef.current !== null) {
            window.clearTimeout(findHoverRestoreTimerRef.current);
            findHoverRestoreTimerRef.current = null;
          }
          document.body.dataset.codedeckSuppressMonacoFindHover = '1';
        };

        const restoreHover = () => {
          if (findHoverRestoreTimerRef.current !== null) {
            window.clearTimeout(findHoverRestoreTimerRef.current);
          }
          // Keep suppression for a short window to avoid immediate enter/leave ping-pong.
          findHoverRestoreTimerRef.current = window.setTimeout(() => {
            delete document.body.dataset.codedeckSuppressMonacoFindHover;
            findHoverRestoreTimerRef.current = null;
          }, 120);
        };

        button.dataset.codedeckHoverPatched = '1';
        button.addEventListener('mouseenter', suppressHover);
        button.addEventListener('mouseleave', restoreHover);
        button.addEventListener('blur', restoreHover);

        findWidgetCleanupRef.current.push(() => {
          button.removeEventListener('mouseenter', suppressHover);
          button.removeEventListener('mouseleave', restoreHover);
          button.removeEventListener('blur', restoreHover);
          delete button.dataset.codedeckHoverPatched;
        });
      });
    };

    patchFindWidgetButtons();
    findWidgetObserverRef.current?.disconnect();

    const observer = new MutationObserver(() => {
      patchFindWidgetButtons();
    });

    observer.observe(container, {
      subtree: true,
      childList: true,
    });

    findWidgetObserverRef.current = observer;
  }, []);

  const handleSave = () => {
    const finalName = name.trim() || baseName.trim() || 'untitled';

    onSave({
      base: tool,
      name: finalName,
      description: description.trim(),
      categoryId,
      tagIds,
      isPublic,
      fileName: finalFileName,
      runtime,
      language,
      code,
      todo,
      pinned: tool?.pinned ?? false,
      sortOrder: tool?.sortOrder ?? 0,
    });
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: contentTypeByRuntime(runtime) });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = finalFileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleRunInNewTab = () => {
    openRunnerWindow({
      title: name || finalFileName,
      code,
    });
  };

  const toggleTag = (tagId: string) => {
    setTagIds((current) =>
      current.includes(tagId) ? current.filter((item) => item !== tagId) : [...current, tagId],
    );
  };

  const addTodo = () => {
    const text = todoInput.trim();
    if (!text) return;
    setTodo((current) => [
      ...current,
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text,
        completed: false,
        updatedAt: new Date().toISOString(),
      },
    ]);
    setTodoInput('');
  };

  const beginEditTodo = (item: TodoItem) => {
    setEditingTodoId(item.id);
    setEditingTodoText(item.text);
  };

  const saveEditingTodo = () => {
    const text = editingTodoText.trim();
    if (!editingTodoId || !text) return;

    setTodo((current) =>
      current.map((todoItem) =>
        todoItem.id === editingTodoId
          ? {
              ...todoItem,
              text,
              updatedAt: new Date().toISOString(),
            }
          : todoItem,
      ),
    );
    setEditingTodoId(null);
    setEditingTodoText('');
  };

  const moveTodo = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setTodo((current) => {
      const fromIndex = current.findIndex((item) => item.id === fromId);
      const toIndex = current.findIndex((item) => item.id === toId);
      if (fromIndex < 0 || toIndex < 0) return current;

      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const createTag = async () => {
    const text = newTagName.trim();
    if (!text) return;

    const result = await onCreateTag(text);
    setTagIds((current) => (current.includes(result.id) ? current : [...current, result.id]));
    if (result.created) {
      setRecentlyCreatedTagIds((current) => (current.includes(result.id) ? current : [...current, result.id]));
    }
    setNewTagName('');
  };

  const removeRecentTag = async (tagId: string) => {
    if (!recentlyCreatedTagIds.includes(tagId)) return;
    await onDeleteTag(tagId);
    setRecentlyCreatedTagIds((current) => current.filter((id) => id !== tagId));
    setTagIds((current) => current.filter((id) => id !== tagId));
  };

  if (!open) return null;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <TextInput value={baseName} onChange={(event) => setBaseName(event.target.value)} className="max-w-72" />
          <div className="w-28">
            <Select value={runtime} onChange={(event) => setRuntime(event.target.value as ToolRuntime)}>
              {runtimeOptions.map((item) => (
                <option key={item.runtime} value={item.runtime}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="justify-self-center">
          <div className="inline-flex rounded-lg border border-slate-200 p-1">
            <button
              type="button"
              className={clsx(
                'inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition',
                viewMode === 'split'
                  ? 'bg-dopamine-green text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
              onClick={() => setViewMode('split')}
            >
              <Columns2 size={15} /> 分屏
            </button>
            <button
              type="button"
              className={clsx(
                'inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition',
                viewMode === 'code'
                  ? 'bg-dopamine-green text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
              onClick={() => setViewMode('code')}
            >
              <Code2 size={15} /> 代码
            </button>
            <button
              type="button"
              className={clsx(
                'inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition',
                viewMode === 'preview'
                  ? 'bg-dopamine-green text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
              onClick={() => setViewMode('preview')}
            >
              <Eye size={15} /> 预览
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="custom"
            className="h-10 border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            onClick={() => setDetailOpen(true)}
          >
            <SlidersHorizontal size={15} /> 详情
          </Button>
          <Button
            variant="custom"
            className="h-10 border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            onClick={handleDownload}
          >
            <Download size={15} /> 下载
          </Button>
          <Button
            variant="custom"
            className="h-10 border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
            onClick={handleRunInNewTab}
          >
            <Eye size={15} /> 运行
          </Button>
          <Button variant="primary" className="h-10" onClick={handleSave}>
            <Save size={15} /> 保存
          </Button>
          <Button variant="danger" className="h-10" onClick={onClose}>
            返回
          </Button>
        </div>
      </header>

      <div className={`min-h-0 flex-1 ${viewMode === 'split' ? 'grid grid-cols-2' : 'grid grid-cols-1'}`}>
        <div
          className={clsx(
            'min-h-0',
            viewMode === 'preview' && 'hidden',
            viewMode === 'split' && 'border-r border-slate-200',
          )}
        >
          <Editor
            height="100%"
            language={language}
            value={code}
            onChange={(value) => setCode(value ?? '')}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: settings.editorFontSize,
              wordWrap: settings.editorWordWrap,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              fixedOverflowWidgets: true,
            }}
            theme={editorTheme}
          />
        </div>

        <div className={clsx('min-h-0 bg-white', viewMode === 'code' && 'hidden')}>
          <iframe
            ref={(node) => {
              iframeRef.current = node;
            }}
            title="CodeDeck Preview"
            src={`/runner.html?token=${encodeURIComponent(previewToken)}`}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-downloads"
            onLoad={() => postPreview()}
          />
        </div>
      </div>

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="工具详情" className="max-w-3xl">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-600">名称</label>
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="工具名称" />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-600">描述</label>
            <TextArea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="简要描述功能"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-600">分类</label>
            <Select value={categoryId ?? ''} onChange={(event) => setCategoryId(event.target.value || null)}>
              <option value="">未分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-600">发布可见性</label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <Checkbox checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
              公开到 `published.json`（关闭后仅本地/WebDAV可见）
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-600">标签</label>
            <div className="mb-2 flex items-center gap-2">
              <TextInput
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                placeholder="新建标签"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void createTag();
                  }
                }}
              />
              <Button variant="secondary" className="h-10 whitespace-nowrap" onClick={() => void createTag()}>
                <Plus size={14} /> 添加标签
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const active = tagIds.includes(tag.id);
                const removable = recentlyCreatedTagIds.includes(tag.id);

                return (
                  <div key={tag.id} className="group relative inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`rounded-full border px-2 py-1 text-xs ${
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
                    >
                      {tag.name}
                    </button>

                    {removable ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeRecentTag(tag.id);
                        }}
                        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-red-50 hover:text-red-600 group-hover:inline-flex"
                        title="删除刚新增的标签"
                      >
                        <X size={10} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-600">TODO / 待办事项</label>
            <div className="mb-2 flex items-center gap-2">
              <TextInput
                value={todoInput}
                onChange={(event) => setTodoInput(event.target.value)}
                placeholder="添加待办"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTodo();
                  }
                }}
              />
              <Button variant="primary" className="h-10 whitespace-nowrap" onClick={addTodo}>
                添加
              </Button>
            </div>

            <ul className="space-y-2">
              {todo.map((item) => (
                <li
                  key={item.id}
                  className={clsx(
                    'flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2',
                    draggingTodoId === item.id && 'opacity-70',
                  )}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    setDraggingTodoId(item.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggingTodoId) return;
                    moveTodo(draggingTodoId, item.id);
                    setDraggingTodoId(null);
                  }}
                  onDragEnd={() => setDraggingTodoId(null)}
                >
                  <button
                    type="button"
                    className="cursor-grab rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="拖拽排序"
                  >
                    <GripVertical size={14} />
                  </button>

                  <Checkbox
                    checked={item.completed}
                    onChange={() =>
                      setTodo((current) =>
                        current.map((todoItem) =>
                          todoItem.id === item.id
                            ? {
                                ...todoItem,
                                completed: !todoItem.completed,
                                updatedAt: new Date().toISOString(),
                              }
                            : todoItem,
                        ),
                      )
                    }
                  />

                  {editingTodoId === item.id ? (
                    <TextInput
                      value={editingTodoText}
                      onChange={(event) => setEditingTodoText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          saveEditingTodo();
                        }
                        if (event.key === 'Escape') {
                          setEditingTodoId(null);
                          setEditingTodoText('');
                        }
                      }}
                      className="h-8"
                    />
                  ) : (
                    <span className={`text-sm ${item.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {item.text}
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-1">
                    {editingTodoId === item.id ? (
                      <>
                        <button
                          type="button"
                          className="rounded-md p-1 text-emerald-600 hover:bg-emerald-50"
                          title="保存修改"
                          onClick={saveEditingTodo}
                        >
                          <Save size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                          title="取消修改"
                          onClick={() => {
                            setEditingTodoId(null);
                            setEditingTodoText('');
                          }}
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="rounded-md p-1 text-blue-600 hover:bg-blue-50"
                          title="修改待办"
                          onClick={() => beginEditTodo(item)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-1 text-red-600 hover:bg-red-50"
                          title="删除待办"
                          onClick={() => setTodoDeleteTarget(item)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
              {todo.length === 0 ? (
                <li className="rounded-lg border border-dashed border-slate-300 px-3 py-5 text-center text-xs text-slate-500">
                  暂无待办事项
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(todoDeleteTarget)}
        title="删除待办"
        message={`确认删除待办“${todoDeleteTarget?.text ?? ''}”？该操作不可撤销。`}
        danger
        onCancel={() => setTodoDeleteTarget(null)}
        onConfirm={() => {
          if (!todoDeleteTarget) return;
          setTodo((current) => current.filter((todoItem) => todoItem.id !== todoDeleteTarget.id));
          setTodoDeleteTarget(null);
        }}
      />
    </section>
  );
}

export type { EditorSubmitPayload };
