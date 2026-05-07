# Markdown 页「加载 .md」工具栏 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `MarkdownEditorView`「下载 .md」左侧增加「加载 .md」下拉（本地文件 + URL 对话框），开发环境由 Vite 中间件实现 `GET /__md-studio/md-fetch` 代拉远程 Markdown；生产依赖可选 `VITE_MD_FETCH_BASE`，未配置则灰显 URL 载入。

**Architecture:** 单一常量模块 `src/constants/mdFetchApi.ts` 定义路径与浏览器端 `buildMdFetchProxyUrl`；`vite/mdFetchDevMiddleware.ts` 实现 Node `fetch`、10s 超时、2MiB 上限、最多 3 次重定向、`Content-Type` 非文本则 415；`MarkdownEditorView.vue` 负责下拉/对话框、`FileReader`、ESC 与点击外部收起、aria 属性；错误统一在 **对话框内** 展示，不重复写入 `topError`（预览区 banner 仍只用于 Markdown 管线）。

**Tech Stack:** Vue 3、Vite 6、TypeScript、`vite` 的 `Connect` 中间件类型、浏览器 `fetch` / `FileReader`。

**Spec:** [docs/superpowers/specs/2026-05-07-load-md-toolbar-design.md](../specs/2026-05-07-load-md-toolbar-design.md)

**Verification note:** 仓库 **无 Vitest**。以 **`npm run typecheck`** 与 spec §7 手动冒烟为验收；不引入虚构的自动化测试文件。

---

## File map（创建 / 修改）

| 路径 | 动作 |
|------|------|
| `src/constants/mdFetchApi.ts` | 创建：`MD_FETCH_PATH`、`defaultMdFetchBaseForEnv`、`buildMdFetchProxyUrl`、`isProdUrlFetchConfigured` |
| `vite/mdFetchDevMiddleware.ts` | 创建：开发服务器 `GET /__md-studio/md-fetch` 处理 |
| `vite.config.ts` | 修改：`plugins` 中增加自定义 `configureServer` 插件，或在现有 `defineConfig` 内 `configureServer` 挂载中间件 |
| `env.d.ts` | 修改：扩展 `ImportMetaEnv` 增加 `readonly VITE_MD_FETCH_BASE?: string` |
| `src/views/MarkdownEditorView.vue` | 修改：工具栏、下拉、隐藏 file input、遮罩+对话框、脚本逻辑与 scoped 样式 |
| `src/styles/editor-shell.css` | 可选：若下拉/对话框样式与现有 shell 强相关可抽公共 class；**首版允许仅 scoped** |

---

### Task 1: 共享 md-fetch 常量（前后端共用路径）

**Files:**
- Create: `src/constants/mdFetchApi.ts`

- [ ] **Step 1: 新增 `src/constants/mdFetchApi.ts`**

```typescript
/** 与规格一致：同源路径 `/__md-studio/md-fetch?url=` */
export const MD_FETCH_PATH = '/__md-studio/md-fetch' as const

/** 开发：空串表示使用当前页面 origin 的相对路径。生产：来自 `VITE_MD_FETCH_BASE`，已去尾部 `/`。 */
export function defaultMdFetchBaseForEnv(isDev: boolean, viteMdFetchBase: string | undefined): string {
  if (isDev) return ''
  return (viteMdFetchBase ?? '').trim().replace(/\/+$/, '')
}

/** 生产是否允许「从 URL 载入」：非 dev 时基址非空才算配置好。 */
export function isUrlFetchEnabled(fetchBase: string, isDev: boolean): boolean {
  if (isDev) return true
  return fetchBase.length > 0
}

/** 构造浏览器请求的代理 URL（含 query `url`）。 */
export function buildMdFetchProxyUrl(fetchBase: string, targetAbsoluteUrl: string): string {
  const q = new URLSearchParams({ url: targetAbsoluteUrl }).toString()
  const pathWithQuery = `${MD_FETCH_PATH}?${q}`
  if (!fetchBase) return pathWithQuery
  return `${fetchBase.replace(/\/+$/, '')}${pathWithQuery}`
}
```

- [ ] **Step 2: 类型检查**

```bash
cd /Users/heytea/IdeaProjects/ai_project/md-studio
npm run typecheck
```

Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add src/constants/mdFetchApi.ts
git commit -m "feat(md-fetch): add shared proxy path helpers"
```

---

### Task 2: Vite 开发中间件 `GET /__md-studio/md-fetch`

**Files:**
- Create: `vite/mdFetchDevMiddleware.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: 新增 `vite/mdFetchDevMiddleware.ts`**

