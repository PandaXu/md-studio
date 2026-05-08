# TUI Editor 优化 Markdown 编辑设计

## 背景与目标
- 当前 `MarkdownEditorView` 使用 `monaco-editor` 作为主编辑器，预览链路为 `markdown-it + sanitize + mermaid`。
- 本次目标是显著提升编辑体验，默认以 WYSIWYG 方式编辑 Markdown。
- 需要保证现有关键能力不退化：Mermaid 渲染与主题、加载与导出能力、布局切换能力。
- 期望一次到位达到可稳定日用的完成度，而不是仅做最小 PoC。

## 范围
### In Scope
- 在 Markdown 页面主编辑区引入 `tui.editor`，默认 WYSIWYG 模式。
- 提供 WYSIWYG / Markdown 编辑模式切换。
- 保留并复用现有预览渲染管线与导出逻辑。
- 保留加载本地/URL、下载 `.md/.html`、布局切换、主题切换、持久化能力。

### Out of Scope
- 本轮不做 `tui.editor` 深度插件体系扩展（仅保留必要配置）。
- 本轮不实现“预览双击直接驱动 `tui` 光标到精确节点级定位”。

## 方案结论
采用“双引擎共存”方案：
- 编辑引擎：`tui.editor`（主编辑体验，默认 WYSIWYG）。
- 渲染引擎：沿用现有 `renderMarkdownToHtml` + `sanitizeMarkdownHtml` + `renderMermaidBlocksIn`。
- 页面编排层：继续由 `MarkdownEditorView` 统一调度状态与工具栏交互。

此方案的核心价值是：最大化编辑体验升级，同时最小化对既有预览、导出、Mermaid 能力的扰动。

## 架构设计
### 1) 组件边界
- `MarkdownEditorView`：保持为页面编排与状态容器，不直接承担编辑器细节。
- 新增 `TuiEditor` 组件：封装 `tui.editor` 生命周期、模式切换、`v-model` 双向绑定。
- `FloatingSourceEditor`：首版保留，作为源码应急编辑与预览行号定位承接组件。

### 2) 状态与存储
- `source` 继续作为单一事实源（Markdown 字符串）。
- 现有 localStorage 键（内容、布局、阅读主题、图表主题）保持不变，保证迁移无感。
- 新增编辑模式偏好键（如 `markdown-editor-edit-mode`）用于记忆 WYSIWYG/Markdown 选择。

### 3) 渲染链路
- `source` 变化后，继续进入当前去抖与顺序号保护流程。
- 预览 HTML 生成与 Mermaid 渲染策略保持一致，确保视觉和导出结果一致性。

## 关键交互设计
### 默认行为
- 进入页面默认使用 WYSIWYG 模式。
- 工具栏提供“WYSIWYG / Markdown”一键切换，切换后立即生效并持久化。

### 布局行为
- `split`：左侧编辑区（TUI），右侧预览区。
- `code`：仅展示编辑区（TUI）。
- `preview`：仅展示预览区。

### 载入/导出行为
- 从本地或 URL 加载时，统一更新 `source`，并同步刷新 TUI 编辑区内容。
- 下载 `.md` 始终以 `source` 为准。
- 下载 `.html` 继续基于当前预览 DOM 克隆导出，保持 Mermaid 行为一致。

### 预览双击定位
- 首版不改变现有定位通路：双击预览仍打开 `FloatingSourceEditor` 并跳转行号。
- 后续迭代可评估将定位能力迁移到 `tui.editor` 主实例。

## 错误处理与回退策略
- `tui.editor` 初始化失败：
  - 页面展示可读错误提示；
  - 提供回退入口（启用 `FloatingSourceEditor` 进行源码编辑），避免编辑中断。
- Markdown 渲染、sanitize、Mermaid 错误：
  - 延续当前 `topError` 与图表块局部错误提示机制。
- 异步竞态：
  - 延续当前 pipeline 序号校验，避免旧渲染结果覆盖新输入。

## 验收标准（Definition of Done）
- 默认进入 WYSIWYG，且可在 WYSIWYG/Markdown 之间切换。
- Mermaid 渲染与主题切换不退化。
- 加载本地/URL、下载 `.md/.html`、布局切换全部可用且行为与预期一致。
- 页面刷新后可恢复上次内容与主要偏好。
- Typecheck 通过；手工验证关键路径无阻塞性问题。

## 测试策略
### 手工回归清单
- 输入与编辑：WYSIWYG 连续输入、撤销重做、模式切换后内容一致。
- 预览一致性：列表、表格、任务列表、代码块、Mermaid 均正常渲染。
- 工具栏能力：阅读主题、图表主题、布局切换均正常。
- 数据流：本地文件与 URL 载入后，编辑区与预览区同步更新。
- 导出：`.md` 与 `.html` 可下载且内容可读，Mermaid 在导出文件中可视化保真。

### 技术验证
- `npm run typecheck` 必须通过。
- 如存在 UI 自动化基础，可补充最小 smoke 用例（非本轮强制）。

## 实施风险与缓解
- 风险：`tui.editor` 与现有数据流同步出现延迟或回写抖动。
  - 缓解：统一 `source` 单一事实源，不在多处直接维护副本。
- 风险：WYSIWYG 与 Markdown 模式切换时格式细节变化。
  - 缓解：围绕表格、任务列表、代码块建立手工回归样例。
- 风险：现有定位体验回退。
  - 缓解：首版保留 `FloatingSourceEditor` 路径，不强行替换定位逻辑。

## 分阶段落地（单轮内完成）
1. 接入依赖与新增 `TuiEditor` 组件（含 `v-model`、模式切换）。
2. 替换 `MarkdownEditorView` 主编辑区并接入持久化模式。
3. 串联现有渲染、导入、导出、布局、主题逻辑并完成回归。
4. 进行 typecheck 与关键路径手测，修复阻断问题。
