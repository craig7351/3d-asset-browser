const path = require('node:path')
const fs = require('node:fs')
const { app } = require('electron')

function dataFile() {
  return path.join(app.getPath('userData'), 'library-data.json')
}

let _cache = null

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

// 縮圖存在模型同目錄的 .thumbs 資料夾，方便搬移素材庫時一起帶走
function thumbPath(absModelPath) {
  const dir = path.dirname(absModelPath)
  const stem = path.basename(absModelPath, path.extname(absModelPath))
  return path.join(dir, '.thumbs', stem + '.png')
}

// 非同步讀取，避免大量縮圖載入時 readFileSync 卡住主行程
async function getThumb(absPath) {
  try {
    const buf = await fs.promises.readFile(thumbPath(absPath))
    return 'data:image/png;base64,' + buf.toString('base64')
  } catch {
    return null
  }
}

async function saveThumb(absPath, dataUrl) {
  const p = thumbPath(absPath)
  await fs.promises.mkdir(path.dirname(p), { recursive: true })
  const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  await fs.promises.writeFile(p, Buffer.from(b64, 'base64'))
  return true
}

// 統計已建縮圖數：把路徑依資料夾分組，每個 .thumbs 目錄只 readdir 一次
// （等於把 .thumbs 當成該資料夾的縮圖索引），避免上千次逐檔 fs.access。
async function countThumbs(absPaths) {
  const byDir = new Map()   // .thumbs 目錄 → 需比對的 png 檔名陣列
  for (const p of absPaths) {
    const td = path.join(path.dirname(p), '.thumbs')
    const name = path.basename(p, path.extname(p)) + '.png'
    if (!byDir.has(td)) byDir.set(td, [])
    byDir.get(td).push(name)
  }
  let total = 0
  await Promise.all([...byDir.entries()].map(async ([td, names]) => {
    let set
    try { set = new Set(await fs.promises.readdir(td)) }
    catch { return }   // 該資料夾還沒有 .thumbs
    for (const n of names) if (set.has(n)) total++
  }))
  return total
}

// 遞迴刪除 libraryRoot 內所有 .thumbs 目錄的內容
async function clearThumbs(libraryRoot) {
  async function walk(dir) {
    const td = path.join(dir, '.thumbs')
    try {
      const files = await fs.promises.readdir(td)
      await Promise.all(files.map(f => fs.promises.unlink(path.join(td, f)).catch(() => {})))
    } catch {}
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      await Promise.all(
        entries
          .filter(e => e.isDirectory() && e.name !== '.thumbs')
          .map(e => walk(path.join(dir, e.name)))
      )
    } catch {}
  }
  await walk(libraryRoot)
  return true
}

module.exports = { getData, setFavorite, setTags, getThumb, saveThumb, countThumbs, clearThumbs }