以下内容与规格 §5.4 对齐：`http`/`https`、超时 10s、体上限 2MiB、重定向至多 3 次、`Content-Type` 明显非文本返回 415；错误响应 **JSON**：`{"error":"…"}`，成功响应 **UTF-8 纯文本**：`Content-Type: text/plain; charset=utf-8`。

```typescript
import type { Connect } from 'vite'
import { URL as NodeURL, URLSearchParams } from 'node:url'
import { MD_FETCH_PATH } from '../src/constants/mdFetchApi.ts'

const MAX_BODY_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

function sendJson(res: Connect.ServerResponse, status: number, error: string) {
  const body = JSON.stringify({ error })
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

function sendText(res: Connect.ServerResponse, status: number, body: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(body)
}

function isClearlyNonText(contentType: string | null): boolean {
  if (!contentType) return false
  const main = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (main.startsWith('text/')) return false
  if (
    main === 'application/json' ||
    main === 'application/javascript' ||
    main === 'application/xml' ||
    main === 'application/xhtml+xml' ||
    main === 'application/octet-stream'
  ) {
    return false
  }
  if (
    main.startsWith('image/') ||
    main.startsWith('video/') ||
    main.startsWith('audio/') ||
    main.startsWith('font/') ||
    main === 'application/pdf' ||
    main === 'multipart/'
  ) {
    return true
  }
  return true
}

async function readBodyWithLimit(res: globalThis.Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) {
    const buf = await res.arrayBuffer()
    if (buf.byteLength > maxBytes) throw new Error(`响应超过 ${maxBytes} 字节`)
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(`响应超过 ${maxBytes} 字节`)
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    merged.set(c, off)
    off += c.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged)
}

async function fetchWithRedirectLimit(
  startUrl: string,
  signal: AbortSignal,
): Promise<globalThis.Response> {
  let current = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, { method: 'GET', redirect: 'manual', signal })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) {
        return res
      }
      if (hop === MAX_REDIRECTS) {
        throw new Error(`重定向超过 ${MAX_REDIRECTS} 次`)
      }
      current = new NodeURL(loc, current).href
      continue
    }
    return res
  }
  throw new Error(`重定向超过 ${MAX_REDIRECTS} 次`)
}

function parseTargetUrl(raw: string | undefined): URL {
  if (!raw) throw new Error('缺少 url 参数')
  const target = new URL(raw)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('仅支持 http 或 https URL')
  }
  return target
}

export function mdFetchDevMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next()
    const reqUrl = req.url
    if (!reqUrl || !reqUrl.startsWith(`${MD_FETCH_PATH}?`)) {
      if (reqUrl === MD_FETCH_PATH) {
        sendJson(res, 400, '缺少 url 查询参数')
        return
      }
      return next()
    }

    let targetAbsolute: URL
    try {
      const qs = new URLSearchParams(reqUrl.slice(MD_FETCH_PATH.length + 1))
      const encoded = qs.get('url')
      if (!encoded) throw new Error('缺少 url 查询参数')
      targetAbsolute = parseTargetUrl(encoded)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendJson(res, 400, msg)
      return
    }

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
    try {
      const upstream = await fetchWithRedirectLimit(targetAbsolute.href, ac.signal)
      if (!upstream.ok) {
        sendJson(res, 502, `远端返回 ${upstream.status} ${upstream.statusText}`)
        return
      }
      const ct = upstream.headers.get('content-type')
      if (isClearlyNonText(ct)) {
        sendJson(res, 415, 'Content-Type 非文本，已拒绝载入')
        return
      }
      const text = await readBodyWithLimit(upstream, MAX_BODY_BYTES)
      sendText(res, 200, text)
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError'
      sendJson(res, aborted ? 504 : 502, aborted ? `请求超时（${TIMEOUT_MS}ms）` : (e instanceof Error ? e.message : String(e)))
    } finally {
      clearTimeout(timer)
    }
  }
}
```

注意：`req.url === MD_FETCH_PATH` 且无 query 时返回 400，与「有问号」分支一致化处理。

- [ ] **Step 2: 修改 `vite.config.ts` 挂载中间件**

在既有 `export default defineConfig({...})` 中增加 **`server`** 不适用时改用 **`vite` 插件**，推荐最小改动：直接在 config 顶层增加 **`configureServer`**：

