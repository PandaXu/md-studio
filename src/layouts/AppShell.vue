<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <nav class="app-nav" aria-label="站内导航">
      <RouterLink to="/" class="nav-link" active-class="nav-link-active">Mermaid</RouterLink>
      <RouterLink to="/markdown" class="nav-link" active-class="nav-link-active">Markdown</RouterLink>
    </nav>
    <RouterView />
  </div>
</template>

<style scoped>
.app-shell {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem 1.25rem 2rem;
}

.app-nav {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}

.nav-link {
  font: inherit;
  font-size: 0.8125rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  border: 1px solid var(--border, #d8dce3);
  background: var(--bg, #f4f5f7);
  color: var(--text, #1a1d24);
  text-decoration: none;
}

.nav-link:hover {
  border-color: var(--accent, #2563eb);
  color: var(--accent, #2563eb);
}

.nav-link-active {
  background: var(--accent, #2563eb);
  border-color: var(--accent, #2563eb);
  color: #fff;
}
</style>
