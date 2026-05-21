# MD Studio

基于 **Vue 3 + Vite** 的本地文档工作台：在浏览器中管理 Markdown 文档库、实时预览与导出，并提供独立的 **Mermaid** 编辑页。macOS 桌面应用支持**本地文件系统模式**，直接操作磁盘上的 Markdown 文件。默认进入 **Markdown**（`/markdown`），侧栏可一键切到 **Mermaid**（`/mermaid`）。

## 界面预览

以下为 Markdown 编辑页在**深色**与**浅色**全站阅读主题下的界面（含文档库树、工具栏与预览区）。

| 深色模式 | 浅色模式 |
| :--: | :--: |
| ![Markdown 页 — 深色主题](docs/readme/markdown-dark.png) | ![Markdown 页 — 浅色主题](docs/readme/markdown-light.png) |

## 功能概览

### Markdown（`/markdown`）

- **文档库（IndexedDB）**
  - 树形展示：根目录与**文件夹**嵌套；**标题行中间区域**拖拽为同级**排序**（上半/下半决定插到该条前或后）；**文件夹左侧（展开钮与图标）与右侧窄条**为**移入该文件夹**（文档、子文件夹均可拖入；文件夹不可套入自身或其子孙）
  - 文档：新建、切换、重命名、标题锁定/解锁、复制、删除、搜索、侧栏折叠与宽度拖拽
  - 文件夹：根目录新建（**弹窗输入名称**）、在任意文件夹下**新建子文件夹**（右键或 ⋯ 菜单）；重命名、删除、导出 ZIP、右键/⋯ 菜单
  - **导入**：工具栏「从本地选择」支持 `.md` / `.txt` / `.zip`；**上传文件夹**仅导入 `.md`，在库中创建与**本地所选文件夹同名**的根目录并保留其下子目录结构（也可从文件夹菜单上传到当前文件夹下）。支持从 URL 拉取（需配置 `VITE_MD_FETCH_BASE`）
  - 导出当前文档为 `.md`（侧栏下载图标）
  - 老数据自动迁移（规格见设计文档）

- **编辑与预览**
  - 布局：**左右并列** / **仅 Markdown 源码** / **仅预览**
  - 源码：**Monaco**（Raw）或 **Milkdown WYSIWYG**；WYSIWYG 内 ` ```mermaid ` 代码块自动渲染图表，随**全站浅色/深色**切换主题
  - **编辑历史**：工具栏撤销 / 重做（停顿快照式，与 Monaco 逐字符撤销并存）
  - GFM 表格、任务列表；`DOMPurify` 消毒后的 HTML 预览
  - 文中 ` ```mermaid ` 分块渲染（企业风主题等）；WYSIWYG 编辑器内 mermaid 代码块直接在源码下方渲染图表
  - 工具栏：**下载 HTML**、**载入示例**、全站阅读主题切换（日月图标）

### Mermaid（`/mermaid`）

- Monaco 编辑 + 防抖预览；**全站浅色/深色**与 Monaco 主题、Mermaid enterprise 变体同步
- 布局：左右并列 / 仅代码 / 仅预览
- 导出 SVG；解析失败时保留上一次成功图形并提示错误
- 工具栏：编辑历史撤销/重做、载入示例等

### 全站与通用

