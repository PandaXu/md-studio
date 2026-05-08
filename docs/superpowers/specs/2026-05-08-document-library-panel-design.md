# Markdown 文档库侧栏 — 需求与设计规格

| 项目 | 内容 |
|------|------|
| 文档类型 | 需求说明 + 设计规格 |
| 状态 | **已定稿**（与对话确认一致，待实现计划与编码） |
| 关联仓库 | `md-studio`（Vue 3 + Vite） |
| 关联规格 | [2026-05-06-markdown-editor-design.md](./2026-05-06-markdown-editor-design.md) · [2026-05-07-load-md-toolbar-design.md](./2026-05-07-load-md-toolbar-design.md) · [2026-05-08-tui-editor-markdown-ux-design.md](./2026-05-08-tui-editor-markdown-ux-design.md) |

---

## 1. 背景与目标

### 1.1 背景

当前 Markdown 页采用单文档模型：正文存于 `localStorage['markdown-editor-source']`，「加载 .md」会**整块替换**当前内容。用户需要在多篇文档之间切换、组织时缺少入口。

### 1.2 产品目标

在 Markdown 页左侧新增 **Documents 侧栏**，提供：

- 文档列表（按最近修改倒序、支持标题搜索、可折叠侧栏）
- 4 个 header 图标按钮：上传 / 下载 / 删除 / 新建
- 列表项：单击切换、双击重命名、右键菜单、当前选中态高亮
- 老用户单文档自动迁移到库

### 1.3 非目标（首版）

- 跨标签页 / 跨设备同步
- 文档分组、文件夹、标签、收藏、置顶、拖拽排序
- 全文搜索（仅标题搜索）
- 撤销"删除文档"（删除即不可逆，弹确认即可）
- 快捷键（避免与 Monaco / TUI Editor 冲突，待评估）
- Mermaid 页接入文档库

### 1.4 成功标准（验收导向）

- 多篇文档可独立创建、切换、重命名、删除
- 切换 / 刷新页面后仍停留在上次选中的文档
- 老用户首启时原 `markdown-editor-source` 内容自动出现在库中
- 现有渲染管线、Mermaid 行为、TUI Editor 体验**不退化**

---

## 2. 已确认的决策摘要

| 主题 | 决策 |
|------|------|
| 存储位置 | **A**：纯浏览器 IndexedDB |
| 标题来源 | **混合 + 锁定**：默认从正文 H1 派生；用户重命名后永久锁定，提供"恢复跟随 H1"入口 |
| 每文档状态 | **A**：仅正文 + 标题随文档；布局 / 阅读主题 / 图表主题 / 编辑模式仍为全局偏好 |
| 保存时机 | **A**：全程自动保存（沿用现有防抖节奏），无"保存"按钮、无未保存挽留弹窗 |
| 侧栏 UI | **A**：左侧常驻 + 可折叠 + 折叠状态持久化；与现有 3 种布局正交 |
| 工具栏入口收敛 | **A**：库管理操作收编到侧栏；工具栏移除「加载 .md」「下载 .md」「载入示例」；保留「下载 HTML」 |
| 老数据迁移 | **A**：首启自动迁移 `markdown-editor-source` 到库，迁移后清除旧 key |
| 排序与搜索 | **A**：按 `updatedAt` 倒序 + 标题子串搜索 |

---

## 3. 信息架构与组件

### 3.1 页面结构（Markdown 页）

```
┌──────────────────────────────────────────────────────────────┐
│ [折叠▶] 站内导航：Markdown | Mermaid                          │
├──────────┬───────────────────────────────────────────────────┤
│Documents │  工具栏：阅读模式 / 图表主题 / 编辑模式 / 视图布局 / 下载HTML│
│ ⬆⬇🗑+    │ ┌─────────────┬─────────────────────────────────┐ │
│ 🔍搜索   │ │             │                                 │ │
│ ─────── │ │  源码编辑   │            预览                  │ │
│●doc 1   │ │             │                                 │ │
│ doc 2    │ │             │                                 │ │
│ doc 3    │ └─────────────┴─────────────────────────────────┘ │
└──────────┴───────────────────────────────────────────────────┘
```

- 侧栏宽度：240px；折叠后剩 32px 窄条，仅显示展开按钮
- 折叠 / 展开状态写入 localStorage，刷新保留
- 侧栏与 3 种布局（split / code / preview）**正交**：折叠与否不影响主区域

### 3.2 组件拆分

