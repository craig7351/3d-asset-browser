const { contextBridge, ipcRenderer } = require('electron')

// 安全地把主行程能力暴露給 renderer
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('app:config'),
  scan: () => ipcRenderer.invoke('library:scan'),
  pickLibrary: () => ipcRenderer.invoke('library:pick'),
  getData: () => ipcRenderer.invoke('data:get'),
  setFavorite: (id, value) => ipcRenderer.invoke('data:favorite', id, value),
  setTags: (id, tags) => ipcRenderer.invoke('data:tags', id, tags),
  getThumb: (absPath) => ipcRenderer.invoke('thumb:get', absPath),
  countThumbs: (absPaths) => ipcRenderer.invoke('thumb:count', absPaths),
  saveThumb: (absPath, dataUrl) => ipcRenderer.invoke('thumb:save', absPath, dataUrl),
  clearThumbs: () => ipcRenderer.invoke('thumb:clear'),
  copyPath: (text) => ipcRenderer.invoke('shell:copy', text),
  openPath: (absPath) => ipcRenderer.invoke('shell:open', absPath),
  showInFolder: (absPath) => ipcRenderer.invoke('shell:reveal', absPath),
  trashFiles: (paths) => ipcRenderer.invoke('shell:trash', paths),
  confirmDelete: (opts) => ipcRenderer.invoke('dialog:confirmDelete', opts)
})
