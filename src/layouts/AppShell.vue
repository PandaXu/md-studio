<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <RouterView />
  </div>
</template>

<style scoped>
.app-shell {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0.75rem clamp(0.75rem, 2vw, 1.5rem) 2rem;
}
</style>
