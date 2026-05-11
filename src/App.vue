<script setup lang="ts">
import '@/composables/useAppReading'
import AppShell from '@/layouts/AppShell.vue'
</script>

<template>
  <AppShell />
</template>

<style>
:root {
  /* Notion-style — light */
  --bg: #ffffff;
  --surface: #fbfbfa;
  --border: rgba(0, 0, 0, 0.08);
  --text: #37352f;
  --muted: #9b9a97;
  --accent: #2383e2;
  --accent-soft: rgba(35, 131, 226, 0.08);
  --accent-dim: #1a6bc0;
  --shadow-sm: none;
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.08);
  --error-bg: #fef2f2;
  --error-border: rgba(239, 68, 68, 0.2);
  --error-text: #e5484d;

  --doc-panel-bg: #fbfbfa;
  --doc-panel-surface: #ffffff;
  --doc-panel-text: #37352f;
  --doc-panel-muted: #9b9a97;
  --doc-panel-border: rgba(0, 0, 0, 0.06);
  --doc-panel-hover: rgba(0, 0, 0, 0.04);
  --doc-panel-active-bg: rgba(0, 0, 0, 0.04);
  --doc-panel-active-bar: #37352f;
  --doc-toolbar-icon-bg: #ffffff;
  --doc-toolbar-icon-border: rgba(0, 0, 0, 0.08);
  --doc-toolbar-icon-color: #555555;
  --doc-toolbar-icon-primary-start: #37352f;
  --doc-toolbar-icon-primary-end: #37352f;
  --doc-panel-no-folder-label: #9b9a97;
}

[data-reading='dark'] {
  --bg: #191919;
  --surface: #202020;
  --border: rgba(255, 255, 255, 0.06);
  --text: #e6e6e6;
  --muted: #9b9b9b;
  --accent: #529cca;
  --accent-soft: rgba(82, 156, 202, 0.1);
  --accent-dim: #3d7ea8;
  --shadow-sm: none;
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.4);
  --error-bg: rgba(220, 38, 38, 0.15);
  --error-border: rgba(239, 68, 68, 0.25);
  --error-text: #f87171;

  --doc-panel-bg: #191919;
  --doc-panel-surface: #202020;
  --doc-panel-text: #e6e6e6;
  --doc-panel-muted: #9b9b9b;
  --doc-panel-border: rgba(255, 255, 255, 0.05);
  --doc-panel-hover: rgba(255, 255, 255, 0.04);
  --doc-panel-active-bg: rgba(255, 255, 255, 0.04);
  --doc-panel-active-bar: #e6e6e6;
  --doc-toolbar-icon-bg: #202020;
  --doc-toolbar-icon-border: rgba(255, 255, 255, 0.08);
  --doc-toolbar-icon-color: #999999;
  --doc-toolbar-icon-primary-start: #e6e6e6;
  --doc-toolbar-icon-primary-end: #e6e6e6;
  --doc-panel-no-folder-label: #9b9b9b;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    -apple-system,
    'SF Pro Display',
    'SF Pro Text',
    'Helvetica Neue',
    system-ui,
    sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
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

button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
