# MD Studio

一个基于 Vue 3 + Vite 的本地文档可视化工具，支持 **Markdown 文档编辑预览** 与 **Mermaid 图编辑渲染** 两种工作模式。顶栏导航可在 **Markdown**（`/markdown`）与 **Mermaid**（`/`）两页切换。

## 功能概览

- **Markdown 页**
  - Monaco 编辑器（`markdown` 模式）
  - GFM 表格/任务列表 + `DOMPurify` 消毒渲染
  - 正文浅色/深色阅读模式
  - 文中 ` ```mermaid ` 代码块分块渲染，支持源码折叠/展开
  - 导出 `.md` 与 `.html`（HTML 内联当前已渲染 SVG）
  - 默认示例：`src/samples/harness-era-article.md`

- **Mermaid 页**
  - Monaco 编辑器 + 防抖渲染
  - 主题切换：`default` / `dark` / `forest` / `enterprise`
  - 视图布局：左右并列 / 仅代码 / 仅预览
  - 导出 SVG
  - 渲染错误时保留上一次成功结果

- **通用能力**
  - 页面状态与主题配置持久化（`localStorage`）
  - 双页共享统一工具栏与面板风格

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
