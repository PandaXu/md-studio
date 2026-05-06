# Markdown 编辑与预览页 — 需求与设计规格

| 项目 | 内容 |
|------|------|
| 文档类型 | 需求说明 + 设计规格（与现有 Mermaid 页对齐） |
| 状态 | **已定稿**（决策齐备，待实现计划与编码） |
| 关联仓库 | `mermaid`（Vue 3 + Vite） |
| 关联规格 | [2026-05-06-mermaid-editor-design.md](./2026-05-06-mermaid-editor-design.md)（Mermaid 单页；本规格在其上扩展路由与 Markdown 能力） |

---

## 1. 背景与目标

### 1.1 背景

在已有「Mermaid 源码编辑 + 防抖预览 + 多主题 + 布局与导出」工具的基础上，增加 **Markdown 文档** 编辑能力：正文为 GFM 风格排版预览，文中的 **` ```mermaid `** 围栏块渲染为与 Mermaid 页一致的矢量图；整体 **交互与视觉** 参照现 Mermaid 页面。

### 1.2 产品目标

- **路由**：使用 **Vue Router**，`/` 为 Mermaid 编辑页，`/markdown` 为 Markdown 编辑页；支持刷新与前进后退。
- **编辑**：Monaco 编辑 Markdown 源码；与 Mermaid 页相同量级的 **防抖** 后更新预览（约 320ms，实现时可与现页对齐）。
- **预览**：GFM 能力（表格、任务列表、删除线等，以选定 `markdown-it` 插件为准）；` ```mermaid ` 块渲染为图；**正文阅读模式** 支持 **浅色 / 深色** 两档；**图表预览主题** 与 Mermaid 页一致，使用现有 **`MERMAID_THEMES`** 与 **`mermaidInitForTheme`**，且与阅读模式 **独立控制**。
- **导出**：**主按钮** 下载当前 **`.md`**；**次要按钮（ghost）** 下载 **单文件 HTML**（内嵌当前阅读模式排版样式与当前已渲染的 Mermaid **SVG**，以静态阅读为主，不追求复杂脚本交互）。
- **持久化**：Markdown 页使用 **独立 localStorage 前缀**，不与 Mermaid 页的 key 冲突。

### 1.3 非目标（首版）

- 数学公式（KaTeX/MathJax）、脚注、Wiki 链接等非 GFM 扩展。
- Monaco Markdown language service 全量能力（可选；首版以语法高亮 + editor worker 为主）。
- 导出 HTML 的离线「可再次编辑 mermaid 源码」交互（非必须）。
- Vitest 等自动化测试（首版以 typecheck + 手动冒烟为准）。

### 1.4 成功标准（验收导向）

- 两路由可切换，各页状态（至少源码、布局、阅读模式、图表主题）按 key 独立持久化。
- 修改 Markdown 后，预览在防抖后更新；GFM 与多 mermaid 块可肉眼验证。
- Mermaid 块解析失败时：**不保留该块上次成功图**，显示块级错误，其余块与正文不受影响。
- Markdown 整篇解析或 sanitize 出现不可恢复错误时，预览区顶部有与 Mermaid 页风格一致的 **error-banner**。
- 导出 `.md` 与导出 HTML 可用，HTML 在浏览器中打开可读且 Mermaid 图为内联 SVG。

---

## 2. 术语

| 术语 | 含义 |
|------|------|
| 源码 | 用户在 Monaco 中编辑的 Markdown 文本 |
| 阅读模式 | 控制正文排版浅色/深色的两档 UI 状态 |
| 图表主题 | 与现 Mermaid 页相同的 Mermaid `initialize` 主题选项 |
| 占位块 | 由自定义 fence 生成的、供运行期 `mermaid.render` 填充的 DOM 容器 |

---

## 3. 已确认的决策摘要

| 主题 | 决策 |
|------|------|
| 导航 | **Vue Router**：`/` Mermaid，`/markdown` Markdown |
| Markdown 能力 | **GFM** + 正文内 **` ```mermaid `** 渲染为图 |
| 导出 | **两者都要**：主 **下载 `.md`**，次 **下载 HTML** |
| 正文与图 | **阅读浅/深** 与 **图表主题** **分控**；图表主题复用 `themes.ts` |

---

## 4. 实现策略（摘要）

- **渲染管道**：推荐并采用 **`markdown-it` + GFM 插件**；自定义 fence：`mermaid` 语言输出带 **转义后源码** 的占位容器（`data-*` 或子文本节点策略实现时选定），避免将用户输入当作 HTML 注入。
- **安全**：预览与导出 HTML 共用 **`dompurify`**（或等价）白名单策略；允许占位所需属性。
- **Mermaid**：防抖后 `mermaid.initialize(mermaidInitForTheme(chartTheme))`，再对容器内各占位 **逐块** `parse` / `render`；使用渲染序号或取消标记避免竞态。
- **Monaco**：`SourceEditor` 增加 `language` prop；Markdown 页使用 **`markdown`**。

---

## 5. 信息架构与路由

- **`src/router/index.ts`**：`/` → `MermaidEditorView`，`/markdown` → `MarkdownEditorView`。
- **`AppShell`**（建议 `src/layouts/AppShell.vue`）：顶区 **站内导航**（`router-link`：Mermaid、Markdown），`router-link-active` 与现页「激活主题按钮」视觉一致；内容区 `<router-view />`。
- **`App.vue`**：仅挂载 shell + `router-view` 结构（或等价一层）；全局样式可保留或最小迁移至 `src/styles/global.css`（实现阶段决定，**禁止无关大重构**）。

---

## 6. Markdown 页 UI 与行为

### 6.1 顶栏（与 Mermaid 页对齐的组件语言）

- 标题：**Markdown 编辑与预览**（与 Mermaid 页标题句式一致）。
- **阅读模式**：浅色 / 深色（按钮组或分段控件，持久化）。
- **图表主题**：与 Mermaid 页相同的 `MERMAID_THEMES` 按钮组（持久化）。
- **视图布局**：与 Mermaid 页相同三档 — **左右并列**、**仅源码**、**仅预览**（持久化）。
- **主按钮**：下载 `.md`（`primary-btn`）。
- **次按钮**：下载 HTML（`ghost-btn`）。
- **载入示例**：提供含 GFM 与至少一个 ` ```mermaid ` 块的示例正文（持久化可覆盖当前编辑，行为与 Mermaid 页「载入示例」一致）。

