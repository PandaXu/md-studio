# Markdown 编辑页与路由 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Mermaid 工具上增加 Vue Router、`/` 与 `/markdown` 两页、Markdown+GFM 预览与 ` ```mermaid ` 块渲染、阅读浅/深、独立图表主题、导出 `.md`/HTML，并与现页共享 shell 样式。

**Architecture:** `AppShell` 提供导航与 `router-view`；Mermaid 逻辑迁入 `MermaidEditorView`；Markdown 页用 `markdown-it` 插件链生成 HTML → `DOMPurify` → 写入预览 DOM → 对 `.mermaid-block` 逐块调用现有 `mermaidInitForTheme` + `mermaid.render`；防抖与竞态 `renderSeq` 对齐 Mermaid 页。

**Tech Stack:** Vue 3、Vue Router 4、Vite 6、Monaco（`vite-plugin-monaco-editor`）、`markdown-it` 14、`markdown-it-multimd-table`、`markdown-it-task-lists`、`markdown-it-del`、`dompurify` 3、mermaid 11（已有）、TypeScript。

**Spec:** [docs/superpowers/specs/2026-05-06-markdown-editor-design.md](../specs/2026-05-06-markdown-editor-design.md)

**Verification note:** 规格 §1.3 明确首版 **不包含 Vitest**；各任务以 **`npm run typecheck`** 与 spec §10 手动冒烟为验收，不引入虚构的单元测试文件。

---

## File map（创建 / 修改）

| 路径 | 动作 |
|------|------|
| `package.json` | 修改：新增依赖 |
| `src/main.ts` | 修改：`createApp(App).use(router)` |
| `src/App.vue` | 修改：瘦身为 `AppShell` 或仅 `router-view`（与 Task 4 一致） |
| `src/layouts/AppShell.vue` | 创建：导航 + `router-view` |
| `src/router/index.ts` | 创建：`createWebHistory` 与两条路由 |
| `src/views/MermaidEditorView.vue` | 创建：自 `App.vue` 迁入 |
| `src/views/MarkdownEditorView.vue` | 创建：Markdown 页 |
| `src/styles/editor-shell.css` | 创建：从 Mermaid 视图抽离的共享 UI 样式 |
| `src/components/SourceEditor.vue` | 修改：新增 `language` prop |
| `src/markdown/render.ts` | 创建：`markdown-it` + fence |
| `src/markdown/sanitize.ts` | 创建：`DOMPurify` 配置 |
| `src/markdown/mermaidBlocks.ts` | 创建：逐块渲染与块级错误 DOM |
| `vite.config.ts` | 按需修改：若 Monaco `markdown` 模式报 worker 错，为 `languageWorkers` 增加 `'markdown'` |
| `README.md` | 可选：增加 `/markdown` 与规格链接一句 |

---

### Task 1: 安装运行时依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装依赖**

```bash
cd /Users/heytea/IdeaProjects/ai_project/mermaid
npm install vue-router@^4.4.0 markdown-it@^14.1.0 markdown-it-multimd-table@^4.2.3 markdown-it-task-lists@^2.1.1 markdown-it-del@^0.1.0 dompurify@^3.4.2
npm install -D @types/markdown-it@^14.1.0
```

- [ ] **Step 2: 确认 lockfile 与安装**

```bash
npm ls vue-router markdown-it dompurify --depth=0
```

Expected: 列出版本号，无 `UNMET PEER` 致命错误。

- [ ] **Step 3: 类型检查**

```bash
npm run typecheck
```

Expected: PASS（此时尚未改 TS 源码则应仍 PASS）。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add deps for markdown editor and vue-router"
```

---

### Task 2: Vue Router 骨架与空视图

**Files:**
- Create: `src/router/index.ts`
- Create: `src/views/MermaidEditorView.vue`（临时占位）
- Create: `src/views/MarkdownEditorView.vue`（临时占位）
- Modify: `src/main.ts`

- [ ] **Step 1: 编写 `src/router/index.ts`**

```typescript
import { createRouter, createWebHistory } from 'vue-router'
import MermaidEditorView from '@/views/MermaidEditorView.vue'
import MarkdownEditorView from '@/views/MarkdownEditorView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'mermaid', component: MermaidEditorView },
    { path: '/markdown', name: 'markdown', component: MarkdownEditorView },
  ],
})
```

- [ ] **Step 2: 临时占位视图（各约 10 行）**

`src/views/MermaidEditorView.vue`:

```vue
<script setup lang="ts"></script>
<template>
  <p>Mermaid placeholder</p>
