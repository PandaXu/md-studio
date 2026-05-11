'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder() {
    return ipcRenderer.invoke('dialog:select-folder')
  },
  scanFolder(folderPath) {
    return ipcRenderer.invoke('fs:scan-folder', folderPath)
  },
  readFile(filePath) {
    return ipcRenderer.invoke('fs:read-file', filePath)
  },
  writeFile(filePath, content) {
    return ipcRenderer.invoke('fs:write-file', filePath, content)
  },
  createFile(parentPath, name) {
    return ipcRenderer.invoke('fs:create-file', parentPath, name)
  },
  createFolder(parentPath, name) {
    return ipcRenderer.invoke('fs:create-folder', parentPath, name)
  },
  deleteFile(filePath) {
    return ipcRenderer.invoke('fs:delete-file', filePath)
  },
  deleteFolder(folderPath) {
    return ipcRenderer.invoke('fs:delete-folder', folderPath)
  },
  rename(oldPath, newPath) {
    return ipcRenderer.invoke('fs:rename', oldPath, newPath)
  },
  onFileChanged(callback) {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('fs:file-changed', handler)
    return () => ipcRenderer.removeListener('fs:file-changed', handler)
  },
})
