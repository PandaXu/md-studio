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
</style>
