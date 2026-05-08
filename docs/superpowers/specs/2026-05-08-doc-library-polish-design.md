# Markdown 文档库侧栏 — 第 2 期：UI 打磨与视觉刷新（2026-05-08）

> 第 1 期已交付（feature/doc-library-panel 分支）：基础多文档库（CRUD / 搜索 / 折叠 / 上传 / 下载 / 迁移 / IndexedDB / autosave）。
> 本期聚焦 UI 打磨 + 视觉风格刷新，**不做架构级新能力**（文件夹、回收站、分享分别在第 3 / 4 期单独立项）。

## 1. 目标与非目标

### 目标

- **更明显的"per item action"入口**：始终可见的 kebab 菜单（⋯），整合现有右键菜单
- **更直观的侧栏切换**：把 ◀/▶ 内部折叠条收掉，统一从编辑区左上角的 ≡ 切换
- **更有上下文感的工具栏**：去掉静态的"Markdown 编辑与预览"页面标题，换成当前文档标题 + 切换按钮
- **更克制、更"现代"的视觉**：参考 Notion / Cursor 风格，软化边框、放宽间距、统一过渡曲线
- **侧栏明暗跟随 reading mode**：阅读模式切换深色时，整个侧栏一并切换

### 非目标（明确不做）

- 文件夹层级 / 树形结构（第 3 期）
- 回收站 / 软删除（第 4 期）
- 分享 / 公开链接（暂不立项）
- 列表虚拟化、URL 拉取超时、单测覆盖等优化项（如有需要单独 issue）

## 2. 总体布局变化

### 2.1 顶部工具栏重构

**前：**

```
[Markdown 编辑与预览 (h1)]  [浅 深] [图表主题] [Raw WYSIWYG] [视图布局 select] [下载 HTML]
```

**后：**

```
[≡] [当前文档标题]              [浅 深] [图表主题] [视图布局 select] [下载 HTML]
                                                 (code 模式时多一组 [Raw WYSIWYG])
```

- `≡` 按钮：单一侧栏切换入口；点击切换 `sidebarCollapsed`；图标固定（不随 expand/collapse 改变方向）
- 当前文档标题：来自 `lib.activeDoc.title`；空库或未选中时显示「未选中文档」并以 `var(--muted)` 弱化
- 标题不可在工具栏内联编辑（重命名仍走侧栏 in-place rename / kebab 菜单），避免双入口

### 2.2 侧栏内部折叠条移除

- 当 `!sidebarCollapsed`：渲染完整 `<DocumentLibraryPanel>`，内部不再有 32px 的 `.doc-panel-collapse-bar` 与 ◀ 按钮
- 当 `sidebarCollapsed`：通过 `v-if="!sidebarCollapsed"` 直接将组件移出 DOM；`grid-template-columns` 由 `var(--doc-sidebar-w, 240px) 1fr` 切换为 `1fr`
- `DocumentLibraryPanel` 不再需要 `collapsed` prop / `update:collapsed` emit；该状态由 `MarkdownEditorView` 单独维护

## 3. kebab 菜单与右键菜单合并

### 3.1 触发与定位

| 触发 | 锚点 | 实现 |
|---|---|---|
| 列表项 ⋯ 按钮点击 | 按钮右下角（绝对定位相对列表项） | 设置 `ctxMenu = { id, anchor: 'kebab' }` |
| 列表项右键 | 鼠标坐标（fixed 定位） | 沿用现有 `ctxMenu = { id, x, y }` |

实现上 `ctxMenu` 状态扩展为：

```ts
type CtxMenuState =
  | { id: string; mode: 'cursor'; x: number; y: number }
  | { id: string; mode: 'kebab' }   // 定位由 v-for 内的 button ref 决定
```

`mode === 'kebab'` 时菜单 `position: absolute`，挂在列表项内（非 Teleport）；`mode === 'cursor'` 时仍 Teleport 到 body。

外部点击 / Escape 关闭逻辑保留，按 mode 分别看自己的根元素。