| 路径 | 职责 |
|------|------|
| `src/views/MarkdownEditorView.vue` | 顶层编排；持有当前选中文档的 `source`；接入侧栏组件；不直接管库 |
| `src/components/DocumentLibraryPanel.vue`（**新增**） | 侧栏 UI：折叠控制、4 个图标按钮、搜索框、列表渲染、就地重命名、右键菜单、上传下拉菜单（复用现有 URL 对话框逻辑） |
| `src/composables/useDocumentLibrary.ts`（**新增**） | 库的状态管理：`docs` / `activeId` / CRUD / 搜索过滤 / 排序 / 自动保存调度；对外暴露 `activeContent` 让 View 双向绑定 |
| `src/markdown/documentStore.ts`（**新增**） | IndexedDB 适配层：`open()` / `getAll()` / `get(id)` / `put(doc)` / `delete(id)`；纯函数式，便于注入与单测 |
| `src/markdown/documentMigration.ts`（**新增**） | 一次性迁移：检测 `markdown-editor-source` → 创建库文档 → 清除旧 key |
| `SourceEditor.vue` / `TuiEditor.vue` / `FloatingSourceEditor.vue` | **不改**：继续走 `v-model` 绑定 `source` |

样式约束：

- 沿用 `src/styles/editor-shell.css` 的色板与 `.ghost-btn` / `.primary-btn` 等控件类
- 新增 `.doc-library-*` 类作用域在 `DocumentLibraryPanel.vue` 内（scoped）
- 选中态：左侧 3px 强调色竖条 + 浅色背景

---

## 4. 数据模型与存储

### 4.1 IndexedDB 结构

| 项 | 取值 |
|------|------|
| Database | `md-studio` |
| Version | `1` |
| Object Store | `documents` |
| Key path | `id`（UUID v4 字符串） |
| Indexes | `updatedAt`（用于排序） |

### 4.2 文档对象 schema

```ts
type Doc = {
  id: string                 // uuid v4
  title: string              // 显示用
  titleLocked: boolean       // true=用户已重命名，不再跟随 H1
  content: string            // 正文 Markdown
  createdAt: number          // ms epoch
  updatedAt: number          // ms epoch；正文变更刷新；重命名不刷新（详见 5.4）
}
```

### 4.3 localStorage Key 全景

| Key | 现状 | 新版本 |
|------|------|--------|
| `markdown-editor-source` | 当前文档正文 | **首启读一次后清除**（迁移完成） |
| `markdown-editor-layout` | 全局布局偏好 | **保留不动** |
| `markdown-editor-reading` | 全局阅读主题 | **保留不动** |
| `markdown-editor-mermaid-theme` | 全局图表主题 | **保留不动** |
| `markdown-editor-edit-mode` | 全局编辑模式 | **保留不动** |
| `markdown-editor-active-doc-id`（**新增**） | — | 上次选中的文档 ID；启动时读取并定位；找不到则选库内 `updatedAt` 最新一篇 |
| `markdown-editor-library-collapsed`（**新增**） | — | 侧栏折叠状态（`'1'` / `'0'`） |

### 4.4 写入节奏（自动保存）

```
正文输入 → debounce 320ms（沿用现有节奏）→ documentStore.put(doc)
                                          ↓
                                 触发列表 updatedAt 重排
```

- 同一篇文档连续输入只触发一次 `put`
- **切换文档前 `flush()` pending 的 put**，确保不丢字
- 重命名 / 删除 等结构变更**立即** put，不走 debounce

### 4.5 容量与性能

| 项 | 决策 |
|------|------|
| 文档数量 | 软上限 500，超过仅在新建时给一次提示，不阻断 |
| 单文档大小 | 软上限 2 MiB（与 md-fetch 上限一致），超过弹出确认；用户确认后允许写入 |
| 启动加载 | 首版**一次性** `getAll()` 全量读入内存（按 `updatedAt` desc）；以预估"500 篇 × 平均 50KB ≈ 25MB"为上限，可接受 |
| 异常恢复 | IndexedDB 打开失败 → 顶部红条提示 + 退化到内存模式（仅当前 session 可编辑，不持久化） |

**Follow-up**：如果实际使用中文档数量或单文档体积接近上限，可拆分为 `documents`（元数据 + 标题）与 `documentContents`（正文）双 store，实现 lazy load。本规格不引入此复杂度。

---

## 5. 标题派生规则

### 5.1 派生函数（伪代码）

```ts
function deriveTitle(content: string, fallbackOrdinal: number): string {
  const m = content.match(/^\s*#\s+(.+?)\s*$/m)
  return m ? m[1].trim() : `未命名 ${fallbackOrdinal}`
}
```

