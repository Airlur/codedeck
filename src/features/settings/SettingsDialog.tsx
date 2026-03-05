import {
  Cloud,
  Eye,
  EyeOff,
  GitBranch,
  Github,
  History,
  Info,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { TextArea } from '@/components/ui/TextArea';
import { TextInput } from '@/components/ui/TextInput';
import type { WebDavHistoryItem } from '@/lib/sync/webdavClient';
import type { AppSettings } from '@/types/schema';

type SettingsTab = 'webdav' | 'repo' | 'about';
type WebDavPanel = 'config' | 'history';

interface PublishVerifyResult {
  token: string;
  expiresAt: string;
}

interface PublishResult {
  commit: string | null;
  htmlUrl: string | null;
}

interface SettingsDialogProps {
  settings: AppSettings;
  publishing: boolean;
  totalToolCount: number;
  publicToolCount: number;
  onClose: () => void;
  onSave: (next: AppSettings) => void;
  onClearCredential: () => void;
  onTestConnection: (draft: AppSettings) => Promise<{ ok: boolean; message: string }>;
  onVerifyPublishPassword: (password: string) => Promise<PublishVerifyResult>;
  onPublishSnapshot: (payload: { token: string; message: string }) => Promise<PublishResult>;
  historyItems: WebDavHistoryItem[];
  historyLoading: boolean;
  onRefreshHistory: () => void;
  onRestoreHistory: (fileName: string) => void;
  onDeleteHistory: (fileName: string) => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'warn' | 'info', duration?: number) => void;
}

function defaultCommitMessage(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `chore(codedeck): publish ${y}-${m}-${d} ${hh}:${mm}`;
}

function toDisplayTime(value: string): string {
  const stamp = Date.parse(value);
  if (Number.isNaN(stamp)) return value;
  return new Date(stamp).toLocaleString();
}

