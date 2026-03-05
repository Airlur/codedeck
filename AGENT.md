# CodeDeck 项目记忆（AGENT）

## 项目定位
- 项目名：CodeDeck
- 形态：React + TypeScript + Vite 单页应用
- 目标：
  - 私有工作台：本地编辑 + WebDAV 跨设备同步
  - 公开导航站：发布 `published.json` 供只读访问

## 技术栈
- 前端：React 19、TypeScript 5、Vite 7、Tailwind CSS
- 数据层：Dexie（IndexedDB）
- 编辑器：Monaco（`@monaco-editor/react`）
- 校验：Zod
- 拖拽：dnd-kit
- 接口：
  - `api/webdav.js`：WebDAV 代理
  - `api/publish.js`：发布接口（验密 + 推送 GitHub）
  - `api/publishCore.js`：发布核心逻辑（dev/prod 共用）
  - `vite.config.ts`：本地 dev 中间件（`/api/webdav`、`/api/publish`）

## 当前数据策略（重要）
- WebDAV 快照是私有编辑数据真源。
- 公开站真源是 `published.json`。
- 仓库基线（`public/repo-tools/*`）仅作为初始化种子，不再在同步/恢复/导入后自动回灌覆盖。

## 关键目录
- `src/app/App.tsx`：主流程编排、模式切换（owner/public）、同步、发布调用、toast
- `src/features/settings/SettingsDialog.tsx`：设置面板（WebDAV / 仓库管理 / 关于）
- `src/features/editor/EditorView.tsx`：编辑器与工具元数据（含公开/私密开关）
- `src/features/dashboard/Dashboard.tsx`：工具卡片与操作
- `src/lib/db/toolRepository.ts`：工具仓库读写（含 `isPublic` 归一化）
- `src/lib/published/publishedSnapshot.ts`：读取 `published.json`
- `src/lib/sync/webdavClient.ts`：WebDAV 客户端
- `src/lib/repo/syncLegacyTools.ts`：仓库基线同步（仅初始化阶段）
- `public/published.json`：公开快照文件

## 模式说明
- Owner（默认）：
  - 可编辑、导入导出、WebDAV 同步、发布
- Public（只读）：
  - 访问 `/?mode=public` 或 `/public`
  - 仅加载 `/published.json`
  - 隐藏编辑/删除/同步/设置等写操作入口

## 工具可见性策略
- `ToolRecord` 新增 `isPublic` 字段，默认 `true`。
- 每个工具可在编辑页设置“公开到 `published.json`”。
- 发布时只打包 `isPublic !== false` 的工具；私密工具保留在本地/WebDAV，不进入公开快照。

## 同步链路（WebDAV）
1. 本地构建快照
2. 拉取远端主文件
3. 合并快照
4. 推送主文件（优先 `If-Match`）
5. 写入历史版本并裁剪
6. 回写本地与 `lastEtag/lastSyncAt`

### 同步兼容策略
- 若 `If-Match` 返回 `412`，自动降级一次无 `If-Match` 推送。
- 提示文案：`同步成功（已兼容远端 ETag 差异）。`

## 发布链路（published.json）
1. 设置面板进入“仓库管理”
2. 第一步：管理员密码验证（`action=verify`）
3. 第二步：填写 commit 信息并发布（`action=publish`）
4. 服务端写入 `public/published.json`
5. GitHub 触发平台自动部署（Vercel/Cloudflare）

## 发布接口环境变量
- `GITHUB_TOKEN`
- `GITHUB_REPO`（完整格式：`owner/repo`）
- `ADMIN_PASSWORD`
- `GITHUB_BRANCH`（可选，默认 `main`）
- `GITHUB_PUBLISH_PATH`（可选，默认 `public/published.json`）
- `PUBLISH_VERIFY_MAX_ATTEMPTS`（可选，默认 `5`）
- `PUBLISH_VERIFY_WINDOW_SEC`（可选，默认 `600`）
- `PUBLISH_SESSION_TTL_SEC`（可选，默认 `900`）
- `PUBLISH_AUTH_SECRET`（可选）

## 安全策略（发布）
- 验密失败按 IP 限流（窗口内最大尝试次数）。
- 验密成功后签发短期 token，发布必须携带 token。
- 令牌与 IP 绑定，过期自动失效。
- 发布行为记录审计日志（成功/失败）。

## 最近关键改动
- 发布后端改为统一核心：`api/publishCore.js`
- 去掉 `GITHUB_OWNER`，仅保留 `GITHUB_REPO=owner/repo`
- 设置面板重构为三栏：WebDAV / 仓库管理 / 关于
- 发布按钮从 Topbar 移入“设置 -> 仓库管理”
- 发布改为两步：先验密，再填写 commit 并发布
- 工具新增公开/私密能力（默认公开）
- 历史版本打开设置时自动刷新
- Toast 位置上移，接近顶部栏中线

## 待处理
- Monaco 搜索组件（编辑页 `Ctrl + F`）遗留问题：
  - 右侧 `Find in Selection` 与 `Close` 按钮的 tooltip 仍会闪烁。
  - `Close` 按钮视觉对齐与 VSCode 参考仍有偏差。
  - 用户已确认“暂缓处理”，后续单独排期修复。

## 快速排障
1. 同步失败先看 `/api/webdav` 返回：
   - `WEBDAV_PROXY_UPSTREAM_FETCH_FAILED` 常见是 DNS/TLS/网络可达性
2. 发布失败看 `/api/publish`：
   - `ADMIN_PASSWORD_*`：密码或限流问题
   - `PUBLISH_AUTH_REQUIRED`：会话过期/无效
   - `GITHUB_ENV_MISSING` / `GITHUB_REPO_INVALID`：环境变量问题
   - `GitHub read/write failed`：GitHub API 权限或路径问题
3. 公共模式数据异常：
   - 检查 `/published.json` 是否存在且格式有效