### 5.2 状态机

| 当前状态 | 触发 | 新状态 / 动作 |
|---------|------|-------------|
| `titleLocked=false` | 内容变更 | 重新跑 `deriveTitle`；写回 `title` |
| `titleLocked=false` | 用户在列表里重命名 | `titleLocked=true`，写入用户输入；之后内容变更**不再**改 `title` |
| `titleLocked=true` | 内容变更 | `title` 不变 |
| `titleLocked=true` | 列表项右键「恢复跟随 H1」 | `titleLocked=false`，立即重新派生一次 |

### 5.3 命名规则

- "未命名 N" 的 `N` = 库中现有"未命名 *"的最大序号 + 1（避免重号）
- 标题最大长度 100 字符；超出截断 + 末尾加 `…`
- 用户输入空字符串视为撤销重命名；保留原 `title` 与 `titleLocked` 状态

### 5.4 重命名与排序的关系

**重命名不刷新 `updatedAt`**，避免列表跳动；只有正文变更才会重排。

---

## 6. 关键交互

### 6.1 侧栏 Header 4 个图标

按从左到右顺序：

| 图标 | tooltip / aria-label | 行为 |
|------|--------------------|------|
| ⬆ 上传 | 导入 Markdown | **下拉菜单**：「从本地选择…」（多选）/「从 URL 载入…」（URL 对话框，复用现有 md-fetch 通道与 `VITE_MD_FETCH_BASE` 配置）。每个文件 = 一篇新文档；导入完成后切换到**第一篇**新文档 |
| ⬇ 下载 | 导出当前为 .md | 把**当前选中**文档导出 `.md`，文件名 = 标题（清洗非法字符；空则 `markdown-${ts}.md`）。**库为空时禁用**（`disabled` + `aria-disabled="true"`） |
| 🗑 删除 | 删除当前文档 | 二次确认（原生 `confirm()` 即可）；删除后切换到列表中**上一篇**（按 `updatedAt` 倒序的相邻项），无相邻项则切到下一篇，库空则进入"空库态"（见 6.6）。**库为空时禁用** |
| ＋ 新建 | 新建空文档 | 立刻创建一篇空文档（`title='未命名 N'`，`content=''`），切换为当前；编辑器获得焦点 |

无障碍：每个图标 `aria-label` 同 tooltip；上传按钮 `aria-haspopup="menu"` + `aria-expanded`。

CRUD 操作（`createDoc` / `updateDoc` / `deleteDoc` / `renameDoc` / `setActiveDoc`）由 `useDocumentLibrary.ts` composable 暴露；`DocumentLibraryPanel.vue` 仅消费 composable 而不直接访问 `documentStore`。

### 6.2 搜索框

- 实时过滤（不防抖，纯前端 `filter`）
- 不区分大小写、子串匹配文档 `title`
- 无匹配显示空态文案"未匹配到文档"
- 搜索框右侧 `×` 按钮可清空，点击后恢复全量列表

### 6.3 列表项交互

| 交互 | 行为 |
|------|------|
| 单击 | 切换为当前选中文档 |
| 双击标题 | 进入**就地重命名**（`<input>` 替换文本，自动选中全部）；回车确认、Esc 取消、失焦视为确认 |
| 右键 / 长按 | 上下文菜单：「重命名」「恢复跟随 H1」（仅 `titleLocked=true` 时可点）「删除」 |
| Hover | 浅背景反馈，便于识别点击区域 |

**切换文档时**：
1. `flush()` 当前文档 pending 的 put
2. `activeId` 改为新文档 id，写入 `markdown-editor-active-doc-id`
3. 把新文档的 `content` 灌进 `source` ref → 现有渲染管线自动跑起来
4. 主区域**滚动到顶部**（避免上一篇的滚动位置错位）
5. 折叠的 Mermaid `details` 状态不需要继承（每篇文档独立）

### 6.4 上传流（多文件）

```
用户选 N 个文件
  → 顺序读取（FileReader.readAsText, UTF-8）
  → 每个文件 → createDoc({title: 文件名去后缀, content, titleLocked: true})
  → titleLocked = true（用户主动给的文件名优先于 H1）
  → 全部完成后：activeId = 第一个新建的 id
  → 任何一个文件失败：不阻塞其他文件，结束后汇总错误
    （示例文案："成功 3/5，失败 2 个：foo.md, bar.md"）
```

