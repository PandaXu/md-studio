'use strict'

const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = process.env.ELECTRON_DEV === '1'

// --- 文件扫描 ---

const EXCLUDED_DIRS = new Set(['node_modules', '.git'])

function isHidden(name) {
  return name.startsWith('.')
}

let workspaceRoot = ''

function scanDir(dirPath) {
  const result = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  // 目录在前，文件在后，各自按名称排序
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  for (const entry of entries) {
    if (isHidden(entry.name)) continue
    const full = path.join(dirPath, entry.name)
    const rel = path.relative(workspaceRoot, full)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      const children = scanDir(full)
      result.push({ name: entry.name, path: rel, kind: 'dir', children })
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      result.push({ name: entry.name, path: rel, kind: 'file' })
    }
  }
  return result
}

// --- IPC Handlers ---

function registerIpcHandlers() {
  ipcMain.handle('dialog:select-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '选择工作区文件夹',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    workspaceRoot = result.filePaths[0]
    return workspaceRoot
  })

  ipcMain.handle('fs:scan-folder', (_event, folderPath) => {
    workspaceRoot = folderPath
    return scanDir(folderPath)
  })

  ipcMain.handle('fs:read-file', (_event, filePath) => {
    const full = path.join(workspaceRoot, filePath)
    return fs.readFileSync(full, 'utf-8')
  })

  ipcMain.handle('fs:write-file', (_event, filePath, content) => {
    const full = path.join(workspaceRoot, filePath)
    const dir = path.dirname(full)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(full, content, 'utf-8')
  })

  ipcMain.handle('fs:create-file', (_event, parentPath, name) => {
    const dir = parentPath ? path.join(workspaceRoot, parentPath) : workspaceRoot
    const fname = name.endsWith('.md') ? name : `${name}.md`
    const full = path.join(dir, fname)
    if (fs.existsSync(full)) throw new Error(`文件已存在: ${fname}`)
    fs.writeFileSync(full, '', 'utf-8')
    return path.relative(workspaceRoot, full)
  })

  ipcMain.handle('fs:create-folder', (_event, parentPath, name) => {
    const dir = parentPath ? path.join(workspaceRoot, parentPath) : workspaceRoot
    const full = path.join(dir, name)
    if (fs.existsSync(full)) throw new Error(`文件夹已存在: ${name}`)
    fs.mkdirSync(full, { recursive: true })
    return path.relative(workspaceRoot, full)
  })

  ipcMain.handle('fs:delete-file', (_event, filePath) => {
    const full = path.join(workspaceRoot, filePath)
    if (!fs.existsSync(full)) throw new Error(`文件不存在: ${filePath}`)
    fs.unlinkSync(full)
  })

  ipcMain.handle('fs:delete-folder', (_event, folderPath) => {
    const full = path.join(workspaceRoot, folderPath)
    if (!fs.existsSync(full)) throw new Error(`文件夹不存在: ${folderPath}`)
    fs.rmSync(full, { recursive: true, force: true })
  })

  ipcMain.handle('fs:rename', (_event, oldPath, newPath) => {
    const fullOld = path.join(workspaceRoot, oldPath)
    const fullNew = path.join(workspaceRoot, newPath)
    if (!fs.existsSync(fullOld)) throw new Error(`路径不存在: ${oldPath}`)
    if (fs.existsSync(fullNew)) throw new Error(`目标已存在: ${newPath}`)
    const newDir = path.dirname(fullNew)
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true })
    fs.renameSync(fullOld, fullNew)
  })
}

// --- 窗口创建 ---

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'MD Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  if (isDev) {
    void win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    void win.loadFile(indexPath)
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
