const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { app } = require('electron')

// 使用者資料（最愛、標記）與縮圖快取都放在 userData，不污染素材庫原檔
function dataFile() {
  return path.join(app.getPath('userData'), 'library-data.json')
}
function thumbsDir() {
  const d = path.join(app.getPath('userData'), 'thumbs')
  fs.mkdirSync(d, { recursive: true })
  return d
}

let _cache = null  // in-memory cache，避免每次 IPC 都讀磁碟

function load() {
  if (_cache !== null) return _cache
  try {
    _cache = JSON.parse(fs.readFileSync(dataFile(), 'utf8'))
  } catch {
    _cache = { favorites: {}, tags: {} }
  }
  return _cache
}
function save(data) {
  _cache = data
  fs.mkdirSync(path.dirname(dataFile()), { recursive: true })
  fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2), 'utf8')
}

function getData() {
  const d = load()
  return { favorites: d.favorites || {}, tags: d.tags || {} }
}

function setFavorite(id, value) {
  const d = load()
  d.favorites = d.favorites || {}
  if (value) d.favorites[id] = true
  else delete d.favorites[id]
  save(d)
  return d.favorites
}

function setTags(id, tags) {
  const d = load()
  d.tags = d.tags || {}
  if (Array.isArray(tags) && tags.length) d.tags[id] = tags
  else delete d.tags[id]
  save(d)
  return d.tags
}

// 縮圖快取：key = hash(絕對路徑 + mtime)，避免檔案更新後沿用舊圖
function thumbKey(absPath) {
  let mtime = 0
  try { mtime = fs.statSync(absPath).mtimeMs } catch {}
  return crypto.createHash('md5').update(absPath + '|' + mtime).digest('hex')
}
function thumbPath(key) {
  return path.join(thumbsDir(), key + '.png')
}
function getThumb(absPath) {
  const p = thumbPath(thumbKey(absPath))
  try {
    const buf = fs.readFileSync(p)
    return 'data:image/png;base64,' + buf.toString('base64')
  } catch {
    return null
  }
}
function saveThumb(absPath, dataUrl) {
  const key = thumbKey(absPath)
  const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  fs.writeFileSync(thumbPath(key), Buffer.from(b64, 'base64'))
  return true
}

// 計算這批模型中已有縮圖快取的數量（只檢查檔案是否存在，不讀內容，速度快）
function countThumbs(absPaths) {
  let n = 0
  for (const p of absPaths) {
    try { if (fs.existsSync(thumbPath(thumbKey(p)))) n++ } catch {}
  }
  return n
}

module.exports = { getData, setFavorite, setTags, getThumb, saveThumb, countThumbs }