</template>
```

`src/views/MarkdownEditorView.vue`:

```vue
<script setup lang="ts"></script>
<template>
  <p>Markdown placeholder</p>
</template>
```

- [ ] **Step 3: 挂载 router**

`src/main.ts` 完整目标示例：

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'

createApp(App).use(router).mount('#app')
```

- [ ] **Step 4: 临时修改 `App.vue` 仅输出路由**

在实现 Task 4 前可保留最小 `<router-view />`（若 `App.vue` 仍含旧 Mermaid 内容，本步先 **替换为**）：

```vue
<script setup lang="ts"></script>
<template>
  <router-view />
</template>
```

（Task 4 会用 `AppShell` 替换此结构。）

- [ ] **Step 5: 运行 dev 手动点路由**

```bash
npm run dev
```

浏览器打开 `/` 与 `/markdown`，应分别看到占位文案。

- [ ] **Step 6: typecheck**

```bash
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/router/index.ts src/views/MermaidEditorView.vue src/views/MarkdownEditorView.vue src/main.ts src/App.vue
git commit -m "feat: add vue-router and placeholder views"
```

---

### Task 3: `SourceEditor` 支持 `language` prop

**Files:**
- Modify: `src/components/SourceEditor.vue`

- [ ] **Step 1: 修改组件脚本**

将 props 改为带默认值，并在 `monaco.editor.create` 中使用：

```typescript
const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
  }>(),
  { language: 'plaintext' },
)

onMounted(() => {
  if (!host.value) return
  editor = monaco.editor.create(host.value, {
    value: props.modelValue,
    language: props.language,
    theme: 'vs',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    tabSize: 2,
  })
  // ... unchanged ...
})
```

- [ ] **Step 2: 监听 `language` 变化（可选但推荐）**

当 `props.language` 变化时 `editor.getModel()?.setLanguageId(props.language)`，避免热更新时语言不更新。

- [ ] **Step 3: typecheck**

```bash
npm run typecheck
```

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/components/SourceEditor.vue
git commit -m "feat: add language prop to SourceEditor"
```

---

### Task 4: `AppShell` + 迁入 `MermaidEditorView` + `editor-shell.css`

**Files:**
- Create: `src/layouts/AppShell.vue`
- Create: `src/styles/editor-shell.css`
- Modify: `src/App.vue`（挂载 `AppShell`）
- Modify: `src/views/MermaidEditorView.vue`（完整 Mermaid 页）
- Delete: 无（不删历史文件除非重复）

- [ ] **Step 1: 从当前 `App.vue` 剪切** `<script setup>`、`<template>`、第二个 `<style scoped>` **整块**到 `src/views/MermaidEditorView.vue`，使该视图 **行为与现 `App.vue` 一致**（含 `DEFAULT_SAMPLE`、防抖、`exportSvg`、`MERMAID_THEMES` 等）。

- [ ] **Step 2: 将两视图共用的 scoped 样式类**（`.toolbar`、`.pane`、`.primary-btn` 等）**剪切到** `src/styles/editor-shell.css`（非 scoped，使用 **纯类选择器**）。在 `MermaidEditorView.vue` 与后续 `MarkdownEditorView.vue` 的 `<script setup>` 中增加：

```typescript
import '@/styles/editor-shell.css'
```

保留各视图 **仅页面特有** 的 scoped 样式（若有）。

- [ ] **Step 3: 编写 `AppShell.vue`**

```vue
<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app app-shell">
    <nav class="app-nav" aria-label="站内导航">
      <RouterLink to="/" class="nav-link" active-class="nav-link-active">Mermaid</RouterLink>
      <RouterLink to="/markdown" class="nav-link" active-class="nav-link-active">Markdown</RouterLink>
    </nav>
    <RouterView />
  </div>
</template>