```typescript
import { mdFetchDevMiddleware } from './vite/mdFetchDevMiddleware'

export default defineConfig({
  // ...existing plugins, resolve, ...
  configureServer(server) {
    server.middlewares.use(mdFetchDevMiddleware())
  },
})
```

**import 语句** 放在文件顶部与其它 import 并列；路径以仓库根为准：`./vite/mdFetchDevMiddleware`。

- [ ] **Step 3: 手动冒烟（开发服务器）**

Terminal A:

```bash
cd /Users/heytea/IdeaProjects/ai_project/md-studio
npm run dev
```

Terminal B（将 `<port>` 换为控制台打印的端口，例如 5173）：

```bash
curl -sS "http://127.0.0.1:<port>/__md-studio/md-fetch?url=https%3A%2F%2Fexample.com%2F" | head
```

Expected: 非 JSON 错误或得到远端页面文本前缀（example.com 為 HTML，中间件仍会当文本返回只要不触发 415；若 Content-Type 为 `text/html` 属 `text/` 前缀，会通过校验）。

再用 **明显图片 URL**（若易得）验证返回 JSON `415`。

- [ ] **Step 4: 类型检查**

```bash
npm run typecheck
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add vite/mdFetchDevMiddleware.ts vite.config.ts
git commit -m "feat(dev): vite md-fetch middleware for proxying markdown URLs"
```

---

### Task 3: `VITE_MD_FETCH_BASE` 类型声明

**Files:**
- Modify: `env.d.ts`

- [ ] **Step 1: 扩展 `ImportMetaEnv`**

在 `/// <reference types="vite/client" />` 之下增加：

```typescript
interface ImportMetaEnv {
  readonly VITE_MD_FETCH_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

若文件已存在其它 `ImportMetaEnv` 字段，**合并到同一 interface**，禁止重复声明冲突。

- [ ] **Step 2: typecheck**

```bash
npm run typecheck
```

Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add env.d.ts
git commit -m "chore: declare VITE_MD_FETCH_BASE for md-fetch"
```

---

### Task 4: `MarkdownEditorView.vue` UI 与载入逻辑

**Files:**
- Modify: `src/views/MarkdownEditorView.vue`

- [ ] **Step 1: `script setup` 增加 import 与状态**

在现有 `vue` 的 import 中加入 `onBeforeUnmount`；并增加：

```typescript
import {
  buildMdFetchProxyUrl,
  defaultMdFetchBaseForEnv,
  isUrlFetchEnabled,
} from '@/constants/mdFetchApi'
```

在同文件 **`loadSample` 邻近**增加下列逻辑（常量与函数名称可按实现微调，但行为须一致）：

```typescript
const loadMenuOpen = ref(false)
const loadUrlOpen = ref(false)
const loadUrlDraft = ref('')
const loadErr = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const mdFetchBase = computed(() =>
  defaultMdFetchBaseForEnv(import.meta.env.DEV, import.meta.env.VITE_MD_FETCH_BASE),
)
const urlLoadEnabled = computed(() => isUrlFetchEnabled(mdFetchBase.value, import.meta.env.DEV))
const urlMenuTitle = computed(() =>
  urlLoadEnabled.value ? '' : '生产环境需在 .env 中配置 VITE_MD_FETCH_BASE 后才可从 URL 载入',
)

function toggleLoadMenu() {
  loadMenuOpen.value = !loadMenuOpen.value
}

function closeLoadMenu() {
  loadMenuOpen.value = false
}

function pickLocalMd() {
  closeLoadMenu()
  loadErr.value = null
  fileInputRef.value?.click()
}

function openLoadUrlDialog() {
  closeLoadMenu()
  if (!urlLoadEnabled.value) return
  loadErr.value = null
  loadUrlDraft.value = ''
  loadUrlOpen.value = true
}

function closeLoadUrlDialog() {
  loadUrlOpen.value = false
  loadErr.value = null
}

function applyLoadedMarkdown(text: string) {
  source.value = text
  debouncedSource.value = text
}

function validateHttpUrl(raw: string): URL | null {
  const t = raw.trim()
  try {
    const u = new URL(t)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u
  } catch {
    return null
  }
}

async function fetchMarkdownFromProxy(target: string): Promise<string> {
  const reqUrl = buildMdFetchProxyUrl(mdFetchBase.value, target)
  const res = await fetch(reqUrl, { method: 'GET', credentials: 'same-origin' })
  const ct = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    try {
      if (ct.includes('application/json')) {
        const data = await res.json() as { error?: string }
        if (data?.error) throw new Error(data.error)
      }
    } catch {
      /* fall through */
    }
    throw new Error(`载入失败 (${res.status})`)
  }
  return await res.text()
}

async function confirmLoadUrl() {
  loadErr.value = null
  const u = validateHttpUrl(loadUrlDraft.value)
  if (!u) {
    loadErr.value = '请输入有效的 http 或 https 绝对 URL'
    return
  }
  try {
    const text = await fetchMarkdownFromProxy(u.href)
    applyLoadedMarkdown(text)
    closeLoadUrlDialog()
  } catch (e) {
    loadErr.value = e instanceof Error ? e.message : String(e)
  }
}

function onPickFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = typeof reader.result === 'string' ? reader.result : ''
    applyLoadedMarkdown(text)
    loadErr.value = null
  }
  reader.onerror = () => {
    loadErr.value = '读取本地文件失败'
  }
  reader.readAsText(file, 'utf-8')
}

function onGlobalPointerDown(ev: PointerEvent) {
  const t = ev.target as Node
  if (!loadMenuOpen.value) return
  const root = document.getElementById('load-md-menu-root')
  if (root && !root.contains(t)) closeLoadMenu()
}

function onGlobalKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Escape') return
  if (loadUrlOpen.value) closeLoadUrlDialog()
  else closeLoadMenu()
}

将 **全局监听器** 注册进 **文件内现有的** `onMounted(() => { ... })`（与 `void runMarkdownPipeline()` 同钩），在其回调 **末尾** 追加：

```typescript
  document.addEventListener('pointerdown', onGlobalPointerDown, true)
  document.addEventListener('keydown', onGlobalKeydown)
