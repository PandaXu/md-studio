<script setup lang="ts">
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