### 3.2 菜单项（5 项，统一使用）

| # | 标签 | 启用条件 | 调用 |
|---|---|---|---|
| 1 | 重命名 | 总是 | 复用 in-place rename 流程（`startRename(doc)`） |
| 2 | 恢复跟随 H1 | `doc.titleLocked === true` | `lib.unlockTitle(id)` |
| 3 | 下载 | 总是 | 调 view 层 `downloadDocAsMd(id)`，内部 `await lib.flush()` + `lib.exportDocAsMarkdown(id)` |
| 4 | 复制一份 | 总是 | `lib.duplicateDoc(id)` |
| 5 | 删除 | 总是（danger 色） | `confirm()` 后 `lib.deleteDoc(id)` |

「恢复跟随 H1」disabled 时仍可见但不可点（`opacity: 0.4`）。

### 3.3 二次确认

「删除」保留 `window.confirm('确定删除该文档吗？此操作不可撤销。')`，与现状一致。

## 4. composable 扩展

### 4.1 新增方法

```ts
// useDocumentLibrary.ts
export type LibraryHandle = {
  // ...existing fields
  exportDocAsMarkdown(id: string): { filename: string; blob: Blob } | null
  duplicateDoc(id: string): Promise<Doc | null>
}
```

#### `exportDocAsMarkdown(id)`

```ts
function exportDocAsMarkdown(id: string): { filename: string; blob: Blob } | null {
  const doc = docs.value.find((d) => d.id === id)
  if (!doc) return null
  const blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8' })
  return { filename: safeFilenameFromTitle(doc.title), blob }
}
```

`exportActiveAsMarkdown` 内部 delegate：

```ts
function exportActiveAsMarkdown(): { filename: string; blob: Blob } | null {
  if (!activeId.value) return null
  return exportDocAsMarkdown(activeId.value)
}
```

#### `duplicateDoc(id)`

```ts
async function duplicateDoc(id: string): Promise<Doc | null> {
  if (id === activeId.value) await flush()  // 确保拿到最新内容
  const original = docs.value.find((d) => d.id === id)
  if (!original) return null
  const ts = Date.now()
  const dup: Doc = {
    id: newId(),
    title: `${original.title} 副本`,
    titleLocked: original.titleLocked,
    content: original.content,
    createdAt: ts,
    updatedAt: ts,
  }
  docs.value = [dup, ...docs.value]
  if (store) await store.put(dup)
  return dup
}
```

- **不**自动 setActive（用户在原文档继续编辑；可在副本上手动切换）
- 副本继承 `titleLocked`（避免标题立刻被新内容的 H1 覆盖）

### 4.2 view 层下载封装

```ts
async function downloadDocAsMd(id: string) {
  await lib.flush()     // 任意 id 都先 flush 当前 active 的 pending 写入
  const out = lib.exportDocAsMarkdown(id)
  if (!out) return
  // ...同现有 downloadActiveMd 的 a.download 流程
}
```

`downloadActiveMd` 重定向为 `() => activeId.value && downloadDocAsMd(activeId.value)`。

## 5. 视觉风格刷新

### 5.1 新增 CSS 变量（`src/styles/main.css`）

```css
:root {
  /* Doc panel — light */
  --doc-panel-bg: #fafbfc;
  --doc-panel-surface: #ffffff;
  --doc-panel-text: #1f2937;
  --doc-panel-muted: #6b7280;
  --doc-panel-border: rgba(15, 23, 42, 0.06);
  --doc-panel-hover: rgba(15, 23, 42, 0.04);
  --doc-panel-active-bg: rgba(99, 102, 241, 0.08);
  --doc-panel-active-bar: #4f46e5;
}

[data-reading='dark'] {
  --doc-panel-bg: #0f1419;
  --doc-panel-surface: #161b22;
  --doc-panel-text: #e5e7eb;
  --doc-panel-muted: #9ca3af;
  --doc-panel-border: rgba(255, 255, 255, 0.08);
  --doc-panel-hover: rgba(255, 255, 255, 0.04);
  --doc-panel-active-bg: rgba(129, 140, 248, 0.16);
  --doc-panel-active-bar: #818cf8;
}
```