<style scoped>
.app-shell {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem 1.25rem 2rem;
}
.app-nav {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}
.nav-link {
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  border: 1px solid var(--border, #d8dce3);
  background: var(--bg, #f4f5f7);
  color: var(--text, #1a1d24);
  text-decoration: none;
}
.nav-link-active {
  background: var(--accent, #2563eb);
  border-color: var(--accent, #2563eb);
  color: #fff;
}
</style>
```

- [ ] **Step 4: `App.vue` 仅渲染 Shell**

```vue
<script setup lang="ts">
import AppShell from '@/layouts/AppShell.vue'
</script>

<template>
  <AppShell />
</template>

<style>
/* 保留原 App.vue 中第一个非 scoped 的 :root、body、#app 全局块，可整块剪切到此处或移到 src/styles/global.css 并由 main.ts import — 二选一，避免重复 */
</style>
```

- [ ] **Step 5: 确认 `MermaidEditorView` 根节点** 使用与原先一致的 `.app` 或等价 class，使 `editor-shell.css` 中选择器仍匹配。

- [ ] **Step 6: typecheck + 手动** `/` 下图表、主题、导出仍正常。

```bash
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/App.vue src/layouts/AppShell.vue src/styles/editor-shell.css src/views/MermaidEditorView.vue
git commit -m "refactor: shell layout and move mermaid page to view"
```

---

### Task 5: Markdown 渲染与消毒

**Files:**
- Create: `src/markdown/render.ts`
- Create: `src/markdown/sanitize.ts`

- [ ] **Step 1: `src/markdown/render.ts`**

```typescript
import MarkdownIt from 'markdown-it'
import mdMultimdTable from 'markdown-it-multimd-table'
import mdTaskLists from 'markdown-it-task-lists'
import mdDel from 'markdown-it-del'

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })
md.use(mdMultimdTable)
md.use(mdTaskLists, { enabled: true, label: true })
md.use(mdDel)

const defaultFence =
  md.renderer.rules.fence ??
  (() => {
    throw new Error('markdown-it: default fence rule missing')
  })

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = token.info.trim().split(/\s+/)[0] ?? ''
  if (info === 'mermaid') {
    const escaped = md.utils.escapeHtml(token.content)
    return `<div class="mermaid-block"><pre class="mermaid-source">${escaped}</pre><div class="mermaid-out" hidden></div><div class="mermaid-error" role="alert"></div></div>\n`
  }
  return defaultFence(tokens, idx, options, env, self)
}

export function renderMarkdownToHtml(source: string): string {
  return md.render(source)
}
```

- [ ] **Step 2: `src/markdown/sanitize.ts`**

```typescript
import DOMPurify from 'dompurify'

const CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'del', 's', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span', 'input',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'src', 'alt', 'class', 'id', 'align', 'colspan', 'rowspan', 'hidden', 'type', 'checked', 'disabled',
  ],
  ALLOW_DATA_ATTR: false,
}

export function sanitizeMarkdownHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, CONFIG)
}
```

若 DOMPurify 剥离了 `input`（任务列表），在实现时根据 DOM 结果 **收紧或放宽** `ALLOWED_TAGS`（以「GFM 任务列表在预览中可勾选显示」且 **无脚本** 为准）。

- [ ] **Step 3: typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/markdown/render.ts src/markdown/sanitize.ts
git commit -m "feat: markdown-it pipeline and dompurify sanitize"
```

---

### Task 6: Mermaid 块运行期渲染模块

**Files:**
- Create: `src/markdown/mermaidBlocks.ts`

- [ ] **Step 1: 实现函数签名**

```typescript
import mermaid from 'mermaid'
import type { MermaidThemeId } from '@/themes'
import { mermaidInitForTheme } from '@/themes'

export async function renderMermaidBlocksIn(
  root: HTMLElement,
  chartTheme: MermaidThemeId,
  renderSeq: number,
  getCurrentSeq: () => number,
): Promise<void> {
  mermaid.initialize(mermaidInitForTheme(chartTheme))
  const blocks = root.querySelectorAll<HTMLElement>('.mermaid-block')
  for (const block of blocks) {
    if (getCurrentSeq() !== renderSeq) return
    const pre = block.querySelector('pre.mermaid-source')
    const out = block.querySelector<HTMLElement>('.mermaid-out')
    const errEl = block.querySelector<HTMLElement>('.mermaid-error')
    const code = pre?.textContent?.trim() ?? ''
    if (!out || !errEl) continue
    errEl.textContent = ''
    out.innerHTML = ''
    out.hidden = true
    if (!code) continue
    try {
      await mermaid.parse(code)
      if (getCurrentSeq() !== renderSeq) return
      const id = `mmd-md-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const { svg } = await mermaid.render(id, code)
      if (getCurrentSeq() !== renderSeq) return
      out.innerHTML = svg
      out.hidden = false
    } catch (e) {
      if (getCurrentSeq() !== renderSeq) return
      const msg = e instanceof Error ? e.message : String(e)
      errEl.textContent = msg
      out.innerHTML = ''
      out.hidden = true
    }
  }
}
```

调用方维护递增的 `renderSeq` ref；传入 `() => renderSeqRef.value` 作为 `getCurrentSeq`。

- [ ] **Step 2: 与规格对齐**

单块失败：**不**写入 SVG，`errEl` 有文案；其它块继续循环。

- [ ] **Step 3: typecheck + Commit**

```bash
npm run typecheck
git add src/markdown/mermaidBlocks.ts
git commit -m "feat: render mermaid blocks inside markdown preview"
```

---

### Task 7: `MarkdownEditorView.vue` 完整页面

**Files:**
- Modify: `src/views/MarkdownEditorView.vue`
- 可选修改: `vite.config.ts`

- [ ] **Step 1: 状态与 localStorage**

与规格 key 一致：`markdown-editor-source`、`markdown-editor-layout`、`markdown-editor-reading`（`'light' \| 'dark'`）、`markdown-editor-mermaid-theme`（`MermaidThemeId`）。提供 `DEFAULT_SAMPLE` 字符串（含二级标题、任务列表、表格、**至少一个** ` ```mermaid ` 块）。

