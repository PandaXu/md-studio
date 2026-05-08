import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import MermaidEditorView from '@/views/MermaidEditorView.vue'
import MarkdownEditorView from '@/views/MarkdownEditorView.vue'

/** Electron 打包后通过 file:// 打开，History API 无服务器路径不可用，改用 hash 路由 */
function createAppHistory() {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return createWebHashHistory()
  }
  return createWebHistory(import.meta.env.BASE_URL)
}

export const router = createRouter({
  history: createAppHistory(),
  routes: [
    { path: '/', redirect: '/markdown' },
    { path: '/mermaid', name: 'mermaid', component: MermaidEditorView },
    { path: '/markdown', name: 'markdown', component: MarkdownEditorView },
  ],
})
