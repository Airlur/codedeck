import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import type { DashboardFilter } from "@/app/state";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TaxonomyDialog } from "@/components/ui/TaxonomyDialog";
import { Toast, type ToastType } from "@/components/ui/Toast";
import { Dashboard } from "@/features/dashboard/Dashboard";
import {
  type EditorSubmitPayload,
  EditorView,
} from "@/features/editor/EditorView";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { getAppSettings, setAppSettings } from "@/lib/db/dexie";
import { migrateLegacyIfNeeded } from "@/lib/db/migrateLegacy";
import { toolRepository } from "@/lib/db/toolRepository";
import { loadPublishedSnapshot } from "@/lib/published/publishedSnapshot";
import { loadRepoManifest } from "@/lib/repo/repoToolsLoader";
import { syncRepoToolsToDB } from "@/lib/repo/syncLegacyTools";
import { mergeSnapshots } from "@/lib/sync/mergeEngine";
import {
  WebDavSyncProvider,
  type WebDavHistoryItem,
} from "@/lib/sync/webdavClient";
import { openRunnerWindow } from "@/lib/utils/runner";
import {
  APP_SCHEMA_VERSION,
  type AppSettings,
  type CategoryRecord,
  type TagRecord,
  type ToolRecord,
  type ToolViewModel,
} from "@/types/schema";

const defaultFilter: DashboardFilter = {
  scope: "all",
  categoryId: null,
  tagId: null,
};

const colorPalette = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#7c3aed",
  "#e11d48",
  "#0ea5e9",
  "#f59e0b",
  "#14b8a6",
  "#f97316",
  "#84cc16",
  "#a855f7",
  "#06b6d4",
];

type ConfirmAction =
  | { kind: "deleteTool"; id: string; label: string }
  | { kind: "resetOverride"; id: string; label: string }
  | { kind: "deleteCategory"; id: string; label: string }
  | { kind: "deleteTag"; id: string; label: string }
  | { kind: "restoreHistory"; fileName: string; label: string }
  | { kind: "deleteHistory"; fileName: string; label: string }
  | null;

type TaxonomyDialogState = {
  kind: "category" | "tag";
  mode: "create" | "edit";
  id?: string;
  name: string;
  color: string;
} | null;

function getRandomColor(): string {
  return colorPalette[Math.floor(Math.random() * colorPalette.length)];
}

function dateStampLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toSyncErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("WEBDAV_INVALID_BASE_URL")) {
    return "WebDAV 地址格式无效，请检查地址是否完整（例如 https://dav.example.com/path/）。";
  }

  if (message.includes("WEBDAV_FETCH_FAILED_CORS_OR_REDIRECT")) {
    return "浏览器拦截了跨域请求。当前 WebDAV 服务可能存在 CORS/预检重定向限制；请改用最终直达 URL（建议以 / 结尾），或通过同域代理访问。";
  }

  if (
    message.includes("WEBDAV_PROXY_HTTP_") ||
    message.includes("WEBDAV_PROXY_INVALID_RESPONSE")
  ) {
    return "WebDAV 代理服务异常，请检查部署是否包含 /api/webdav 接口。";
  }

  if (
    message.includes("WEBDAV_PROXY_UPSTREAM_FETCH_FAILED") ||
    message.includes("fetch failed")
  ) {
    return "WebDAV 代理无法连接上游服务器。请检查 WebDAV 地址、网络可达性、DNS 与 TLS 证书。";
  }

  if (message.includes("WEBDAV_PROXY_UNAVAILABLE")) {
    return "当前环境没有可用的 WebDAV 代理接口（/api/webdav）。请确认本地开发服务或部署平台已启用该接口。";
  }

  if (message.includes("WEBDAV_PUT_412_NO_ETAG")) {
    return "远端拒绝创建/写入文件（412）。通常是目录权限不足、路径不正确，或 WebDAV 服务要求额外前置条件。";
  }

  if (message.includes("WEBDAV_BASE_NOT_FOUND_404")) {
    return "WebDAV 地址不存在（404）。请检查服务器地址是否正确。";
  }

  if (message.includes("WEBDAV_DIR_CHECK_FAILED_")) {
    return "WebDAV 目录检查失败，请确认目录地址和访问权限。";
  }

  if (message.includes("WEBDAV_DIR_CREATE_FAILED_")) {
    return "无法自动创建 CodeDeck 目录，请检查 WebDAV 目录写入权限。";
  }

  if (message.includes("401")) {
    return "WebDAV 认证失败（401），请检查用户名和密码。";
  }

  if (message.includes("403")) {
    return "WebDAV 权限不足（403），请检查账号访问权限。";
  }

  if (message.includes("404")) {
    return "WebDAV 目标路径不存在（404），请检查地址是否正确。";
  }

  return message;
}

function toPublishErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("ADMIN_PASSWORD_NOT_CONFIGURED")) {
    return "发布服务未配置管理员密码（ADMIN_PASSWORD）。";
  }
  if (message.includes("ADMIN_PASSWORD_REQUIRED")) {
    return "请输入管理员密码后再验证。";
  }
  if (message.includes("ADMIN_PASSWORD_INVALID")) {
    return "管理员密码错误。";
  }
  if (message.includes("ADMIN_VERIFY_RATE_LIMITED")) {
    return "密码错误次数过多，请稍后再试。";
  }
  if (message.includes("PUBLISH_AUTH_REQUIRED")) {
    return "发布凭证无效或已过期，请先重新验证管理员密码。";
  }
  if (message.includes("PUBLISH_MESSAGE_REQUIRED")) {
    return "请填写本次发布的 commit 信息。";
  }
  if (message.includes("PUBLISH_MESSAGE_TOO_LONG")) {
    return "commit 信息过长，请控制在 120 个字符以内。";
  }
  if (message.includes("PUBLISH_SNAPSHOT_INVALID")) {
    return "发布快照格式无效，请刷新后重试。";
  }
  if (message.includes("GITHUB_ENV_MISSING")) {
    return "发布服务未配置。请在部署平台配置 GITHUB_TOKEN 与 GITHUB_REPO。";
  }
  if (message.includes("GITHUB_REPO_INVALID")) {
    return "GITHUB_REPO 格式无效，应为 owner/repo。";
  }
  if (
    message.includes("GitHub read failed: 401") ||
    message.includes("GitHub write failed: 401")
  ) {
    return "发布失败：GitHub 凭据无效（401）。";
  }
  if (
    message.includes("GitHub read failed: 403") ||
    message.includes("GitHub write failed: 403")
  ) {
    return "发布失败：GitHub 仓库权限不足（403）。";
  }
  if (
    message.includes("GitHub read failed: 404") ||
    message.includes("GitHub write failed: 404")
  ) {
    return "发布失败：目标仓库或路径不存在（404）。";
  }
  if (message.includes("PUBLISH_HTTP_")) {
    return "发布服务返回异常状态，请检查服务器日志。";
  }
  return message;
}

