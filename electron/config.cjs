const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { app } = require('electron')

// 預設素材庫根目錄；可被 userData/settings.json 覆寫
const DEFAULT_LIBRARY_ROOT = process.platform === 'win32'
  ? 'F:\\0_CODE\\素材庫'
  : path.join(os.homedir(), 'Documents', '3D-Assets')

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
  } catch {
    return {}
  }
}

function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

function getLibraryRoot() {
  return loadSettings().libraryRoot || DEFAULT_LIBRARY_ROOT
}

// 可被視為「模型格式」的副檔名
const MODEL_EXTS = ['.glb', '.gltf', '.fbx', '.obj', '.blend']
// 可在瀏覽器中渲染的格式（依優先序）
const VIEWABLE_PRIORITY = ['.glb', '.gltf', '.fbx', '.obj']
// 純格式分類資料夾名（合併同名模型時用來往上找邏輯目錄）
const FORMAT_DIR_NAMES = new Set(['glb', 'gltf', 'fbx', 'obj', 'blend', 'blends'])

module.exports = {
  DEFAULT_LIBRARY_ROOT,
  getLibraryRoot,
  loadSettings,
  saveSettings,
  MODEL_EXTS,
  VIEWABLE_PRIORITY,
  FORMAT_DIR_NAMES
}
