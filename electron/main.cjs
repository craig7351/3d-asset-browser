const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron')
const path = require('node:path')
const { scanLibrary } = require('./scanner.cjs')
const { startFileServer } = require('./server.cjs')
const store = require('./store.cjs')
const config = require('./config.cjs')

const isDev = !!process.env.ELECTRON_DEV
let filePort = 0
let win = null

async function createWindow() {
  filePort = await startFileServer()

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1a1a1e',
    title: '3D Asset Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // 視窗失焦時不要節流，動畫才能持續流暢播放
      backgroundThrottling: false
    }
  })

  win.removeMenu()

  // 把 renderer 的 console 轉發到終端機，方便除錯
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    const tag = ['LOG', 'WARN', 'ERR'][level] || 'LOG'
    console.log(`[renderer:${tag}] ${message}` + (level >= 2 ? ` (${source}:${line})` : ''))
  })

  if (isDev) {
    await win.loadURL('http://localhost:5173')
    // 需要除錯時按 F12 開啟 DevTools（不自動開，避免擋畫面）
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.key === 'F12') win.webContents.toggleDevTools()
    })
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// ---- IPC ----
ipcMain.handle('app:config', () => ({
  libraryRoot: config.getLibraryRoot(),
  filePort
}))

ipcMain.handle('library:scan', () => scanLibrary(config.getLibraryRoot()))

ipcMain.handle('library:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  if (r.canceled || !r.filePaths[0]) return null
  config.saveSettings({ libraryRoot: r.filePaths[0] })
  return config.getLibraryRoot()
})

ipcMain.handle('data:get', () => store.getData())
ipcMain.handle('data:favorite', (_e, id, value) => store.setFavorite(id, value))
ipcMain.handle('data:tags', (_e, id, tags) => store.setTags(id, tags))
ipcMain.handle('thumb:get', (_e, absPath) => store.getThumb(absPath))
ipcMain.handle('thumb:count', (_e, absPaths) => store.countThumbs(absPaths))
ipcMain.handle('thumb:save', (_e, absPath, dataUrl) => store.saveThumb(absPath, dataUrl))
ipcMain.handle('thumb:clear', () => store.clearThumbs(config.getLibraryRoot()))

ipcMain.handle('shell:copy', (_e, text) => { clipboard.writeText(text); return true })
ipcMain.handle('shell:open', async (_e, p) => { const r = await shell.openPath(p); return r || true })
ipcMain.handle('shell:reveal', (_e, p) => { shell.showItemInFolder(p); return true })

// 將檔案移到資源回收桶（可復原，不是永久刪除）
ipcMain.handle('shell:trash', async (_e, paths) => {
  let ok = 0
  const failed = []
  for (const p of paths) {
    try { await shell.trashItem(p); ok++ }
    catch (err) { failed.push({ path: p, error: String(err && err.message || err) }) }
  }
  return { ok, failed }
})

// 刪除前的原生確認對話框（字串由 renderer 傳入，支援多語）
ipcMain.handle('dialog:confirmDelete', async (_e, { title, message, detail, cancelBtn, confirmBtn }) => {
  const r = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: [cancelBtn, confirmBtn],
    defaultId: 0,
    cancelId: 0,
    title,
    message,
    detail,
  })
  return r.response === 1
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
