# CodeDeck

CodeDeck 是一个面向个人效率场景的在线工具工作站。  
你可以在页面中创建/编辑/运行工具（当前以单文件 HTML 工具为主），并通过本地数据库与 WebDAV 在多设备间同步；同时支持将“公开工具”发布为 `published.json` 作为公共只读快照。

## 项目定位

- 私有工作台：本地编辑 + WebDAV 跨设备同步
- 公开导航站：发布 `published.json` 后，以只读模式对外展示
- 适合场景：个人工具集合、自用工具导航、轻量工具原型实验

## 核心功能

### 工具管理

- 新建、编辑、运行、下载、删除
- 置顶、分类、标签、搜索
- 卡片拖拽排序并持久化
- 每个工具支持公开/私密可见性（默认公开）

### 编辑体验

- Monaco 编辑器（分屏 / 代码 / 预览）
- 工具详情面板：名称、描述、分类、标签、TODO
- 运行页支持 `runner.html` 独立执行

### 数据能力

- 本地持久化：IndexedDB（Dexie）
- 导入/导出：JSON 备份
- WebDAV 同步：主快照 + 历史版本
- 冲突处理：ETag 冲突重试与兼容降级策略

### 发布能力

- 发布入口：设置面板 -> 仓库管理
- 两步流程：先验密，再填写 commit 并发布
- 发布产物：`public/published.json`
- 公共只读访问：`/?mode=public` 或 `/public`

## 运行模式

### 管理模式（默认）

- 可编辑工具、分类、标签、TODO
- 可导入导出、WebDAV 同步、仓库发布
- 可访问完整设置面板

### 公共只读模式

- 访问 `/?mode=public` 或 `/public`
- 只读取 `published.json` 快照
- 不显示写操作入口（编辑/删除/同步/设置/导入导出等）

## 技术栈

- React 19
- TypeScript 5
- Vite 7
- Tailwind CSS
- Dexie（IndexedDB）
- Monaco Editor（`@monaco-editor/react`）
- dnd-kit
- Zod

## 快速开始

```bash
npm install
npm run sync:legacy-tools
npm run dev
```

默认地址：`http://localhost:5173`

