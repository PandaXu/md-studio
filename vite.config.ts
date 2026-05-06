import { createRequire } from 'node:module'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Package is CJS; default export lives on `.default` when loaded from ESM config.
const require = createRequire(import.meta.url)
const monacoEditorPlugin = require('vite-plugin-monaco-editor').default as (
  opts?: import('vite-plugin-monaco-editor').IMonacoEditorOpts,
) => import('vite').Plugin

export default defineConfig({
  plugins: [
    vue(),
    monacoEditorPlugin({
      // Plaintext editing: only the base editor worker (see spec FR-ED-05).
      languageWorkers: ['editorWorkerService'],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
