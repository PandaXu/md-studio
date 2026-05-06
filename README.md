# Mermaid 编辑与预览

Vue 3 + Vite 的本地工具：顶栏 **站内导航** 可在 **Markdown**（`/markdown`）与 **Mermaid**（`/`）两页间切换。

**Mermaid 页**：Monaco 编辑源码、防抖预览 Mermaid 图，预览主题可在 **`default` / `dark` / `forest` / `enterprise`** 间点击切换；其中 **`enterprise`** 为自定义「运维架构图」风格（浅灰底、浅蓝节点、黑线黑字、直角，见 `src/themes.ts`）。主题选择会写入 `localStorage`。

顶栏提供 **视图布局** 下拉：**左右并列**、**仅代码**、**仅预览图**（写入 `localStorage`）；**导出 SVG** 会下载当前预览中的矢量图（无可用图时会提示）。

首次进入与「载入示例」使用内置的 **范式演进 / Harness / 大模型内化趋势** 示例流程图（`src/views/MermaidEditorView.vue` 中 `DEFAULT_SAMPLE`）。

**Markdown 页**：GFM 表格与任务列表、`markdown-it` 渲染 + `DOMPurify` 消毒预览；正文 **浅色 / 深色** 阅读模式；文中的 **` ```mermaid `** 块单独渲染为图（图表主题与 Mermaid 页同一套预设，持久化 key 独立）。**下载 .md** / **下载 HTML**（内联当前预览中的 SVG）。首次进入与「载入示例」使用 `src/samples/harness-era-article.md`（Harness 时代文章总结与演进图）。

## 需求与规格

- Mermaid：[docs/superpowers/specs/2026-05-06-mermaid-editor-design.md](docs/superpowers/specs/2026-05-06-mermaid-editor-design.md)
- Markdown：[docs/superpowers/specs/2026-05-06-markdown-editor-design.md](docs/superpowers/specs/2026-05-06-markdown-editor-design.md)

## 本地运行

需要 **Node.js 20+**（建议 LTS）。

```bash
npm install
npm run dev
```

浏览器打开终端里提示的本地地址即可。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建（非首版验收项，但可用于检查打包） |
| `npm run typecheck` | `vue-tsc` 类型检查 |

## 技术说明

- **Monaco**：使用 **`vite-plugin-monaco-editor`**（见 `vite.config.ts`），`languageWorkers` 含 **`editorWorkerService`**；Markdown 页使用 `language="markdown"` 时构建会按需带上 Markdown 相关 worker chunk。插件在 `index.html` 中注入 `MonacoEnvironment.getWorkerUrl`。
- **Mermaid**：`mermaid.initialize` 随主题更新；`parse` + `render`；Mermaid **单页**渲染失败时保留上一次成功 SVG，并在预览区上方显示错误信息。Markdown 预览中的 **分块** Mermaid 失败仅影响该块。

## 浏览器

目标为当前主流的桌面浏览器（Chrome / Edge / Firefox / Safari）最新两个大版本；未在 CI 中做矩阵测试。
