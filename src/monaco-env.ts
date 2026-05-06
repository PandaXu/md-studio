/**
 * Must load before any `monaco-editor` import so workers resolve as separate chunks.
 * Plaintext editing only needs the editor worker.
 */
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

self.MonacoEnvironment = {
  getWorker(): Worker {
    return new EditorWorker()
  },
}