**URL 上传**：单篇导入；标题派生顺序：
1. `URL.pathname` 末段去 `.md` / `.markdown` 后缀（如 `http://x.com/foo.md` → `foo`）
2. 若末段为空 / 仅 `/`，回退到 `URL.hostname`
3. 全部失败时 `title='URL 导入'`

`titleLocked=true`（用户主动选了源，不应被 H1 覆盖）。

### 6.5 重命名 / 恢复跟随 H1

- 重命名：UI 改完 → `title=用户输入`、`titleLocked=true`、**`updatedAt` 不变**、立即 `put`
- 恢复跟随 H1：`titleLocked=false` → 立刻调 `deriveTitle(content)` 重算 `title`、**`updatedAt` 不变**、立即 `put`

### 6.6 边界态

| 场景 | 行为 |
|------|------|
| **库为空（首次新装 / 删完了）** | 主区域显示居中空态：标题"还没有文档" + 两个按钮：「新建空文档」「加载示例」（点后者 = 新建一篇内容为 `harness-era-article.md` 的文档） |
| **删除最后一篇** | 直接进入空库态，**不**自动新建（避免用户疑惑"我刚删的怎么又出来了"） |
| **找不到 `activeId` 对应文档** | 自动切到 `updatedAt` 最新一篇；若库空则空库态 |
| **多标签页同时操作** | 不做跨标签页同步（首版非目标）；用户在 A 标签删除，B 标签可能还显示旧标题，下次切换 / 刷新时纠正 |
| **IndexedDB 不可用**（隐私模式 / 配额耗尽） | 顶部红条提示 + 退化到内存模式：可编辑但**不会持久化**；侧栏正常显示新建 / 删除（仅内存生效） |
| **快捷键** | 首版**不做**，列入 follow-up |

---

## 7. 工具栏调整

### 7.1 Before / After

**当前**：
```
[阅读浅/深] [图表主题x4] [编辑模式 Raw/WYSIWYG] [视图布局▼] [加载 .md▼] [下载 .md] [下载 HTML] [载入示例]
```

**改后**：
```
[阅读浅/深] [图表主题x4] [编辑模式 Raw/WYSIWYG] [视图布局▼] [下载 HTML]
```

### 7.2 搬迁映射

| 原工具栏入口 | 去向 |
|------------|------|
| 「加载 .md」下拉（本地 / URL） | 侧栏 ⬆ 上传 图标的下拉菜单（语义改为"导入为新文档"） |
| 「下载 .md」 | 侧栏 ⬇ 下载 图标 |
| 「载入示例」 | 库为空时的空态按钮；其他时候不再常驻 |
| 「下载 HTML」 | **保留在工具栏**（语义是"导出当前预览渲染结果"，不属于库管理） |

工具栏右侧 hint 文案（"阅读模式 / 图表主题 / 布局 / 编辑模式"）按现有逻辑显示，不变。

---

## 8. 迁移流（首启执行一次）

```
应用挂载 → openDB('md-studio', 1)
  → documents.count() === 0?
       ├─ 是：尝试读 localStorage['markdown-editor-source']
       │     ├─ 有内容：
       │     │     createDoc({
       │     │       title: deriveTitle(content) || '已有草稿',
       │     │       content,
       │     │       titleLocked: false
       │     │     })
       │     │     activeId = 新文档 id
       │     │     localStorage.removeItem('markdown-editor-source')
       │     └─ 无内容：
       │           createDoc({
       │             title: '示例文章',
       │             content: harness-era-article.md (默认示例),
       │             titleLocked: false
       │           })
       │           activeId = 新文档 id
       └─ 否：activeId = localStorage['markdown-editor-active-doc-id'] ?? 最新一篇 id
```

**幂等性**：靠"`documents` 是否为空 + 旧 key 是否被清除"双条件保证只迁移一次。即使用户刷新或多标签页打开，也不会重复创建。

---

## 9. 错误处理与无障碍

### 9.1 错误展示模式

| 场景 | 展示 |
|------|------|
| IndexedDB 打开失败 | 顶部红条 banner，置于现有 `topError` **上方**（双红条时按"基础设施 > 渲染管线"层级垂直堆叠）；文案"无法访问本地数据库，编辑内容将不会被持久化" |
| 上传文件读取失败 / 超大 / 编码异常 | 顶部红条或行内提示（沿用现有 `loadErr` 模式），不阻塞其他文件 |
| URL 导入失败 | URL 对话框内行内错误（沿用现有 `loadErr`） |
| 删除失败 | 浏览器 `alert()` 简单提示并保留文档 |
| 单文档超过 2 MiB 软上限 | 上传时弹 `confirm()` 二次确认；编辑时不提示（避免打扰） |

