const path = require('node:path')
const fs = require('node:fs')
const { MODEL_EXTS, VIEWABLE_PRIORITY, FORMAT_DIR_NAMES } = require('./config.cjs')

const PREVIEW_EXTS = ['.png', '.jpg', '.jpeg', '.webp']

function toRel(root, abs) {
  return path.relative(root, abs).split(path.sep).join('/')
}

// 非同步偵測 .gltf 是否含動畫
async function gltfHasAnim(abs) {
  try {
    const j = JSON.parse(await fs.promises.readFile(abs, 'utf8'))
    return Array.isArray(j.animations) && j.animations.length > 0
  } catch { return false }
}

// 非同步偵測 .glb 是否含動畫（只讀 header + JSON chunk）
async function glbHasAnim(abs) {
  let fd
  try {
    fd = await fs.promises.open(abs, 'r')
    const header = Buffer.alloc(12)
    await fd.read(header, 0, 12, 0)
    if (header.readUInt32LE(0) !== 0x46546c67) return false  // 'glTF' magic
    const chunkHead = Buffer.alloc(8)
    await fd.read(chunkHead, 0, 8, 12)
    const chunkLen = chunkHead.readUInt32LE(0)
    if (chunkHead.readUInt32LE(4) !== 0x4e4f534a) return false  // 'JSON' chunk type
    const jsonBuf = Buffer.alloc(chunkLen)
    await fd.read(jsonBuf, 0, chunkLen, 20)
    const j = JSON.parse(jsonBuf.toString('utf8'))
    return Array.isArray(j.animations) && j.animations.length > 0
  } catch { return false }
  finally { if (fd) await fd.close() }
}

async function detectAnimation(formats) {
  if (formats.gltf) return gltfHasAnim(formats.gltf.abs)
  if (formats.glb) return glbHasAnim(formats.glb.abs)
  return false
}

// 平行遞迴蒐集所有檔案（各子目錄並行，不阻塞事件迴圈）
async function walk(dir, out = []) {
  let entries
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch { return out }
  const dirs = [], files = []
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) dirs.push(full)
    else if (e.isFile()) files.push(full)
  }
  out.push(...files)
  await Promise.all(dirs.map(d => walk(d, out)))
  return out
}

/**
 * 非同步掃描素材庫，回傳：
 *  - models: 合併同名多格式後的模型群組陣列
 *  - tree:   側欄用的巢狀資料夾樹
 */
async function scanLibrary(root) {
  try {
    await fs.promises.access(root)
  } catch {
    return { root, models: [], tree: [], error: '找不到素材庫資料夾：' + root }
  }

  const files = await walk(root)
  const previews = new Map()
  const groups = new Map()

  for (const abs of files) {
    const ext = path.extname(abs).toLowerCase()
    if (PREVIEW_EXTS.includes(ext)) {
      const relDir = toRel(root, path.dirname(abs))
      const base = path.basename(abs, ext).toLowerCase()
      if (/preview|cover|thumb/.test(base) || !previews.has(relDir)) {
        previews.set(relDir, toRel(root, abs))
      }
    }
  }

  for (const abs of files) {
    const ext = path.extname(abs).toLowerCase()
    if (!MODEL_EXTS.includes(ext)) continue

    const dir = path.dirname(abs)
    const parentName = path.basename(dir).toLowerCase()
    const baseName = path.basename(abs, path.extname(abs))

    const logicalDir = FORMAT_DIR_NAMES.has(parentName) ? path.dirname(dir) : dir
    const relLogicalDir = toRel(root, logicalDir)
    const groupKey = (relLogicalDir + '|' + baseName).toLowerCase()

    let g = groups.get(groupKey)
    if (!g) {
      const segments = relLogicalDir ? relLogicalDir.split('/') : []
      g = {
        id: groupKey,
        name: baseName,
        pack: segments[0] || '(根目錄)',
        category: relLogicalDir,
        categorySegments: segments,
        formats: {},
        preview: null
      }
      groups.set(groupKey, g)
    }
    const key = ext.slice(1)
    if (!g.formats[key]) {
      g.formats[key] = { rel: toRel(root, abs), abs }
    }

    if (!g.preview) {
      for (const pe of PREVIEW_EXTS) {
        const candidate = path.join(dir, baseName + pe)
        try { await fs.promises.access(candidate); g.preview = toRel(root, candidate); break } catch {}
      }
    }
  }

  // 動畫偵測並行執行（所有群組同時偵測，避免逐一等待）
  const groupArr = [...groups.values()]
  const animResults = await Promise.all(groupArr.map(g => detectAnimation(g.formats)))

  const models = groupArr.map((g, i) => {
    if (!g.preview) {
      const p = previews.get(g.category)
      if (p) g.preview = p
    }
    let viewable = null
    for (const ext of VIEWABLE_PRIORITY) {
      const k = ext.slice(1)
      if (g.formats[k]) { viewable = { ext: k, rel: g.formats[k].rel }; break }
    }
    return {
      id: g.id,
      name: g.name,
      pack: g.pack,
      category: g.category,
      categorySegments: g.categorySegments,
      formatList: Object.keys(g.formats),
      paths: Object.fromEntries(Object.entries(g.formats).map(([k, v]) => [k, v.abs])),
      rels: Object.fromEntries(Object.entries(g.formats).map(([k, v]) => [k, v.rel])),
      viewable,
      preview: g.preview,
      hasAnimation: animResults[i]
    }
  })

  models.sort((a, b) =>
    a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  )

  const tree = buildTree(models)
  return { root, models, tree, error: null }
}

function buildTree(models) {
  const rootNodes = new Map()
  function ensure(map, seg, pathSoFar) {
    if (!map.has(seg)) {
      map.set(seg, { name: seg, path: pathSoFar, count: 0, children: new Map() })
    }
    return map.get(seg)
  }
  for (const m of models) {
    let map = rootNodes
    let acc = ''
    for (const seg of m.categorySegments) {
      acc = acc ? acc + '/' + seg : seg
      const node = ensure(map, seg, acc)
      node.count++
      map = node.children
    }
  }
  function toArr(map) {
    return [...map.values()]
      .map((n) => ({ name: n.name, path: n.path, count: n.count, children: toArr(n.children) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  return toArr(rootNodes)
}

module.exports = { scanLibrary }
