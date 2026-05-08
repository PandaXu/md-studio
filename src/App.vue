<script setup lang="ts">
import '@/composables/useAppReading'
import AppShell from '@/layouts/AppShell.vue'
</script>

<template>
  <AppShell />
</template>

<style>
:root {
  --bg: #f4f5f7;
  --surface: #fff;
  --border: #d8dce3;
  --text: #1a1d24;
  --muted: #5c6578;
  --accent: #2563eb;
  --error-bg: #fef2f2;
  --error-border: #fecaca;
  --error-text: #991b1b;

  /* Doc panel — light */
  --doc-panel-bg: #fafbfc;
  --doc-panel-surface: #ffffff;
  --doc-panel-text: #1f2937;
  --doc-panel-muted: #6b7280;
  --doc-panel-border: rgba(15, 23, 42, 0.06);
  --doc-panel-hover: rgba(15, 23, 42, 0.04);
  --doc-panel-active-bg: rgba(99, 102, 241, 0.08);
  --doc-panel-active-bar: #4f46e5;

  /* Library toolbar icon buttons (32×32) */
  --doc-toolbar-icon-bg: rgba(0, 0, 0, 0.03);
  --doc-toolbar-icon-border: rgb(213, 212, 226);
  --doc-toolbar-icon-color: rgb(85, 82, 122);
  /* 新建文档主按钮：灰黑偏黑 */
  --doc-toolbar-icon-primary-start: #3a3a42;
  --doc-toolbar-icon-primary-end: #232326;
  /* 文档库「No Folder」等分隔标签 */
  --doc-panel-no-folder-label: #2a2a30;
}

[data-reading='dark'] {
  /* 与 Markdown 深色正文一致，扩展到整站壳层 */
  --bg: #0f1419;
  --surface: #161b22;
  --border: rgba(255, 255, 255, 0.1);
  --text: #e5e7eb;
  --muted: #9ca3af;
  --accent: #60a5fa;
  --error-bg: rgba(127, 29, 29, 0.25);
  --error-border: rgba(248, 113, 113, 0.35);
  --error-text: #fecaca;

  --doc-panel-bg: #0f1419;
  --doc-panel-surface: #161b22;
  --doc-panel-text: #e5e7eb;
  --doc-panel-muted: #9ca3af;
  --doc-panel-border: rgba(255, 255, 255, 0.08);
  --doc-panel-hover: rgba(255, 255, 255, 0.04);
  --doc-toolbar-icon-bg: rgba(255, 255, 255, 0.06);
  --doc-toolbar-icon-border: rgba(255, 255, 255, 0.14);
  --doc-toolbar-icon-color: #c4c2e0;
  --doc-toolbar-icon-primary-start: #4a4c54;
  --doc-toolbar-icon-primary-end: #303238;
  --doc-panel-no-folder-label: #9b9daa;
  --doc-panel-active-bg: rgba(129, 140, 248, 0.16);
  --doc-panel-active-bar: #818cf8;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif;
  background: var(--bg);
  color: var(--text);
}

#app {
  min-height: 100vh;
}

button,
input,
select,
.doc-panel-item {
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}
</style>