```

并新增 **`onBeforeUnmount`**（若尚无则添加；若已有则合并）：

```typescript
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onGlobalPointerDown, true)
  document.removeEventListener('keydown', onGlobalKeydown)
})
```

将文件顶部 `import { computed, nextTick, onMounted, ref, watch } from 'vue'` **改为** 同一路径加入 `onBeforeUnmount`（与上面 `import { onBeforeUnmount, onMounted }` **合并为一次** `vue` 导入，避免重复 import 行）。

- [ ] **Step 2: 模板——工具栏插入「加载 .md」与隐藏 file input**

在 `toolbar-actions` 内、**紧邻**「下载 .md」**之前**，将：

```vue
<button type="button" class="primary-btn" @click="exportMd">下载 .md</button>
```

替换为（保持其后「下载 HTML」「载入示例」不变）：

```vue
<div id="load-md-menu-root" class="load-md-wrap">
  <button
    type="button"
    class="ghost-btn"
    aria-haspopup="menu"
    :aria-expanded="loadMenuOpen"
    aria-controls="load-md-menu"
    @click="toggleLoadMenu"
  >
    加载 .md
  </button>
  <ul
    v-show="loadMenuOpen"
    id="load-md-menu"
    class="load-md-menu"
    role="menu"
    aria-label="加载 Markdown"
  >
    <li role="none">
      <button type="button" class="load-md-menu-item" role="menuitem" @click="pickLocalMd">
        从本地选择…
      </button>
    </li>
    <li role="none">
      <button
        type="button"
        class="load-md-menu-item"
        role="menuitem"
        :disabled="!urlLoadEnabled"
        :title="urlMenuTitle"
        @click="openLoadUrlDialog"
      >
        从 URL 载入…
      </button>
    </li>
  </ul>
  <input
    ref="fileInputRef"
    type="file"
    class="visually-hidden"
    accept=".md,.markdown,.txt,text/markdown,text/plain"
    aria-hidden="true"
    tabindex="-1"
    @change="onPickFile"
  />
</div>
<button type="button" class="primary-btn" @click="exportMd">下载 .md</button>
```

- [ ] **Step 3: 模板——URL 对话框（放在 `</main>` 之后、最外层 `</div>` 之前）**

```vue
    <Teleport to="body">
      <div
        v-if="loadUrlOpen"
        class="load-md-overlay"
        role="presentation"
        @click.self="closeLoadUrlDialog"
      >
        <div role="dialog" aria-modal="true" aria-labelledby="load-md-url-title" class="load-md-dialog">
          <h3 id="load-md-url-title" class="load-md-dialog-title">从 URL 载入 Markdown</h3>
          <label class="load-md-url-label">
            <span class="load-md-url-label-text">URL</span>
            <input v-model.trim="loadUrlDraft" type="url" class="load-md-url-input" autocomplete="off" />
          </label>
          <p v-if="loadErr" class="load-md-err" role="alert">{{ loadErr }}</p>
          <div class="load-md-dialog-actions">
            <button type="button" class="ghost-btn" @click="closeLoadUrlDialog">取消</button>
            <button type="button" class="primary-btn" @click="confirmLoadUrl">载入</button>
          </div>
        </div>
      </div>
    </Teleport>