### 6.2 主区

- 双 pane：**源码** / **预览**；类名与布局网格与 Mermaid 页一致（`layout-split` / `layout-code` / `layout-preview`），小屏断点与现页一致。

### 6.3 预览区 DOM 与样式

- 预览根节点带阅读模式 class，使用 **CSS 变量** 定义排版色，与现站 `--bg` / `--surface` / `--border` / `--text` / `--muted` / `--accent` 等 **协调**。
- 共享 **toolbar / pane / hint / error-banner / 按钮** 样式：抽到 **`src/styles/editor-shell.css`**（或等价文件名），由 Mermaid 与 Markdown 两视图引入，避免重复维护。

### 6.4 localStorage Key 约定（建议前缀）

| Key | 含义 |
|-----|------|
| `markdown-editor-source` | Markdown 源码 |
| `markdown-editor-layout` | split / code / preview |
| `markdown-editor-reading` | `light` \| `dark` |
| `markdown-editor-mermaid-theme` | 与 `MermaidThemeId` 一致 |

Mermaid 页继续使用现有 key（如 `mermaid-editor-layout`、主题 key 等），**不得**与上表共用同一 key 存不同含义。

---

## 7. 导出规格

### 7.1 下载 `.md`

- 内容为当前编辑器字符串，UTF-8，`text/markdown` 或 `text/plain` Blob；文件名 `markdown-<timestamp>.md`（或等价）。

### 7.2 下载 HTML

- 单文件：`<html><head>…</head><body>…</body></html>`。
- **样式**：内嵌与 **当前阅读模式** 一致的排版 CSS（可从共享样式提炼最小子集，避免整站无关规则）。
- **Mermaid**：以 **内联 SVG** 形式嵌入导出文档；**从当前预览 DOM 中序列化各占位块内已存在的 `svg` 元素**（与屏上所见一致）。若某块无可用 `svg`（未渲染成功），导出 HTML 中该块位置使用 **固定简短占位说明**（例如「图表未渲染成功」），不嵌入脚本。
- **脚本**：首版 **无或最小**；不依赖在线 CDN 加载 Mermaid（导出为静态可读）。

---

## 8. 模块与文件划分（建议）

| 路径 | 职责 |
|------|------|
| `src/views/MermaidEditorView.vue` | 自当前 `App.vue` **迁入** 的 Mermaid 逻辑与模板 |
| `src/views/MarkdownEditorView.vue` | Markdown 页顶栏、布局、防抖、预览挂载、导出 |
| `src/components/SourceEditor.vue` | 新增 `language` prop（默认 `plaintext`） |
| `src/markdown/render.ts` | `markdown-it` 配置与 GFM、mermaid fence |
| `src/markdown/sanitize.ts` | DOMPurify 封装 |
| `src/markdown/mermaidBlocks.ts` 或 composable | 占位查询、逐块渲染、块级错误 |

---

## 9. 错误处理与竞态

- **整篇 Markdown**：编译或 sanitize 抛错 → 顶部 `error-banner`；**预览区保留上一次成功渲染的 HTML**（与 Mermaid 页「保留上次成功预览」一致），不写入本次失败结果。
- **Mermaid 单块**：`parse`/`render` 失败 → 该块展示错误，**清空该块 SVG**，不影响其他块。
- **并发**：快速输入时仅以 **最后一次** 防抖结果为有效渲染；Mermaid 异步渲染需 `seq` 或 `AbortController` 策略与现 Mermaid 页对齐。

---

## 10. 测试与验收清单（首版）

- `npm run typecheck` 无新增错误。
- 手动：路由切换；布局三态；阅读浅/深；图表主题切换；GFM（表、任务列表）；0/1/多 mermaid 块；单块语法错误；导出 `.md` / HTML；localStorage 两页互不覆盖。

---

## 11. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-06 | 初版：brainstorming 定稿 §1–§3 与需求决策入库 |