export function SettingsDialog({
  settings,
  publishing,
  totalToolCount,
  publicToolCount,
  onClose,
  onSave,
  onClearCredential,
  onTestConnection,
  onVerifyPublishPassword,
  onPublishSnapshot,
  historyItems,
  historyLoading,
  onRefreshHistory,
  onRestoreHistory,
  onDeleteHistory,
  onShowToast,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('webdav');
  const [webdavPanel, setWebdavPanel] = useState<WebDavPanel>('config');

  const [draft, setDraft] = useState<AppSettings>(settings);
  const [showWebDavPassword, setShowWebDavPassword] = useState(false);
  const [testing, setTesting] = useState(false);

  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [publishToken, setPublishToken] = useState<string | null>(null);
  const [publishTokenExpireAt, setPublishTokenExpireAt] = useState<string | null>(null);
  const [repoMessage, setRepoMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [commitMessage, setCommitMessage] = useState(defaultCommitMessage);

  const canPublish = useMemo(() => {
    if (!publishToken || !publishTokenExpireAt) return false;
    if (Date.parse(publishTokenExpireAt) <= Date.now()) return false;
    if (!commitMessage.trim()) return false;
    return true;
  }, [commitMessage, publishToken, publishTokenExpireAt]);

  const runTest = async () => {
    setTesting(true);
    try {
      const result = await onTestConnection(draft);
      onShowToast(result.message, result.ok ? 'success' : 'error', result.ok ? 2600 : 4200);
    } catch (error) {
      onShowToast(error instanceof Error ? error.message : String(error), 'error', 4200);
    } finally {
      setTesting(false);
    }
  };

  const runVerify = async () => {
    if (!adminPassword.trim()) {
      setRepoMessage({ ok: false, text: '请输入管理员密码。' });
      return;
    }

    setVerifying(true);
    setRepoMessage(null);
    try {
      const result = await onVerifyPublishPassword(adminPassword);
      setPublishToken(result.token);
      setPublishTokenExpireAt(result.expiresAt);
      setRepoMessage({ ok: true, text: `验证成功，有效期到：${toDisplayTime(result.expiresAt)}` });
      if (!commitMessage.trim()) {
        setCommitMessage(defaultCommitMessage());
      }
    } catch (error) {
      setPublishToken(null);
      setPublishTokenExpireAt(null);
      setRepoMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setVerifying(false);
    }
  };

  const runPublish = async () => {
    if (!publishToken) {
      setRepoMessage({ ok: false, text: '请先完成管理员密码验证。' });
      return;
    }
    if (!commitMessage.trim()) {
      setRepoMessage({ ok: false, text: '请填写 commit 信息。' });
      return;
    }

    setRepoMessage(null);
    try {
      const result = await onPublishSnapshot({
        token: publishToken,
        message: commitMessage.trim(),
      });
      const shortCommit = result.commit ? result.commit.slice(0, 8) : '';
      setRepoMessage({ ok: true, text: shortCommit ? `发布成功：${shortCommit}` : '发布成功。' });
      setCommitMessage(defaultCommitMessage());
    } catch (error) {
      setRepoMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    }
  };

  const navButtonClass = (tab: SettingsTab) =>
    `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
      activeTab === tab
        ? 'bg-slate-900 text-white'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  const webdavSwitchClass = (panel: WebDavPanel) =>
    `inline-flex items-center rounded-md px-3 py-1 text-xs font-medium transition ${
      webdavPanel === panel
        ? 'bg-white text-slate-900 shadow-sm'
        : 'text-slate-500 hover:text-slate-700'
    }`;

  return (
    <Modal open title="设置" onClose={onClose} className="max-w-5xl">
      <div className="grid h-[560px] grid-cols-[180px_1fr] gap-0 overflow-hidden">
        <aside className="border-r border-slate-200 bg-slate-50 p-3">
          <nav className="space-y-1">
            <button type="button" className={navButtonClass('webdav')} onClick={() => setActiveTab('webdav')}>
              <Cloud size={15} /> WebDAV
            </button>
            <button type="button" className={navButtonClass('repo')} onClick={() => setActiveTab('repo')}>
              <GitBranch size={15} /> 仓库管理
            </button>
            <button type="button" className={navButtonClass('about')} onClick={() => setActiveTab('about')}>
              <Info size={15} /> 关于
            </button>
          </nav>
        </aside>

        <section className="min-h-0 overflow-hidden p-5">
          {activeTab === 'webdav' ? (
            <div className="flex h-full flex-col">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-3xl font-semibold text-slate-900">WebDAV 同步</h4>
                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
                  <button type="button" className={webdavSwitchClass('config')} onClick={() => setWebdavPanel('config')}>
                    配置
                  </button>
                  <button type="button" className={webdavSwitchClass('history')} onClick={() => setWebdavPanel('history')}>
                    历史版本
                  </button>
                </div>
              </div>

              {webdavPanel === 'config' ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
                  <section className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h5 className="text-sm font-semibold text-slate-800">服务器配置</h5>
                      <Button
                        variant="secondary"
                        className="h-8 border-slate-300 px-2 text-xs"
                        onClick={() => void runTest()}
                        disabled={testing}
                      >
                        {testing ? '测试中...' : '测试连接'}
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <label className="block text-sm text-slate-700">
                        服务器地址
                        <TextInput
                          className="mt-1"
                          value={draft.webdav.baseUrl}
                          name="webdav-url"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          data-lpignore="true"
                          data-1p-ignore="true"
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              webdav: { ...current.webdav, baseUrl: event.target.value },
                            }))
                          }
                          placeholder="例如：https://dav.example.com/path/"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-sm text-slate-700">
                          用户名
                          <TextInput
                            className="mt-1"
                            value={draft.webdav.username}
                            name="webdav-username"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            data-lpignore="true"
                            data-1p-ignore="true"
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                webdav: { ...current.webdav, username: event.target.value },
                              }))
                            }
                            placeholder="输入 WebDAV 用户名"
                          />
                        </label>

                        <label className="text-sm text-slate-700">
                          密码
                          <div className="relative mt-1">
                            <TextInput
                              type={showWebDavPassword ? 'text' : 'password'}
                              className="pr-10"
                              value={draft.webdav.password}
                              name="webdav-password"
                              autoComplete="new-password"
                              autoCorrect="off"
                              autoCapitalize="none"
                              spellCheck={false}
                              data-lpignore="true"
                              data-1p-ignore="true"
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  webdav: { ...current.webdav, password: event.target.value },
                                }))
                              }
                              placeholder="输入 WebDAV 密码"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              onClick={() => setShowWebDavPassword((current) => !current)}
                              title={showWebDavPassword ? '隐藏密码' : '显示密码'}
                            >
                              {showWebDavPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </label>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 p-4">
                    <h5 className="mb-3 text-sm font-semibold text-slate-800">同步策略</h5>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <Checkbox
                          checked={draft.webdav.enabled}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              webdav: { ...current.webdav, enabled: event.target.checked },
                            }))
                          }
                        />
                        启用 WebDAV
                      </label>

                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <Checkbox
                          checked={draft.webdav.autoSync}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              webdav: { ...current.webdav, autoSync: event.target.checked },
                            }))
                          }
                        />
                        自动同步
                      </label>

                      <label className="text-sm text-slate-700">
                        自动同步间隔（秒）
                        <TextInput
                          type="number"
                          min={10}
                          className="mt-1"
                          value={draft.webdav.autoSyncIntervalSec}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              webdav: {
                                ...current.webdav,
                                autoSyncIntervalSec: Number(event.target.value || 120),
                              },
                            }))
                          }
                        />
                      </label>
                    </div>

                  </section>

                  <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 pt-3">
                    <Button variant="danger" onClick={onClearCredential}>
                      清除 WebDAV 凭据
                    </Button>
                    <Button
                      variant="custom"
                      className="border border-blue-200 bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => onSave(draft)}
                    >
                      <Save size={15} /> 保存 WebDAV 设置
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-4">
                  <section className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Wrench size={15} /> 自动备份数量限制
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-xs text-slate-500">每次推送时生成新备份，超出限制自动清理旧文件（最少 5，最多 50）。</p>
                      <div className="w-24">
                        <TextInput
                          type="number"
                          min={5}
                          max={50}
                          className="no-number-spinner text-center"
                          value={draft.webdav.backupLimit}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              webdav: {
                                ...current.webdav,
                                backupLimit: Math.min(50, Math.max(5, Number(event.target.value || 10))),
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </section>

                  <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <h5 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <History size={15} /> 备份列表
                      </h5>
                      <Button
                        variant="secondary"
                        className="h-8 border-slate-300 px-2 text-xs"
                        disabled={historyLoading}
                        onClick={onRefreshHistory}
                      >
                        <RefreshCw size={13} className={historyLoading ? 'animate-spin' : ''} /> 刷新列表
                      </Button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto">
                      {historyItems.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">暂无历史版本。</div>
                      ) : (
                        <ul className="divide-y divide-slate-100">
                          {historyItems.map((item) => (
                            <li key={item.fileName} className="flex items-center gap-2 px-4 py-3 text-sm">
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-slate-700">{item.timeLabel}</div>
                                <div className="truncate text-xs text-slate-500">{item.fileName}</div>
                              </div>
                              <button
                                type="button"
                                className="group relative rounded-md p-1.5 text-blue-600 hover:bg-blue-50"
                                onClick={() => onRestoreHistory(item.fileName)}
                              >
                                <RotateCcw size={14} />
                                <span className="pointer-events-none absolute right-full top-1/2 mr-2 hidden w-max -translate-y-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] leading-none text-white [writing-mode:horizontal-tb] group-hover:block">
                                  从此版本恢复
                                </span>
                              </button>
                              <button
                                type="button"
                                className="group relative rounded-md p-1.5 text-red-600 hover:bg-red-50"
                                onClick={() => onDeleteHistory(item.fileName)}
                              >
                                <Trash2 size={14} />
                                <span className="pointer-events-none absolute right-full top-1/2 mr-2 hidden w-max -translate-y-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] leading-none text-white [writing-mode:horizontal-tb] group-hover:block">
                                  删除备份
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'repo' ? (
            <div className="space-y-5">
              <section>
                <h4 className="mb-2 text-base font-semibold text-slate-900">仓库管理</h4>
                <p className="text-sm text-slate-600">
                  发布会把当前本地数据中的“公开工具”生成 `public/published.json`，提交到 GitHub 仓库，部署平台将自动重新部署。
                </p>
                <p className="mt-1 text-xs text-slate-500">工具公开/私密可在编辑页「详情 / 发布可见性」里切换。</p>
              </section>

              <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <ShieldCheck size={15} /> 第一步：验证管理员密码
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    tabIndex={-1}
                    aria-hidden="true"
                    autoComplete="username"
                    className="sr-only pointer-events-none h-0 w-0 opacity-0"
                    value=""
                    readOnly
                  />
                  <div className="relative min-w-0 flex-1">
                    <TextInput
                      type={showAdminPassword ? 'text' : 'password'}
                      className="pr-10"
                      value={adminPassword}
                      name="admin-password"
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      data-lpignore="true"
                      data-1p-ignore="true"
                      onChange={(event) => setAdminPassword(event.target.value)}
                      placeholder="输入管理员密码"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      onClick={() => setShowAdminPassword((current) => !current)}
                      title={showAdminPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <Button
                    variant="secondary"
                    className="border-slate-300"
                    onClick={() => void runVerify()}
                    disabled={verifying}
                  >
                    {verifying ? '验证中...' : '验证'}
                  </Button>
                </div>
                {publishTokenExpireAt ? (
                  <div className="text-xs text-slate-500">当前令牌有效期：{toDisplayTime(publishTokenExpireAt)}</div>
                ) : null}
              </section>

              <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">
                  <span>第二步：填写 commit 并发布</span>
                  <span className="text-xs text-slate-500">
                    公开工具 {publicToolCount} / 总工具 {totalToolCount}
                  </span>
                </div>
                <TextArea
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  placeholder="必填：本次发布说明"
                  className="min-h-24"
                />
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  发布仅包含“公开工具”。私密工具仍会保留在你的本地/WebDAV，不会进入公开快照。
                </div>
                <Button variant="primary" disabled={!canPublish || publishing} onClick={() => void runPublish()}>
                  {publishing ? '发布中...' : '发布到仓库'}
                </Button>
              </section>

              {repoMessage ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    repoMessage.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {repoMessage.text}
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'about' ? (
            <div className="space-y-4 text-sm text-slate-700">
              <h4 className="text-base font-semibold text-slate-900">关于 CodeDeck</h4>
              <p>CodeDeck 是一个可部署的个人工具工作台，支持本地编辑、WebDAV 同步和仓库发布。</p>
              <a
                href="https://github.com/Airlur/codedeck"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 hover:bg-slate-100"
              >
                <Github size={20} className="text-black" />
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">项目仓库</div>
                  <div className="truncate font-medium">https://github.com/Airlur/codedeck</div>
                </div>
              </a>
            </div>
          ) : null}
        </section>
      </div>
    </Modal>
  );
}
