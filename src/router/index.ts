import { createRouter, createWebHistory } from 'vue-router'
import MermaidEditorView from '@/views/MermaidEditorView.vue'
import MarkdownEditorView from '@/views/MarkdownEditorView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'mermaid', component: MermaidEditorView },
    { path: '/markdown', name: 'markdown', component: MarkdownEditorView },
  ],
})