```

- [ ] **Step 4: `style scoped` 增加样式**

在现有 scoped style **末尾**追加（与设计 token 对齐，可按站色微调）：

```css
.load-md-wrap {
  position: relative;
  display: inline-block;
}

.load-md-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  min-width: 11rem;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  z-index: 20;
}

.load-md-menu-item {
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.45rem 0.85rem;
  border: none;
  background: transparent;
  color: var(--text, #111);
  cursor: pointer;
}

.load-md-menu-item:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.08);
}

.load-md-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.load-md-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 18, 28, 0.45);
  display: grid;
  place-items: center;
  z-index: 50;
}

.load-md-dialog {
  width: min(520px, calc(100vw - 2rem));
  padding: 1rem 1.1rem;
  border-radius: 10px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
}

.load-md-dialog-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.load-md-url-label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.8125rem;
}

.load-md-url-label-text {
  color: var(--muted, #5c6578);
}

.load-md-url-input {
  font: inherit;
  font-size: 0.9rem;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--border, #e5e7eb);
}

.load-md-err {
  margin: 0.5rem 0 0;
  color: #b45309;
  font-size: 0.8125rem;
}

.load-md-dialog-actions {
  margin-top: 0.85rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
```

- [ ] **Step 5: URL 载入守卫与合并检查**

- **`confirmLoadUrl` 在非 dev 且无 `VITE_MD_FETCH_BASE` 时应不可达**：菜单项 `disabled`；仍需在 **`confirmLoadUrl` 顶部** 加守卫：`if (!urlLoadEnabled.value) return`，防止未来调用路径遗漏；
- **`credentials: 'same-origin'`** 在「生产基址为另一子域」时可能需改为 **`omit`** 或 **`include`**：若 `VITE_MD_FETCH_BASE` 与站点 **跨站**，cookie 不适用。首版规格为「部署等价接口」，若遇 CORS，由部署端加 `Access-Control-Allow-Origin`。计划 **保持 `fetch(reqUrl)` 无 CORS 模式特殊处理**；若静态站与 API 跨域，实现者在 PR 中改为带 mode 的方案并更新 README 一句。

- [ ] **Step 6: typecheck**

```bash
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: 手动冒烟（spec §7）**

1. `/markdown`：「加载 .md」展开/收起；点击外部关闭；ESC 关闭菜单与对话框。
2. 本地 `.md`/`.txt` 替换内容与预览刷新。
3. dev：`npm run dev`，菜单「从 URL 载入」——粘贴 **raw markdown 直链**（实现者自选可访问 URL），应成功；故意错误 URL 应对话框内错误。
4. `npm run build && npm run preview`：无 `VITE_MD_FETCH_BASE` 时「从 URL 载入」disabled + `title`；配置后再测（可选）。

- [ ] **Step 8: Commit**

```bash
git add src/views/MarkdownEditorView.vue
git commit -m "feat(markdown): load .md from file or URL via md-fetch"
```

---

## Plan self-review

| 规格章节 | 对应任务 |
|----------|----------|
| §4.1 工具栏顺序 | Task 4 Step 2 |
| §4.2 下拉 / ESC / 点击外部 | Task 4 Step 1–2 |
| §4.3 本地 accept / UTF-8 / 双 ref 更新 | Task 4 Step 1–2 |
| §4.4 URL 对话框与校验 | Task 4 |
| §5.2–5.4 路径、超时、2MiB、非 2xx、415 | Task 1–2 |
| §5.3 `VITE_MD_FETCH_BASE` | Task 3–4 |
| §6 a11y / ESC | Task 4 |
| §7 验收 | Task 2 Step 3、Task 4 Step 7 |

**Placeholder scan:** 无 TBD；Task 4 Step 5 明确笔误修正与跨域备注。

**Type consistency:** `MD_FETCH_PATH` 单一定义于 `mdFetchApi.ts`，中间件与前端共用；`buildMdFetchProxyUrl` 与规格 query 名 `url` 一致。

**Gap:** 规格 §4.3「本地单文件体积上限」列为可选——本计划 **未加** 本地 2MiB 限制；若需与远端一致，可在 `onPickFile` 增加 `file.size` 检查并复用错误文案（follow-up）。