## 命令说明

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动本地开发服务 |
| `npm run build` | 生产构建（`tsc -b && vite build`） |
| `npm run preview` | 本地预览生产构建 |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run sync:legacy-tools` | 从根目录旧工具文件生成 `public/repo-tools` 基线清单 |

## 数据与同步设计

### 本地存储层（Dexie）

核心表：

- `tools`：工具数据（代码、元数据、可见性、排序、删除状态）
- `categories`：分类
- `tags`：标签
- `settings`：应用与同步设置（`key = app`）
- `syncMeta`：迁移和同步元信息

补充说明：

- `settings` 现已增加 localStorage 兜底备份，降低浏览器偶发 IndexedDB 记录丢失时的配置回退风险。

### WebDAV 同步层

默认远端文件模型：

- 主文件：`codedeck-data.v2.json`
- 历史文件：`codedeck-data.v2-YYYYMMDD-HHmmss.json`

同步流程：

1. 本地构建快照
2. 拉取远端快照与 ETag
3. 本地/远端快照合并
4. 推送主文件（优先 `If-Match`）
5. 写入历史文件并按备份上限裁剪
6. 回写本地快照与 `lastEtag / lastSyncAt`

冲突策略：

- 遇到 `412 Precondition Failed` 时自动重试
- 若命中部分 WebDAV 服务 ETag 差异，自动降级一次无 `If-Match` 推送

### 仓库基线工具（Repo Baseline）

- 位置：`public/repo-tools/manifest.json` 与 `public/repo-tools/code/*`
- 作用：初始化种子工具来源（随仓库版本管理）
- 当前策略：不作为同步/恢复后的强制覆盖源，避免覆盖 WebDAV/本地真实状态

## 发布设计（`published.json`）

发布入口：设置面板 -> 仓库管理

发布链路：

1. `action=verify`：验证管理员密码，签发短期 token
2. `action=publish`：携带 token + commit message + snapshot 提交发布
3. 服务端写入 `public/published.json`
4. GitHub 更新触发部署平台（Vercel / Cloudflare）自动重部署

发布范围：

- 仅打包 `isPublic !== false` 的公开工具
- 私密工具仅保留在本地/WebDAV，不进入公开快照

## 发布接口环境变量

`/api/publish`（以及本地 dev 代理）依赖以下环境变量：

### 必填

1. `GITHUB_TOKEN`
- 是否必填：是
- 作用：调用 GitHub Contents API 读写 `published.json`

2. `GITHUB_REPO`
- 是否必填：是
- 格式：`owner/repo`（例如 `Airlur/codedeck`）
- 作用：目标仓库定位
- 错误行为：格式不合法会返回 `GITHUB_REPO_INVALID`

3. `ADMIN_PASSWORD`
- 是否必填：是
- 作用：发布前管理员密码验证
- 错误行为：缺失会返回 `ADMIN_PASSWORD_NOT_CONFIGURED`

### `GITHUB_TOKEN` 获取方式
1. 访问 [New personal access token (classic)](https://github.com/settings/tokens/new) 
2. `Note` 填写用途，例如 `codedeck-publisher`
3. `Expiration` 按需选择
4. `Scopes` 勾选 `repo`
5. 生成后立即复制保存，因为只会显示一次

#### 部署平台环境变量示例

```bash
GITHUB_TOKEN=github_pat_xxx
GITHUB_REPO=owner/repo
ADMIN_PASSWORD=请改成你自己的高强度密码
```

### 可选

1. `GITHUB_BRANCH`
- 默认值：`main`
- 作用：发布提交目标分支

2. `GITHUB_PUBLISH_PATH`
- 默认值：`public/published.json`
- 作用：发布文件路径（仓库内）

3. `PUBLISH_VERIFY_MAX_ATTEMPTS`
- 默认值：`5`
- 取值范围：`1 ~ 20`
- 作用：验证码错误限流窗口内最大尝试次数

4. `PUBLISH_VERIFY_WINDOW_SEC`
- 默认值：`600`
- 取值范围：`60 ~ 3600`
- 作用：验密限流时间窗口（秒）

5. `PUBLISH_SESSION_TTL_SEC`
- 默认值：`900`
- 取值范围：`60 ~ 7200`
- 作用：验密后发布 token 有效期（秒）

6. `PUBLISH_AUTH_SECRET`
- 默认值：空（未配置时自动派生）
- 作用：发布 token HMAC 签名密钥
- 建议：生产环境显式配置，避免密钥漂移

## 部署说明

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/Airlur/codedeck)

### Cloudflare Pages

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://dash.cloudflare.com/?to=/:account/pages/new/provider/github)

### 推荐构建配置

- Build command: `npm run build`
- Build output directory: `dist`

## 核心目录结构（含说明）

```text
.
├─ src/                                — 前端应用源码
│  ├─ app/                             — 应用入口、路由与筛选状态
│  │  ├─ App.tsx                       — 主流程编排（模式切换、同步、发布、全局 toast）
│  │  ├─ routes.tsx                    — 路由定义
│  │  └─ state.ts                      — 视图筛选状态类型
│  ├─ features/                        — 业务模块
│  │  ├─ dashboard/Dashboard.tsx       — 工具卡片列表与操作
│  │  ├─ editor/EditorView.tsx         — Monaco 编辑器与工具详情编辑
│  │  ├─ settings/SettingsDialog.tsx   — 设置面板（WebDAV / 仓库管理 / 关于）
│  │  ├─ sync/SyncStatusBanner.tsx     — 同步状态展示组件
│  │  └─ tool-detail/ToolDetailSummary.tsx — 工具详情摘要组件
│  ├─ lib/                             — 数据层与业务逻辑
│  │  ├─ db/                           — Dexie 访问、迁移、仓储封装
│  │  ├─ sync/                         — WebDAV 客户端与合并引擎
│  │  ├─ repo/                         — 仓库基线工具加载与同步
│  │  ├─ published/                    — 公开快照读取逻辑
│  │  └─ utils/                        — runner/hash/fileType 等工具函数
│  ├─ components/                      — 通用组件
│  │  ├─ layout/                       — 顶部栏与侧边栏
│  │  └─ ui/                           — Button/Modal/Toast/Select 等基础组件
│  ├─ types/schema.ts                  — 全局数据结构与 Zod schema
│  ├─ main.tsx                         — 前端启动入口
│  └─ index.css                        — 全局样式
├─ public/                             — 静态资源与公开数据
│  ├─ runner.html                      — 工具运行页
│  ├─ published.json                   — 对外公开快照
│  └─ repo-tools/                      — 仓库基线工具与 manifest
├─ api/                                — 服务端接口（Vercel）
│  ├─ webdav.js                        — WebDAV 代理接口
│  ├─ publish.js                       — 发布接口入口
│  └─ publishCore.js                   — 发布核心逻辑
├─ functions/api/webdav.js             — Functions 环境 WebDAV 代理
├─ scripts/sync-legacy-tools.mjs       — 基线工具同步脚本
└─ AGENT.md                            — 项目上下文记忆（供后续对话快速接续）
```

## 许可证

本项目采用 [MIT License](./LICENSE)。