- [ ] **Step 2: 防抖 320ms**

`watch(source, debounceSourceUpdate)`；对 `debouncedSource` 做「编译 → sanitize → 若失败则 `markdownError` + 不更新 `lastOkHtml`；若成功则 `innerHTML = sanitized` 并更新 `lastOkHtml`」。

- [ ] **Step 3: 调用 `renderMermaidBlocksIn`**

在 `nextTick` 后、`previewRoot` ref 上执行；维护 `renderSeq`，与 Mermaid 页相同模式。

- [ ] **Step 4: 模板结构**

复用 `editor-shell.css` 的 toolbar / pane / hint / main 布局 class；顶栏含：标题、阅读浅/深、图表主题按钮组、`MERMAID_THEMES`、布局 `<select>`、主按钮下载 md、ghost 下载 HTML、载入示例；`main` 的 `:class` 与 Mermaid 页一致。

- [ ] **Step 5: 导出 `.md`**

```typescript
function exportMd() {
  const blob = new Blob([source.value], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `markdown-${Date.now()}.md`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 6: 导出 HTML**

构建字符串：`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>Export</title><style>…阅读模式 CSS…</style></head><body><div class="md-export">` + **克隆**预览根下 **已 sanitize 的 DOM**（或 `lastOkHtml` 解析为 `template` 元素），将每个 `.mermaid-block` 内 `.mermaid-out svg` **clone** 进导出副本；若无 svg 则插入 `<p>图表未渲染成功</p>`。最后 `</div></body></html>`，`Blob` + 下载 `markdown-${Date.now()}.html`。

- [ ] **Step 7: Monaco `language="markdown"`**

若控制台出现 markdown worker 相关错误，在 `vite.config.ts` 的 `languageWorkers` 中增加 `'markdown'` 并重装 dev。

- [ ] **Step 8: typecheck + 手动 §10**

```bash
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add src/views/MarkdownEditorView.vue vite.config.ts
git commit -m "feat: markdown editor view with preview and exports"
```

---

### Task 8: 文档与收尾

**Files:**
- Modify: `README.md`（可选）

- [ ] **Step 1: README 增加一句** 指向 `docs/superpowers/specs/2026-05-06-markdown-editor-design.md` 与路由 `/markdown`。

- [ ] **Step 2: 全量 typecheck + build（可选）**

```bash
npm run typecheck
npm run build
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: link markdown editor spec and route"
```

---

## Plan self-review

| Spec 章节 | 覆盖任务 |
|-----------|----------|
| §5 路由与 Shell | Task 2、4 |
| §6 UI / 布局 / localStorage | Task 4、7 |
| §7 导出 | Task 7 |
| §8 模块划分 | Task 3–7 |
| §9 错误与竞态 | Task 5–7（整篇保留 lastOk；块级错误；seq） |
| §10 验收 | 各 Task typecheck + Task 7 手动 |

**Placeholder scan:** 无 TBD/TODO；Task 6 签名已与竞态检查一致。

**类型一致：** `MermaidThemeId`、`mermaidInitForTheme` 均来自 `@/themes`，与 Mermaid 视图一致。

---

## Execution handoff

**Plan complete and saved to** `docs/superpowers/plans/2026-05-06-markdown-editor.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — 每个 Task 派生子代理，Task 间 review，迭代快  
2. **Inline Execution** — 本会话用 executing-plans 按检查点批量执行  

**Which approach?**

---

## 附：手动冒烟清单（摘自 spec §10）

- [ ] `/` 与 `/markdown` 切换正常  
- [ ] Markdown：GFM 表、任务列表、`~~del~~`  
- [ ] 0 / 1 / 多个 mermaid 块；一块语法错误不影响其它  
- [ ] 阅读浅/深切换排版；图表主题切换重绘  
- [ ] 导出 `.md` / `.html` 本地打开检查 SVG  
- [ ] localStorage 两页 key 互不覆盖  