- **阅读主题**：全站 `light` / `dark`（`localStorage` 键 `md-studio-reading`，兼容旧键迁移），影响 `data-reading`、侧栏、Markdown 预览、WYSIWYG、Mermaid 等
- 路由：`/` 重定向至 `/markdown`；Markdown 与 Mermaid 共用壳层与侧栏导航风格
- **WYSIWYG**：Milkdown（ProseMirror 内核，插件化架构），支持 CommonMark + GFM 完整语法，编辑器内 ` ```mermaid ` 图表即时渲染

### 本地文件系统模式（macOS 桌面应用专属）

在 Electron 桌面应用中，文件管理面板底部提供 **本地 / Web** 模式切换：

- **打开工作区**：选择本地文件夹作为工作区，自动扫描所有 `.md` 文件并展示目录树
- **直接读写**：编辑内容实时保存到磁盘文件，无需导入导出
- **文件管理**：新建/重命名/删除文件和文件夹，操作直接反映到文件系统
- **时间戳**：文档列表显示文件的真实修改时间
- **外部变更监听**：文件被其他程序修改时自动刷新目录树；当前编辑文件有未保存修改时弹出冲突提醒
- **双向滚动同步**：左右并列布局下，编辑区与预览区滚动位置实时同步
- **Web 模式**：浏览器内仍使用 IndexedDB 管理文档，两种模式数据完全隔离

## 需求与规格

- Mermaid：[docs/superpowers/specs/2026-05-06-mermaid-editor-design.md](docs/superpowers/specs/2026-05-06-mermaid-editor-design.md)
- Markdown：[docs/superpowers/specs/2026-05-06-markdown-editor-design.md](docs/superpowers/specs/2026-05-06-markdown-editor-design.md)
- 文档库面板：[docs/superpowers/specs/2026-05-08-document-library-panel-design.md](docs/superpowers/specs/2026-05-08-document-library-panel-design.md)
- 本地文件模式：[docs/superpowers/specs/2026-05-11-local-file-mode-design.md](docs/superpowers/specs/2026-05-11-local-file-mode-design.md)

## 本地运行

需要 **Node.js 20+**（建议 LTS）。

```bash
npm install
npm run dev
```

浏览器打开终端里提示的本地地址即可。

## macOS 桌面应用（Electron）

使用内置 **Chromium**（与 Chrome 同源内核）将站点打为本地 `.app`，数据仍走浏览器 **IndexedDB**，完全离线可用。

```bash
npm install
npm run electron:pack   # 快速生成 release/mac-arm64/MD Studio.app（或 x64，视本机架构）
# 或
npm run electron:build  # 额外产出 DMG、ZIP，输出在 release/
```

开发时连 Vite 热更新：

```bash
npm run electron:dev
```

首次打开未签名应用时，若 macOS 拦截，可在 **系统设置 → 隐私与安全性** 中选择仍要打开，或右键应用 → 打开。

应用与网站共用图标源文件 **`public/icon.png`**（1024×1024）；修改后重新执行 `npm run build` 与 `electron:pack` / `electron:build` 即可更新页签图标与 `.app` / DMG 图标。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run preview` | 本地预览构建产物 |
| `npm run typecheck` | `vue-tsc` 类型检查 |
| `npm run electron:dev` | Vite + Electron 联调 |
| `npm run electron:pack` | 构建前端并打包为本地 `.app`（`--dir`） |
| `npm run electron:build` | 构建前端并打 macOS `dmg` / `zip` |

## 技术说明

- **Monaco**：`vite-plugin-monaco-editor`（见 `vite.config.ts`）；Markdown 使用 `language="markdown"` 时按需带上相关 worker。
- **Milkdown**：基于 ProseMirror 的插件化 WYSIWYG 编辑器，支持 CommonMark + GFM；` ```mermaid ` 代码块内通过自定义 ProseMirror 插件自动渲染为企业风 Mermaid 图表，随全站 light/dark 切换主题。
- **Mermaid**：`mermaid.initialize` 随主题与阅读模式更新；单页与 Markdown 预览内块级渲染失败时的降级策略见代码注释。
- **IndexedDB**：文档与文件夹持久化（`src/markdown/documentStore.ts`）；导入 ZIP 使用 `fflate`；目录上传通过 `webkitdirectory` 解析路径（`src/markdown/directoryMdImport.ts`）。
- **Electron 桌面包**：`vite` 使用 `base: './'` 以便 `file://` 加载资源；在 `file:` 协议下路由自动为 **hash 模式**（地址形如 `#/markdown`），与浏览器内访问的 history 模式并存。


