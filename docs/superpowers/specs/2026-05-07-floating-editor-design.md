# 预览区双击弹窗编辑 — 需求与设计规格

| 项目 | 内容 |
|------|------|
| 文档类型 | 需求说明 + 设计规格 |
| 状态 | **已定稿**（与对话确认一致，待实现计划与编码） |
| 关联仓库 | `md-studio`（Vue 3 + Vite） |
| 关联规格 | [2026-05-06-markdown-editor-design.md](./2026-05-06-markdown-editor-design.md)、[2026-05-06-mermaid-editor-design.md](./2026-05-06-mermaid-editor-design.md) |

---

## 1. 背景与目标

### 1.1 背景

`MarkdownEditorView.vue` 和 `MermaidEditorView.vue` 都支持三种布局模式：split（左右并列）、code（仅源码）、preview（仅预览）。在 preview 模式下编辑器不可见，用户若想修改源码需要切回 split 或 code 模式。即使在其他模式下，用户的目光也可能停留在预览区，需要一种快捷方式在不离开预览区的情况下编辑源码。

### 1.2 产品目标

- 在 **预览区** 任意位置 **双击鼠标**，弹出一个居中浮动编辑框，内含 Monaco 编辑器。
- 编辑框内修改 **实时同步** 到视图的 `source` ref，预览即时更新。
- **所有布局模式** 均响应双击（只要预览区可见）。
- Markdown 和 Mermaid 两个视图 **同时** 获得该能力。

### 1.3 非目标（首版）

- 双击弹窗内不支持 markdown/mermaid 特定的代码片段插入或工具栏。
- 不改变现有 SourceEditor 组件或预览渲染管线。

### 1.4 成功标准

- 双击预览区能弹出浮动编辑框，含 Monaco 编辑器，语法高亮正确。
- 编辑框内修改实时反映到预览区。
- 关弹窗（X 按钮 / 蒙层 / Esc）后源码已保存（通过 v-model 同步）。
- Markdown 和 Mermaid 页面均正常工作。

---

## 2. 已确认的决策摘要

| 主题 | 决策 |
|------|------|
| 生效范围 | **所有布局模式**（只要预览区可见） |
| 编辑器类型 | **Monaco**（与现有 SourceEditor 一致） |
| 数据同步 | **实时 v-model**（无确认/取消步骤，关闭即保存） |
| 实现方式 | **共享组件** `FloatingSourceEditor.vue` |

---

## 3. 组件架构

### 3.1 新增文件

```
src/components/FloatingSourceEditor.vue
```

### 3.2 Props

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `modelValue` | `string` | 必填 | 绑定的源码内容 |
| `language` | `string` | `'plaintext'` | Monaco 语法高亮语言 |
| `title` | `string` | `'源码编辑'` | 弹窗标题 |

### 3.3 Emits

| Emit | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `value: string` | 实时同步编辑内容 |

### 3.4 暴露方法 (defineExpose)

| 方法 | 说明 |
|------|------|
| `open()` | 打开弹窗 |
| `close()` | 关闭弹窗 |
| `toggle()` | 切换弹窗可见状态 |

### 3.5 模板结构

- `<Teleport to="body">`
- 背景蒙层（`@click.self="close"`）
- 居中对话框：`80vw` 宽 × `75vh` 高，带 `max-width`/`max-height` 限制
  - 标题栏：`<h3>` 显示 `title` prop + 关闭按钮 (X)
  - 编辑器主体：Monaco 实例，`height: 100%`

### 3.6 与 SourceEditor.vue 的关系

`FloatingSourceEditor` 独立封装 Monaco（不依赖 `SourceEditor.vue`），因为：
- 弹窗内需要 `height: 100%` 的填充模式，不同于 SourceEditor 的 `min-height: 200px`
- 弹窗关闭时需要 dispose Monaco 实例

Monaco 配置与 `SourceEditor.vue` 保持一致：`automaticLayout: true`、`minimap: false`、`fontSize: 14`、`wordWrap: 'on'`、`scrollBeyondLastLine: false`。

---

## 4. 交互与数据流

### 4.1 触发路径

```
预览区 doubleclick → floatingEditorRef.open() → Monaco 编辑 → v-model 实时同步 source → 预览重建
```

### 4.2 两个视图的改动

**MarkdownEditorView.vue:**

- 在 `previewHost` 的祖先容器（`.preview-pane` 或直接包裹 `previewHost` 的 div）上添加 `@dblclick="openFloatingEditor"`
- 添加 `FloatingSourceEditor` 组件，`v-model="source"`，`language="markdown"`
- 处理函数调用 `floatingEditorRef.value?.open()`

**MermaidEditorView.vue:**

- 同上，`language` 为默认 `'plaintext'`

### 4.3 关闭行为

- 点击关闭按钮 (X)
- 点击背景蒙层
- 按 `Esc` 键
- 关闭后内容已通过 v-model 实时同步，无需确认

### 4.4 两个 Monaco 实例共存

split/code 模式下弹窗打开时，页面中 `SourceEditor` 和弹窗中的 Monaco 通过同一个 `source` ref 实现 v-model 双向同步。两个编辑器各自持有独立 Monaco 实例，编辑任一编辑器都会通过 source → v-model 更新对方。

### 4.5 渲染竞态保护

弹窗编辑触发 debounce（320ms）后走现有渲染管线。Markdown 视图由 `pipelineSeq` 保护竞态，Mermaid 视图由 `renderSeq` 保护。无需额外保护。

---

## 5. 边界情况

1. **移动端**：使用 `vw`/`vh` 单位 + `max-width`/`max-height` 确保不超出屏幕。
2. **预览区空白双击**：即使 `previewHost` 内无内容，双击也正常弹出编辑框。
3. **Mermaid SVG / details 上的双击**：事件冒泡到预览容器后正常触发弹窗，无需过滤。
4. **弹窗 z-index**：设为 50（与现有 URL 载入对话框 `load-md-overlay` 相同层级或稍高）。

---

## 6. 测试与验收清单

- Markdown 页：split/code/preview 三种布局下，双击预览区均弹出编辑框
- Mermaid 页：同上
- 编辑框内修改后预览实时更新
- X 按钮、蒙层点击、Esc 键均能关闭弹窗
- 弹窗关闭后内容已保存（source 保持最新值）
- 移动端视口下弹窗不溢出屏幕