### 5.2 `MarkdownEditorView` 根加 reading 属性

```vue
<div
  class="editor-shell-with-sidebar"
  :data-reading="reading"
  :data-sidebar-collapsed="sidebarCollapsed ? 'true' : 'false'"
>
```

`reading` 是已有的 `'light' | 'dark'` ref。侧栏 CSS 通过祖先 `[data-reading='dark']` 选择器命中变量。

### 5.3 侧栏视觉变更（`DocumentLibraryPanel.vue` scoped）

| 元素 | 变更 |
|---|---|
| `.doc-panel` | 移除 `border` / `border-radius`；改为 `background: var(--doc-panel-bg)`；右侧 1px `var(--doc-panel-border)` 作为与编辑区分隔；高度撑满父容器 |
| `.doc-panel-collapse-bar` & `.doc-panel-collapse-btn` | **删除**（连 CSS 一起） |
| `.doc-panel-header` | 删除 `<h2>Documents</h2>`；padding 收紧到 `0.5rem 0.65rem`；header 由原 surface 蓝灰背景改为透明（吃 panel-bg） |
| `.doc-panel-search` | 容器 padding 缩到 `0.4rem 0.55rem`；`.doc-panel-search-input` 去掉 border 与 border-radius，只用 `border-bottom: 1px solid var(--doc-panel-border)`；focus 时 `border-bottom-color: var(--doc-panel-active-bar)`，宽度过渡 0.15s |
| `.doc-panel-item` | padding `0.5rem 0.6rem 0.5rem 0.85rem`；title 字号 `0.875rem` weight `500`；timestamp `0.7rem` 色 `var(--doc-panel-muted)`；transition `background 0.12s ease` |
| `.doc-panel-item:hover` | bg `var(--doc-panel-hover)` |
| `.doc-panel-item.active` | bg `var(--doc-panel-active-bg)`；左侧 2px 实色 `var(--doc-panel-active-bar)`；title 颜色加深到 `var(--doc-panel-text)` |
| `.doc-panel-kebab`（新增） | 列表项右上角；`width: 22px; height: 22px; border-radius: 4px;`；默认 `opacity: 0.35`；列表项 hover 时升到 `1`；按钮自身 hover 加 `background: var(--doc-panel-hover)` |
| 列表项内部布局 | `display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto;`；title 在 `[1,1]`、timestamp 在 `[2,1]`、kebab 在 `[1,2]` 并 `grid-row: span 2` 垂直居中 |
| `.doc-panel-ctx-menu`（含 kebab dropdown 与 cursor menu 复用） | 圆角 `6px`；阴影 `0 4px 12px rgba(0,0,0,0.08)`；`.danger` 红色加重对比 |

### 5.4 编辑区视觉变更（`MarkdownEditorView.vue` scoped）

| 元素 | 变更 |
|---|---|
| `.editor-page` | 维持现有结构 |
| 现 `<h1 class="title">` | **删除** |
| 新 `<button class="toolbar-toggle">≡</button>` | 36×36 方形；圆角 `6px`；hover bg `rgba(0,0,0,0.04)`（暗色 `rgba(255,255,255,0.05)`）；transition 0.12s |
| 新 `<h2 class="doc-title">{{ ... }}</h2>` | 字号 `0.95rem` weight `600`；单行省略；`flex: 1 1 auto`；`min-width: 8rem` |
| `.toolbar` | 去掉 border + 圆角；改为下方 1px solid `var(--border)`；padding 收紧到 `0.6rem 1rem` |
| `.theme-btn` / `.ghost-btn` / `.primary-btn` | hover transition 0.12s；border `var(--border)`；hover border 变 `var(--accent)` 浅化 |
| `.hint` | 字号 `0.75rem`；颜色 `var(--muted)`；`margin: 0.4rem 0 0`（更紧凑） |