### 9.2 无障碍

- 所有图标按钮带 `aria-label`
- 上传下拉：`aria-haspopup="menu"` + `aria-expanded`
- 列表项：`role="option"`，列表 `role="listbox"`，当前选中带 `aria-selected="true"`
- 键盘：上下方向键在列表内移动焦点（**首版可选**），Enter 切换；Esc 退出重命名 / 关闭下拉

---

## 10. 测试与验收清单

### 10.1 库管理

- [ ] 新建：能创建空文档、自动取"未命名 N"、立即切换并编辑
- [ ] 上传本地（多选）：N 个文件 = N 篇新文档；汇总成功 / 失败计数；切到第一篇
- [ ] 上传 URL：复用现有对话框；导入为新文档而非替换
- [ ] 下载：导出当前文档为 `.md`，文件名 = 当前标题（清洗非法字符）
- [ ] 删除：二次确认；按规则切到相邻文档；删完进入空库态
- [ ] 重命名：双击列表项 / 右键菜单均可；锁定后 H1 改动不再影响标题
- [ ] 恢复跟随 H1：右键菜单可见且生效
- [ ] 搜索：标题子串实时过滤；清除恢复全量

### 10.2 侧栏

- [ ] 折叠 / 展开正常，状态刷新后保留
- [ ] 列表按 `updatedAt` 倒序；编辑当前文档触发自动重排
- [ ] 空库态显示"新建空文档 / 加载示例"两个入口

### 10.3 数据

- [ ] 切换文档前 flush；不丢字
- [ ] 刷新页面后停留在上次选中的文档
- [ ] 老 localStorage 内容首启自动迁移；旧 key 被清除
- [ ] IndexedDB 不可用时退化提示出现，编辑可继续（仅 session 内）

### 10.4 工具栏

- [ ] 「下载 HTML」、阅读 / 图表 / 编辑 / 布局选项行为与现有完全一致
- [ ] 「下载 .md」「加载 .md」「载入示例」从工具栏移除，无残留入口

### 10.5 类型与构建

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过

### 10.6 自动化测试（推荐）

- `documentStore.ts` 的纯函数 / 适配层用 `fake-indexeddb` 跑单测
- `documentMigration.ts` 用注入的 IDBFactory + 模拟 `localStorage` 跑迁移单测
- 标题派生 `deriveTitle` 与"未命名 N" 序号生成纯函数单测

---

## 11. 与现有规格的关系

- **不修改** [`2026-05-06-markdown-editor-design.md`](./2026-05-06-markdown-editor-design.md) 的渲染管线、sanitize、Mermaid 行为
- **不修改** [`2026-05-08-tui-editor-markdown-ux-design.md`](./2026-05-08-tui-editor-markdown-ux-design.md) 的 TUI 集成；TUI 编辑区继续 `v-model` 接 `source`，对它而言"换文档" = "外部赋值 source"
- **不修改** [`2026-05-07-load-md-toolbar-design.md`](./2026-05-07-load-md-toolbar-design.md) 中的 md-fetch 通道契约（`/__md-studio/md-fetch?url=`、`VITE_MD_FETCH_BASE`、2MiB / 10s 限制全部沿用）；只是调用方从工具栏挪到侧栏
- **不影响** Mermaid 页（独立 `MermaidEditorView.vue`，不接入文档库）

---

## 12. 实施风险与缓解

| 风险 | 缓解 |
|------|------|
| TUI Editor 在外部突然替换 `source` 时光标 / 滚动状态错位 | 切换文档时编辑器实例 `setMarkdown` + 主动滚顶；必要时强制 remount（用 `:key="activeId"`） |
| IndexedDB 在测试环境不可用导致单测难写 | `documentStore.ts` 用纯函数 + 注入 IDBFactory；单测用 `fake-indexeddb` 或抽象接口 mock |
| 多文档存储后 `localStorage` 仍然被旧版本使用导致回滚混乱 | 迁移完成后清除旧 key；如需回滚需手动告知用户"将丢失新建的库内文档" |
| 列表项重命名时与 `updatedAt` 排序产生跳动 | 重命名**不刷新** `updatedAt`（不算"内容变更"），列表稳定 |
| 切换文档瞬间 debounce 还没 flush 导致脏写 | 切换前调用 `flush()` 同步 put；同时按 `activeId` 校验，避免覆盖错文档 |