function sortToolViews(items: ToolViewModel[]): ToolViewModel[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

function toPublishedViewTool(tool: ToolRecord): ToolViewModel {
  return {
    ...tool,
    baseRepoToolId: tool.origin === "repo" && !tool.isOverride ? tool.id : null,
  };
}

export default function App() {
  const location = useLocation();
  const query = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const isPublicView = useMemo(() => {
    return query.get("mode") === "public" || location.pathname === "/public";
  }, [location.pathname, query]);
  const sharedToolId = useMemo(() => query.get("tool")?.trim() || "", [query]);

  const [loading, setLoading] = useState(true);
  const [tools, setTools] = useState<ToolViewModel[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DashboardFilter>(defaultFilter);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingToolId, setEditingToolId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncLabel, setSyncLabel] = useState("同步");
  const [publishing, setPublishing] = useState(false);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [taxonomyDialog, setTaxonomyDialog] =
    useState<TaxonomyDialogState>(null);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<ToastType>("info");
  const [historyItems, setHistoryItems] = useState<WebDavHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const toastTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const syncInFlightRef = useRef(false);
  const settingsOpenRef = useRef(false);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", duration = 2600) => {
      setToastMessage(message);
      setToastType(type);
      setToastOpen(true);

      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }

      toastTimerRef.current = window.setTimeout(() => {
        setToastOpen(false);
        toastTimerRef.current = null;
      }, duration);
    },
    [],
  );

  const refreshData = useCallback(async () => {
    const [merged, categoryRows, tagRows] = await Promise.all([
      toolRepository.listMergedTools(),
      toolRepository.listCategories(),
      toolRepository.listTags(),
    ]);
    setTools(merged);
    setCategories(categoryRows);
    setTags(tagRows);
  }, []);

  useEffect(() => {
    if (!isPublicView || !sharedToolId) return;
    const target = `/runner.html?tool=${encodeURIComponent(sharedToolId)}`;
    window.location.replace(target);
  }, [isPublicView, sharedToolId]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const localSettings = await getAppSettings();
        setSettings(localSettings);

        if (isPublicView) {
          const published = await loadPublishedSnapshot();
          const nextTools = sortToolViews(
            published.tools
              .filter(
                (item) => item.deletedAt === null && item.isPublic !== false,
              )
              .map((item) => toPublishedViewTool(item)),
          );
          const usedCategoryIds = new Set(
            nextTools
              .map((item) => item.categoryId)
              .filter(Boolean) as string[],
          );
          const usedTagIds = new Set(nextTools.flatMap((item) => item.tagIds));
          setTools(nextTools);
          setCategories(
            published.categories.filter(
              (item) => item.deletedAt === null && usedCategoryIds.has(item.id),
            ),
          );
          setTags(
            published.tags.filter(
              (item) => item.deletedAt === null && usedTagIds.has(item.id),
            ),
          );
          return;
        }

        await syncRepoToolsToDB();

        const manifest = await loadRepoManifest();
        const hashMap = new Map(
          manifest.items.map((item) => [
            item.sha256,
            {
              repoBaseId: `repo:${item.repoId}`,
              fileName: item.fileName,
              name: item.name,
            },
          ]),
        );

        await migrateLegacyIfNeeded(hashMap);
        await refreshData();
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : String(error);
        if (isPublicView && message.includes("PUBLISHED_SNAPSHOT_NOT_FOUND")) {
          showToast(
            "公开快照不存在，请先在管理模式执行一次发布。",
            "warn",
            4200,
          );
        } else if (
          isPublicView &&
          message.includes("PUBLISHED_SNAPSHOT_INVALID_FORMAT")
        ) {
          showToast("公开快照格式无效，请重新发布。", "error", 4200);
        } else {
          showToast("初始化失败，请检查控制台日志。", "error");
        }
      } finally {
        setLoading(false);
      }
    };

    void initialize();
  }, [isPublicView, refreshData, showToast]);

  useEffect(() => {
    if (!settings) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const root = document.documentElement;
    const body = document.body;

    const applyTheme = () => {
      const isDark =
        settings.theme === "dark" ||
        (settings.theme === "system" && media.matches);

      root.classList.toggle("dark", isDark);
      body.classList.toggle("dark", isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
      body.style.colorScheme = isDark ? "dark" : "light";
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [settings]);

  useEffect(() => {
    if (!settingsOpen) return;
    searchInputRef.current?.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [settingsOpen]);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  const handleSearchChange = useCallback((value: string) => {
    // Keep topbar search immutable while settings dialog is open.
    if (settingsOpenRef.current) return;
    setSearch(value);
  }, []);

  const handleOpenSettings = () => {
    settingsOpenRef.current = true;
    searchInputRef.current?.blur();
    setSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    settingsOpenRef.current = false;
    setSettingsOpen(false);
  };

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const filteredTools = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tools.filter((tool) => {
      if (filter.scope === "pinned" && !tool.pinned) return false;
      if (filter.scope === "category" && filter.categoryId !== tool.categoryId)
        return false;
      if (
        filter.scope === "tag" &&
        (!filter.tagId || !tool.tagIds.includes(filter.tagId))
      )
        return false;

      if (!term) return true;
      return (
        tool.name.toLowerCase().includes(term) ||
        tool.description.toLowerCase().includes(term) ||
        tool.fileName.toLowerCase().includes(term)
      );
    });
  }, [filter, search, tools]);

  const publicToolCount = useMemo(
    () =>
      tools.filter((item) => item.isPublic !== false && item.deletedAt === null)
        .length,
    [tools],
  );

  const editingTool = useMemo(
    () => tools.find((item) => item.id === editingToolId) ?? null,
    [editingToolId, tools],
  );

  const handleSaveEditor = async (payload: EditorSubmitPayload) => {
    if (payload.base) {
      await toolRepository.saveMergedTool({
        ...payload.base,
        name: payload.name,
        description: payload.description,
        categoryId: payload.categoryId,
        tagIds: payload.tagIds,
        isPublic: payload.isPublic,
        fileName: payload.fileName,
        runtime: payload.runtime,
        language: payload.language,
        code: payload.code,
        todo: payload.todo,
      });
    } else {
      await toolRepository.createTool({
        repoId: null,
        origin: "local",
        isOverride: false,
        name: payload.name,
        description: payload.description,
        categoryId: payload.categoryId,
        tagIds: payload.tagIds,
        isPublic: payload.isPublic,
        fileName: payload.fileName,
        runtime: payload.runtime,
        language: payload.language,
        code: payload.code,
        todo: payload.todo,
        pinned: false,
        sortOrder: tools.length,
      });
    }

    await refreshData();
    setEditorOpen(false);
    setEditingToolId(null);
    showToast("已保存。", "success");
  };

  const handleTogglePinned = async (toolId: string) => {
    const target = tools.find((item) => item.id === toolId);
    if (!target) return;

    // Pin/unpin should not turn repo baseline into override.
    if (
      target.baseRepoToolId &&
      target.origin === "repo" &&
      !target.isOverride
    ) {
      const base = await toolRepository.getToolById(target.baseRepoToolId);
      if (!base) return;
      await toolRepository.saveTool({
        ...base,
        pinned: !base.pinned,
        updatedAt: new Date().toISOString(),
      });
      await refreshData();
      return;
    }

    await toolRepository.saveMergedTool({
      ...target,
      pinned: !target.pinned,
    });
    await refreshData();
  };

  const handleReorder = async (nextOrderedToolIds: string[]) => {
    await toolRepository.updateSortOrders(nextOrderedToolIds);
    await refreshData();
  };

  const handleExport = async () => {
    const backup = await toolRepository.exportBackupV2();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `codedeck_backup_v2_${dateStampLocal()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("已导出备份。", "success");
  };

  const handleShare = async (toolId: string) => {
    const tool = tools.find((item) => item.id === toolId);
    if (!tool) return;

    if (tool.isPublic === false) {
      showToast("私密工具不能生成公开分享链接。", "warn", 3200);
      return;
    }

    const url = new URL(window.location.origin);
    url.pathname = "/runner.html";
    url.searchParams.set("tool", toolId);
    url.searchParams.set("file", tool.fileName);

    try {
      await navigator.clipboard.writeText(url.toString());
      showToast("分享链接已复制。", "success");
    } catch {
      showToast(`复制失败，请手动复制：${url.toString()}`, "warn", 4200);
    }
  };

  const handleVerifyPublishPassword = async (
    password: string,
  ): Promise<{ token: string; expiresAt: string }> => {
    if (isPublicView) {
      throw new Error("公开模式不支持发布。");
    }

    const response = await fetch("/api/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "verify", password }),
    });

    const bodyText = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = bodyText
        ? (JSON.parse(bodyText) as Record<string, unknown>)
        : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      const message = parsed.error
        ? String(parsed.error)
        : `PUBLISH_HTTP_${response.status}`;
      throw new Error(toPublishErrorMessage(message));
    }

    const token = typeof parsed.token === "string" ? parsed.token : "";
    const expiresAt =
      typeof parsed.expiresAt === "string" ? parsed.expiresAt : "";
    if (!token || !expiresAt) {
      throw new Error("发布验证返回值无效，请稍后重试。");
    }
    return { token, expiresAt };
  };

  const handlePublishSnapshot = async (payload: {
    token: string;
    message: string;
  }) => {
    if (isPublicView) {
      throw new Error("公开模式不支持发布。");
    }
    if (publishing) {
      throw new Error("发布进行中，请稍候。");
    }

    setPublishing(true);
    try {
      const [mergedTools, categoryRows, tagRows] = await Promise.all([
        toolRepository.listMergedTools(),
        toolRepository.listCategories(),
        toolRepository.listTags(),
      ]);

      const publicTools = mergedTools
        .filter((item) => item.isPublic !== false)
        .map((item) => {
          const { baseRepoToolId, ...tool } = item;
          void baseRepoToolId;
          return tool;
        });

      const usedCategoryIds = new Set(
        publicTools.map((item) => item.categoryId).filter(Boolean) as string[],
      );
      const usedTagIds = new Set(publicTools.flatMap((item) => item.tagIds));

      const snapshot = {
        schemaVersion: APP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        tools: publicTools,
        categories: categoryRows.filter((item) => usedCategoryIds.has(item.id)),
        tags: tagRows.filter((item) => usedTagIds.has(item.id)),
      };

      const response = await fetch("/api/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "publish",
          token: payload.token,
          message: payload.message,
          snapshot,
        }),
      });

      const bodyText = await response.text();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = bodyText
          ? (JSON.parse(bodyText) as Record<string, unknown>)
          : {};
      } catch {
        parsed = {};
      }

      if (!response.ok) {
        const message = parsed.error
          ? String(parsed.error)
          : `PUBLISH_HTTP_${response.status}`;
        throw new Error(toPublishErrorMessage(message));
      }

      const commit = typeof parsed.commit === "string" ? parsed.commit : null;
      const htmlUrl =
        typeof parsed.htmlUrl === "string" ? parsed.htmlUrl : null;
      const shortCommit = commit ? commit.slice(0, 8) : "";
      const publicUrl = new URL("/public", window.location.origin).toString();
      let copied = false;
      try {
        await navigator.clipboard.writeText(publicUrl);
        copied = true;
      } catch {
        copied = false;
      }
      showToast(
        copied
          ? shortCommit
            ? `发布成功（${shortCommit}）。公开页链接已复制。`
            : "发布成功。公开页链接已复制。"
          : shortCommit
            ? `发布成功（${shortCommit}）。公开页：${publicUrl}`
            : `发布成功。公开页：${publicUrl}`,
        "success",
        copied ? 2800 : 4200,
      );
      return { commit, htmlUrl };
      showToast(
        shortCommit
          ? `发布成功（${shortCommit}）。公开快照请访问 /public 查看。`
          : "发布成功。公开快照请访问 /public 查看。",
        "success",
        3600,
      );
      return { commit, htmlUrl };
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      showToast(`发布失败：${text}`, "error", 5200);
      throw error instanceof Error ? error : new Error(text);
    } finally {
      setPublishing(false);
    }
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (file: File) => {
    const raw = JSON.parse(await file.text()) as unknown;
    await toolRepository.importBackup(raw);
    await refreshData();
  };

  const handleToggleTheme = async () => {
    if (!settings) return;
    const nextTheme: AppSettings["theme"] =
      settings.theme === "dark" ? "light" : "dark";
    const nextSettings: AppSettings = {
      ...settings,
      theme: nextTheme,
    };
    setSettings(nextSettings);
    await setAppSettings(nextSettings);
    showToast(
      nextTheme === "dark" ? "已切换到深色主题。" : "已切换到浅色主题。",
      "success",
    );
  };

  const createWebDavProvider = useCallback(
    (config: AppSettings["webdav"]) =>
      new WebDavSyncProvider(config.baseUrl, config.username, config.password),
    [],
  );

  const testWebDavConnection = useCallback(
    async (draft: AppSettings): Promise<{ ok: boolean; message: string }> => {
      try {
        if (!draft.webdav.baseUrl.trim()) {
          return { ok: false, message: "请先填写 WebDAV 地址。" };
        }
        if (!draft.webdav.username.trim() || !draft.webdav.password.trim()) {
          return { ok: false, message: "请先填写用户名和密码。" };
        }

        const provider = createWebDavProvider(draft.webdav);
        await provider.probeConnection();
        return { ok: true, message: "连接成功，地址与账号密码验证通过。" };
      } catch (error) {
        return { ok: false, message: toSyncErrorMessage(error) };
      }
    },
    [createWebDavProvider],
  );

  const refreshHistory = useCallback(async () => {
    if (isPublicView) {
      setHistoryItems([]);
      return;
    }
    if (
      !settings?.webdav.baseUrl.trim() ||
      !settings.webdav.username.trim() ||
      !settings.webdav.password.trim()
    ) {
      setHistoryItems([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const provider = createWebDavProvider(settings.webdav);
      const items = await provider.listHistory();
      setHistoryItems(items);
    } catch (error) {
      showToast(
        `历史记录加载失败：${toSyncErrorMessage(error)}`,
        "error",
        4200,
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [createWebDavProvider, isPublicView, settings, showToast]);

  useEffect(() => {
    if (isPublicView || !settingsOpen) return;
    void refreshHistory();
  }, [isPublicView, refreshHistory, settingsOpen]);

  const performSync = useCallback(async () => {
    if (isPublicView) {
      showToast("公开模式不支持同步。", "warn");
      return;
    }
    if (!settings) return;
    if (!settings.webdav.enabled || !settings.webdav.baseUrl) {
      showToast("WebDAV 未启用或未配置地址。", "warn");
      return;
    }
    if (syncInFlightRef.current) {
      showToast("同步正在进行中，请稍候。", "info", 2000);
      return;
    }

    syncInFlightRef.current = true;
    setSyncing(true);
    setSyncLabel("同步中");

    try {
      const provider = createWebDavProvider(settings.webdav);

      const localSnapshot = await toolRepository.buildSnapshot();
      let remoteEtag: string | null = settings.webdav.lastEtag;
      let retries = 0;
      let etagFallbackUsed = false;
      let historySavedItem: WebDavHistoryItem | null = null;

      while (retries < 3) {
        const { snapshot: remoteSnapshot, etag } = await provider.pull();
        remoteEtag = etag;

        const merged = mergeSnapshots(localSnapshot, remoteSnapshot);
        const payload = {
          schemaVersion: 2,
          exportedAt: new Date().toISOString(),
          ...merged,
        };
        const hasIfMatch = Boolean(remoteEtag);

        try {
          let pushed: { etag: string | null };
          try {
            pushed = await provider.push(payload, remoteEtag);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            if (!message.includes("ETAG_CONFLICT_412") || !hasIfMatch) {
              throw error;
            }

            // Some WebDAV services return ETag variants that cannot be used in If-Match.
            pushed = await provider.push(payload, null);
            etagFallbackUsed = true;
          }

          try {
            historySavedItem = await provider.saveHistory(payload);
            await provider.pruneHistory(settings.webdav.backupLimit);
          } catch (historyError) {
            console.warn("WebDAV history save failed:", historyError);
            showToast(
              `历史版本保存失败：${toSyncErrorMessage(historyError)}`,
              "warn",
              3800,
            );
          }

          await toolRepository.applySnapshot(payload);
          await refreshData();

          const nextSettings: AppSettings = {
            ...settings,
            webdav: {
              ...settings.webdav,
              lastEtag: pushed.etag,
              lastSyncAt: new Date().toISOString(),
            },
          };
          setSettings(nextSettings);
          await setAppSettings(nextSettings);

          if (historySavedItem) {
            const savedItem = historySavedItem;
            const fallbackLimit = Math.max(
              1,
              Math.min(50, settings.webdav.backupLimit),
            );
            setHistoryItems((current) =>
              [
                savedItem,
                ...current.filter(
                  (item) => item.fileName !== savedItem.fileName,
                ),
              ].slice(0, fallbackLimit),
            );
          }
          if (settingsOpen) {
            await refreshHistory();
          }

          showToast(
            etagFallbackUsed
              ? "同步成功（已兼容远端 ETag 差异）。"
              : "同步成功。",
            "success",
          );
          break;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (message.includes("ETAG_CONFLICT_412") && hasIfMatch) {
            retries += 1;
            continue;
          }
          throw error;
        }
      }

      if (retries >= 3) {
        throw new Error("同步冲突重试超过 3 次。");
      }
    } catch (error) {
      showToast(`同步失败：${toSyncErrorMessage(error)}`, "error", 5200);
    } finally {
      syncInFlightRef.current = false;
      setSyncing(false);
      setSyncLabel("同步");
    }
  }, [
    createWebDavProvider,
    isPublicView,
    refreshData,
    refreshHistory,
    settings,
    settingsOpen,
    showToast,
  ]);

  useEffect(() => {
    if (isPublicView) return;
    if (!settings?.webdav.enabled || !settings.webdav.autoSync) return;

    const timer = window.setInterval(() => {
      void performSync();
    }, settings.webdav.autoSyncIntervalSec * 1000);

    return () => window.clearInterval(timer);
  }, [
    isPublicView,
    performSync,
    settings?.webdav.autoSync,
    settings?.webdav.autoSyncIntervalSec,
    settings?.webdav.enabled,
  ]);

  const openCategoryDialogCreate = () => {
    setTaxonomyDialog({
      kind: "category",
      mode: "create",
      name: "",
      color: getRandomColor(),
    });
  };

  const openTagDialogCreate = () => {
    setTaxonomyDialog({
      kind: "tag",
      mode: "create",
      name: "",
      color: getRandomColor(),
    });
  };

  const openCategoryDialogEdit = async (id: string) => {
    const row = await toolRepository.getCategoryById(id);
    if (!row || row.deletedAt) return;
    setTaxonomyDialog({
      kind: "category",
      mode: "edit",
      id: row.id,
      name: row.name,
      color: row.color,
    });
  };

  const openTagDialogEdit = async (id: string) => {
    const row = await toolRepository.getTagById(id);
    if (!row || row.deletedAt) return;
    setTaxonomyDialog({
      kind: "tag",
      mode: "edit",
      id: row.id,
      name: row.name,
      color: row.color,
    });
  };

  const submitTaxonomyDialog = async () => {
    if (!taxonomyDialog) return;
    const name = taxonomyDialog.name.trim();
    if (!name) {
      showToast("名称不能为空。", "warn");
      return;
    }

    if (taxonomyDialog.kind === "category") {
      await toolRepository.upsertCategory({
        id: taxonomyDialog.mode === "edit" ? taxonomyDialog.id : undefined,
        name,
        color: taxonomyDialog.color,
      });
      await refreshData();
      setTaxonomyDialog(null);
      showToast(
        taxonomyDialog.mode === "edit" ? "分类已更新。" : "分类已创建。",
        "success",
      );
      return;
    }

    await toolRepository.upsertTag({
      id: taxonomyDialog.mode === "edit" ? taxonomyDialog.id : undefined,
      name,
      color: taxonomyDialog.color,
    });
    await refreshData();
    setTaxonomyDialog(null);
    showToast(
      taxonomyDialog.mode === "edit" ? "标签已更新。" : "标签已创建。",
      "success",
    );
  };

  const restoreHistory = async (fileName: string) => {
    if (!settings) return;
    const provider = createWebDavProvider(settings.webdav);
    const snapshot = await provider.pullHistory(fileName);
    await toolRepository.applySnapshot(snapshot);
    await refreshData();
    showToast(`已恢复历史版本：${fileName}`, "success");
  };

  const deleteHistory = async (fileName: string) => {
    if (!settings) return;
    const provider = createWebDavProvider(settings.webdav);
    await provider.deleteHistory(fileName);
    await refreshHistory();
    showToast(`已删除历史版本：${fileName}`, "success");
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;

    if (confirmAction.kind === "deleteTool") {
      await toolRepository.deleteTool(confirmAction.id);
      await refreshData();
      showToast("工具已删除。", "success");
    }

    if (confirmAction.kind === "resetOverride") {
      await toolRepository.resetOverride(confirmAction.id);
      await refreshData();
      showToast("已恢复仓库基线版本。", "success");
    }

    if (confirmAction.kind === "deleteCategory") {
      await toolRepository.deleteCategory(confirmAction.id);
      await refreshData();
      showToast("分类已删除。", "success");
    }

    if (confirmAction.kind === "deleteTag") {
      await toolRepository.deleteTag(confirmAction.id);
      await refreshData();
      showToast("标签已删除。", "success");
    }

    if (confirmAction.kind === "restoreHistory") {
      await restoreHistory(confirmAction.fileName);
    }

    if (confirmAction.kind === "deleteHistory") {
      await deleteHistory(confirmAction.fileName);
    }

    setConfirmAction(null);
  };

  const confirmTitle =
    confirmAction?.kind === "deleteTool"
      ? "删除工具"
      : confirmAction?.kind === "resetOverride"
        ? "恢复仓库基线"
        : confirmAction?.kind === "deleteCategory"
          ? "删除分类"
          : confirmAction?.kind === "deleteTag"
            ? "删除标签"
            : confirmAction?.kind === "restoreHistory"
              ? "恢复历史版本"
              : confirmAction?.kind === "deleteHistory"
                ? "删除历史版本"
                : "";

  const confirmMessage =
    confirmAction?.kind === "deleteTool"
      ? `确认删除工具“${confirmAction.label}”？该操作不可撤销。`
      : confirmAction?.kind === "resetOverride"
        ? `确认恢复“${confirmAction.label}”到仓库基线版本？你对该工具的本地覆盖改动会丢失。`
        : confirmAction?.kind === "deleteCategory"
          ? `确认删除分类“${confirmAction.label}”？相关工具将变为未分类。`
          : confirmAction?.kind === "deleteTag"
            ? `确认删除标签“${confirmAction.label}”？相关工具将移除该标签。`
            : confirmAction?.kind === "restoreHistory"
              ? `确认恢复到历史版本“${confirmAction.label}”？当前本地数据会被覆盖。`
              : confirmAction?.kind === "deleteHistory"
                ? `确认删除历史版本“${confirmAction.label}”？该操作不可撤销。`
                : "";

  if (loading || !settings) {
    return (
      <main className="flex h-screen items-center justify-center bg-slate-100">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600">
          正在初始化 CodeDeck...
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen bg-slate-100 text-slate-900">
      <Sidebar
        tools={tools}
        categories={categories}
        tags={tags}
        filter={filter}
        readOnly={isPublicView}
        onFilterChange={setFilter}
        onCreateCategory={openCategoryDialogCreate}
        onEditCategory={(id) => void openCategoryDialogEdit(id)}
        onDeleteCategory={(id) => {
          const row = categories.find((item) => item.id === id);
          if (!row) return;
          setConfirmAction({
            kind: "deleteCategory",
            id: row.id,
            label: row.name,
          });
        }}
        onCreateTag={openTagDialogCreate}
        onEditTag={(id) => void openTagDialogEdit(id)}
        onDeleteTag={(id) => {
          const row = tags.find((item) => item.id === id);
          if (!row) return;
          setConfirmAction({ kind: "deleteTag", id: row.id, label: row.name });
        }}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <Topbar
          searchRef={searchInputRef}
          search={search}
          searchDisabled={settingsOpen}
          onSearchChange={handleSearchChange}
          onAddTool={() => {
            setEditingToolId(null);
            setEditorOpen(true);
          }}
          onImport={handleImport}
          onExport={() => void handleExport()}
          onSync={() => void performSync()}
          onOpenSettings={handleOpenSettings}
          onToggleTheme={() => void handleToggleTheme()}
          theme={settings.theme}
          syncLabel={syncLabel}
          syncing={syncing}
          readOnly={isPublicView}
        />

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {!isPublicView && editorOpen ? (
            <EditorView
              open={editorOpen}
              tool={editingTool}
              categories={categories}
              tags={tags}
              settings={settings}
              onClose={() => {
                setEditorOpen(false);
                setEditingToolId(null);
              }}
              onCreateTag={async (name) => {
                const existedIdSet = new Set(tags.map((tag) => tag.id));
                const id = await toolRepository.upsertTag({
                  name: name.trim(),
                  color: getRandomColor(),
                });
                await refreshData();
                if (existedIdSet.has(id)) {
                  showToast(`标签“${name.trim()}”已存在，已复用。`, "info");
                  return { id, created: false };
                }
                showToast(`标签“${name.trim()}”已创建。`, "success");
                return { id, created: true };
              }}
              onDeleteTag={async (id) => {
                await toolRepository.deleteTag(id);
                await refreshData();
                showToast("标签已删除。", "success");
              }}
              onSave={(payload) => void handleSaveEditor(payload)}
            />
          ) : (
            <Dashboard
              tools={filteredTools}
              categories={categories}
              tags={tags}
              totalToolCount={tools.length}
              readOnly={isPublicView}
              onEdit={(toolId) => {
                setEditingToolId(toolId);
                setEditorOpen(true);
              }}
              onRun={(toolId) => {
                const tool = tools.find((item) => item.id === toolId);
                if (!tool) return;
                openRunnerWindow({ title: tool.name, code: tool.code });
              }}
              onDelete={(toolId) => {
                const tool = tools.find((item) => item.id === toolId);
                if (!tool) return;
                setConfirmAction({
                  kind: "deleteTool",
                  id: tool.id,
                  label: tool.name,
                });
              }}
              onShare={(toolId) => void handleShare(toolId)}
              onTogglePinned={(toolId) => void handleTogglePinned(toolId)}
              onResetOverride={(repoId) => {
                const tool = tools.find(
                  (item) => item.baseRepoToolId === repoId,
                );
                const label = tool?.name ?? repoId;
                setConfirmAction({ kind: "resetOverride", id: repoId, label });
              }}
              onReorder={(ids) => void handleReorder(ids)}
              onResetFilter={() => {
                setSearch("");
                setFilter(defaultFilter);
              }}
            />
          )}
        </div>
      </section>

      {!isPublicView && settingsOpen ? (
        <SettingsDialog
          settings={settings}
          publishing={publishing}
          totalToolCount={tools.length}
          publicToolCount={publicToolCount}
          onClose={handleCloseSettings}
          onSave={(next) => {
            setSettings(next);
            void setAppSettings(next);
            showToast("设置已保存。", "success");
          }}
          onClearCredential={() => {
            const nextSettings: AppSettings = {
              ...settings,
              webdav: {
                ...settings.webdav,
                username: "",
                password: "",
              },
            };
            setSettings(nextSettings);
            void setAppSettings(nextSettings);
            showToast("WebDAV 凭据已清除。", "success");
          }}
          onTestConnection={testWebDavConnection}
          onVerifyPublishPassword={(password) =>
            handleVerifyPublishPassword(password)
          }
          onPublishSnapshot={(payload) => handlePublishSnapshot(payload)}
          historyItems={historyItems}
          historyLoading={historyLoading}
          onRefreshHistory={() => void refreshHistory()}
          onRestoreHistory={(fileName) =>
            setConfirmAction({
              kind: "restoreHistory",
              fileName,
              label: fileName,
            })
          }
          onDeleteHistory={(fileName) =>
            setConfirmAction({
              kind: "deleteHistory",
              fileName,
              label: fileName,
            })
          }
          onShowToast={showToast}
        />
      ) : null}

      {!isPublicView && taxonomyDialog ? (
        <TaxonomyDialog
          open
          title={`${taxonomyDialog.mode === "create" ? "新建" : "编辑"}${
            taxonomyDialog.kind === "category" ? "分类" : "标签"
          }`}
          name={taxonomyDialog.name}
          color={taxonomyDialog.color}
          confirmText={taxonomyDialog.mode === "create" ? "创建" : "保存"}
          onNameChange={(value) =>
            setTaxonomyDialog((current) =>
              current ? { ...current, name: value } : current,
            )
          }
          onColorChange={(value) =>
            setTaxonomyDialog((current) =>
              current ? { ...current, color: value } : current,
            )
          }
          onCancel={() => setTaxonomyDialog(null)}
          onConfirm={() => void submitTaxonomyDialog()}
        />
      ) : null}

      {!isPublicView ? (
        <ConfirmDialog
          open={Boolean(confirmAction)}
          title={confirmTitle}
          message={confirmMessage}
          danger={Boolean(
            confirmAction &&
            (confirmAction.kind === "deleteTool" ||
              confirmAction.kind === "deleteCategory" ||
              confirmAction.kind === "deleteTag" ||
              confirmAction.kind === "deleteHistory"),
          )}
          confirmText={
            confirmAction?.kind === "resetOverride" ||
            confirmAction?.kind === "restoreHistory"
              ? "恢复"
              : "确认"
          }
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void runConfirmAction()}
        />
      ) : null}

      <Toast open={toastOpen} message={toastMessage} type={toastType} />

      {!isPublicView ? (
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(event) => {
            const [file] = event.target.files ?? [];
            if (!file) return;
            void handleImportFile(file)
              .then(() => {
                showToast("导入成功。", "success");
              })
              .catch((error) => {
                showToast(
                  `导入失败：${error instanceof Error ? error.message : String(error)}`,
                  "error",
                  3600,
                );
              })
              .finally(() => {
                event.target.value = "";
              });
          }}
        />
      ) : null}
    </main>
  );
}