### 5.5 全局过渡（`main.css`）

```css
button, input, select, .doc-panel-item {
  transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
```

避免 reading mode 切换时颜色硬切。

### 5.6 可访问性

- 移除 `<h2>Documents</h2>` 文本，但 `<aside class="doc-panel" aria-label="Documents">` 保留 landmark 命名
- `≡` 按钮 `aria-label="切换文档库侧栏"` + `aria-expanded` 反映 `!sidebarCollapsed`
- 列表项 kebab 按钮 `aria-haspopup="menu"` + `aria-expanded`

## 6. 兼容性 / 数据 / 设置持久化

- 不改 IndexedDB schema、不引入新的 localStorage key
- `markdown-editor-library-collapsed` 维持现有读写
- `useDocumentLibrary` 现有 API 全部兼容；新增方法是纯增量

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 始终可见的 kebab 增加视觉噪音 | 默认 `opacity: 0.35`；列表项 hover 才升至全亮；与 Notion / Cursor 同理 |
| 删除内部折叠条改动现有用户习惯 | ≡ 按钮 + tooltip "切换文档库"；交互更直接 |
| 大量 CSS 变量重命名易引入回归 | 改动按文件分批；每改一文件人工对比 light / dark + active item 显示 |
| `duplicateDoc` 未自动激活，用户可能困惑 | 在「复制一份」后顶部 `importBanner` 提示「已创建副本：xxx 副本」(沿用现有 importBanner 4s 自隐机制) |

## 8. 验收清单（DoD）

```text
[kebab 菜单]
□ 每个列表项右侧始终可见 ⋯ 按钮（默认半透明）
□ hover 列表项时按钮不透明度升至 1
□ 点击 ⋯ 在该项下方/右侧弹出菜单（位置稳定，不超出可视区）
□ 右键列表项空白处弹出同样菜单（位置在鼠标坐标）
□ 5 项操作全部可用：重命名 / 恢复跟随 H1（locked 才启用）/ 下载 / 复制一份 / 删除（confirm）
□ 「下载」结果与从顶部下载按钮一致（含先 flush）
□ 「复制一份」生成 "原标题 副本"，列表头部插入，原文档保持活跃
□ Esc / 点击菜单外 都能关闭

[≡ 切换 + 标题]
□ 工具栏首格是 [≡] + 文档标题；空库时标题显示「未选中文档」（弱化色）
□ 点击 ≡ 收起/展开侧栏
□ 收起态：侧栏完全消失，编辑区铺满
□ 刷新页面侧栏状态保留

[视觉刷新]
□ 侧栏背景 / 边框 / 列表项 hover / active 颜色 全部走新变量
□ reading mode 切换 light↔dark 时，侧栏颜色平滑过渡（0.12s）
□ Documents 标题文字消失，按钮自然顶到顶部
□ 搜索框无 box border，只剩底线；focus 时底线变 accent
□ 工具栏外边框消失；按钮 hover 有平滑过渡

[回归]
□ 编辑、autosave、切换文档、删除、上传、下载（top + 单项）、HTML 导出 全部可用
□ FloatingSourceEditor、Mermaid、TUI、双击预览跳行 全部可用
□ 老用户迁移流程不受影响（无新 localStorage key、无 IndexedDB schema 变化）
```

## 9. 实现拆分提示（writing-plans 用）

预计任务粒度（仅供参考，writing-plans 决定）：

1. composable 扩展（`exportDocAsMarkdown` + `duplicateDoc`）
2. CSS 变量与全局过渡（`main.css`）
3. `DocumentLibraryPanel`：去折叠条 + 始终 kebab + ctx menu mode 扩展 + 视觉刷新
4. `MarkdownEditorView`：≡ + 标题 + 工具栏精简 + scoped 视觉刷新 + downloadDocAsMd
5. 手工回归（按 §8 清单）+ README 不动（无新功能描述需更新）

