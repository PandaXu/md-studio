# Mermaid 编辑与预览

Vue 3 + Vite 的本地工具：Monaco 编辑源码、防抖预览 Mermaid 图，预览主题可在 **`default` / `dark` / `forest` / `enterprise`** 间点击切换；其中 **`enterprise`** 为自定义「运维架构图」风格（浅灰底、浅蓝节点、黑线黑字、直角，见 `src/themes.ts`）。主题选择会写入 `localStorage`。

## 需求与规格

见 [docs/superpowers/specs/2026-05-06-mermaid-editor-design.md](docs/superpowers/specs/2026-05-06-mermaid-editor-design.md)。

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

- **Monaco**：使用 **`vite-plugin-monaco-editor`**（见 `vite.config.ts`），`languageWorkers` 仅保留 **`editorWorkerService`**，与 `plaintext` 编辑需求一致；插件在 `index.html` 中注入 `MonacoEnvironment.getWorkerUrl`。
- **Mermaid**：`mermaid.initialize` 随主题更新；`parse` + `render`；渲染失败时保留上一次成功 SVG，并在预览区上方显示错误信息。

## 浏览器

目标为当前主流的桌面浏览器（Chrome / Edge / Firefox / Safari）最新两个大版本；未在 CI 中做矩阵测试。
