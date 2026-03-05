import { Download, Moon, Plus, RefreshCw, Settings, Sun, Upload } from 'lucide-react';
import type { RefObject } from 'react';

import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import type { AppSettings } from '@/types/schema';

interface TopbarProps {
  search: string;
  searchRef?: RefObject<HTMLInputElement | null>;
  searchDisabled?: boolean;
  onSearchChange: (value: string) => void;
  onAddTool: () => void;
  onImport: () => void;
  onExport: () => void;
  onSync: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
  theme: AppSettings['theme'];
  syncLabel: string;
  syncing: boolean;
  readOnly?: boolean;
}

export function Topbar({
  search,
  searchRef,
  searchDisabled = false,
  onSearchChange,
  onAddTool,
  onImport,
  onExport,
  onSync,
  onOpenSettings,
  onToggleTheme,
  theme,
  syncLabel,
  syncing,
  readOnly = false,
}: TopbarProps) {
  return (
    <div className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
      <div className="max-w-xl flex-1">
        <TextInput
          ref={searchRef}
          value={search}
          disabled={searchDisabled}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索工具 (Ctrl + E)"
          name="tool-search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
        />
      </div>
      <div className="flex items-center gap-2">
        {readOnly ? (
          <span className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
            公开只读模式
          </span>
        ) : null}

        {!readOnly ? (
          <Button
            variant="custom"
            className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            onClick={onImport}
          >
            <Upload size={16} /> 导入
          </Button>
        ) : null}

        {!readOnly ? (
          <Button
            variant="custom"
            className="border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
            onClick={onExport}
          >
            <Download size={16} /> 导出
          </Button>
        ) : null}

        {!readOnly ? (
          <Button
            variant="custom"
            className="border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
            disabled={syncing}
            onClick={onSync}
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} /> {syncLabel}
          </Button>
        ) : null}

        <Button
          variant="custom"
          className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
          onClick={onToggleTheme}
          title="切换主题"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? '浅色' : '深色'}
        </Button>

        {!readOnly ? (
          <Button
            variant="custom"
            className="border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100"
            onClick={onOpenSettings}
          >
            <Settings size={16} /> 设置
          </Button>
        ) : null}

        {!readOnly ? (
          <Button variant="primary" onClick={onAddTool}>
            <Plus size={16} /> 新建工具
          </Button>
        ) : null}
      </div>
    </div>
  );
}
