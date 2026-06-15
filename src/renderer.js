import './style.css'
// 3D 素材瀏覽器 renderer
import { setFilePort } from './loader.js'
import { requestThumb, setProgressHandler, setBuiltHandler, clearMemCache } from './thumbnail.js'
import { Viewer } from './viewer.js'

const $ = (sel) => document.querySelector(sel)

const state = {
  models: [],
  tree: [],
  favorites: {},
  tags: {},
  activeCategory: '',   // '' = 全部
  search: '',
  formatFilter: '',
  favOnly: false,
  animOnly: false,
  expanded: new Set(),
  selected: new Set(),   // 已選取的模型 id
  viewSize: 'md'
}
let currentList = []      // 目前網格顯示的模型清單（供範圍選取 / 全選用）
let lastClickedIndex = -1 // 供 Shift 範圍選取

let viewer = null
let viewerModel = null

// ---- 初始化 ----
async function init() {
  const cfg = await window.api.getConfig()
  setFilePort(cfg.filePort)
  $('#root-info').textContent = cfg.libraryRoot

  const data = await window.api.getData()
  state.favorites = data.favorites
  state.tags = data.tags

  applyViewSize(localStorage.getItem('viewSize') || 'md')
  setProgressHandler((p) => { tStats.remaining = p.remaining; renderThumbStatus() })
  setBuiltHandler(() => { tStats.built++; renderThumbStatus() })
  await rescan()
  bindUI()
}

// 縮圖狀態：目前檢視範圍內已建幾張 / 共幾張、還有幾張在處理
const tStats = { built: 0, total: 0, remaining: 0 }
// 全部產生縮圖的進度
const buildAll = { active: false, total: 0, done: 0 }
function renderThumbStatus() {
  const el = $('#thumb-status')
  if (buildAll.active) {
    const left = buildAll.total - buildAll.done
    if (left > 0) {
      el.innerHTML = `<span class="mini-spin"></span> 全部產生縮圖 ${buildAll.done} / ${buildAll.total}`
      el.classList.remove('hidden', 'done')
    } else {
      buildAll.active = false
      $('#btn-build-all').disabled = false
      el.textContent = `✓ 已全部產生 ${buildAll.total} 張縮圖`
      el.classList.remove('hidden'); el.classList.add('done')
    }
    return
  }
  if (tStats.total === 0) { el.classList.add('hidden'); return }
  const notBuilt = Math.max(0, tStats.total - tStats.built)
  const allDone = notBuilt === 0
  const busy = !allDone && tStats.remaining > 0
  // 全部建完才顯示 ✓；有任務跑中顯示 spinner；其餘（idle 但有未建）顯示灰字計數
  const lead = allDone ? '✓ ' : busy ? '<span class="mini-spin"></span> ' : ''
  el.innerHTML = `${lead}縮圖 已建 ${tStats.built} / 共 ${tStats.total}（未建 ${notBuilt}）`
  el.classList.toggle('done', allDone)
  el.classList.remove('hidden')
}

// 一次把整個素材庫所有可檢視模型的縮圖都產生好（背景進行）
function buildAllThumbs() {
  if (buildAll.active) return
  const list = state.models.filter((m) => m.viewable)
  if (!list.length) return
  buildAll.active = true
  buildAll.total = list.length
  buildAll.done = 0
  $('#btn-build-all').disabled = true
  renderThumbStatus()
  for (const m of list) {
    requestThumb(m).then(() => { buildAll.done++; renderThumbStatus() })
  }
}

// 查詢目前檢視範圍內已有快取的縮圖數，更新狀態
let builtQueryToken = 0
async function refreshBuiltCount(list) {
  const token = ++builtQueryToken
  const viewables = list.filter((m) => m.viewable)
  tStats.total = viewables.length
  tStats.built = 0  // 先清零，等 countThumbs 確認後再更新，避免舊值觸發假 "done"
  renderThumbStatus()
  const absPaths = viewables.map((m) => m.paths[m.viewable.ext])
  let n = 0
  try { n = await window.api.countThumbs(absPaths) } catch {}
  if (token !== builtQueryToken) return   // 已有更新的查詢，捨棄這次結果
  tStats.built = n
  renderThumbStatus()
}

// 套用卡片大小（sm/md/lg）並記住選擇
function applyViewSize(size) {
  state.viewSize = ['sm', 'md', 'lg'].includes(size) ? size : 'md'
  const grid = $('#grid')
  grid.classList.remove('size-sm', 'size-md', 'size-lg')
  grid.classList.add('size-' + state.viewSize)
  document.querySelectorAll('#view-size button').forEach((b) => {
    b.classList.toggle('on', b.dataset.size === state.viewSize)
  })
  localStorage.setItem('viewSize', state.viewSize)
}

async function rescan() {
  $('#grid').innerHTML = '<div class="empty">掃描中…</div>'
  const res = await window.api.scan()
  if (res.error) {
    $('#grid').innerHTML = `<div class="empty">${res.error}</div>`
    return
  }
  state.models = res.models
  state.tree = res.tree
  $('#root-info').textContent = res.root
  renderTree()
  renderGrid()
}

// ---- 側欄樹 ----
function renderTree() {
  const nav = $('#tree')
  nav.innerHTML = ''

  const total = state.models.length
  nav.appendChild(treeRow({ name: '全部', path: '', count: total }, 0, false, null))
  nav.appendChild(treeRow({ name: '⭐ 最愛', path: '__fav__', count: Object.keys(state.favorites).length }, 0, false, null))

  // 平鋪 + 縮排（用 depth 控制 padding），展開的節點才往下遞迴
  const flat = (nodes, depth) => {
    for (const node of nodes) {
      const hasChildren = node.children && node.children.length
      nav.appendChild(treeRow(node, depth, hasChildren, node))
      if (hasChildren && state.expanded.has(node.path)) flat(node.children, depth + 1)
    }
  }
  flat(state.tree, 0)
}

function treeRow(node, depth, hasChildren, realNode) {
  const row = document.createElement('div')
  row.className = 'tree-row'
  if (state.activeCategory === node.path) row.classList.add('active')
  row.style.paddingLeft = 6 + depth * 14 + 'px'

  const twisty = document.createElement('span')
  twisty.className = 'twisty'
  twisty.textContent = hasChildren ? (state.expanded.has(node.path) ? '▾' : '▸') : ''
  row.appendChild(twisty)

  const label = document.createElement('span')
  label.className = 'label'
  label.textContent = node.name
  row.appendChild(label)

  const cnt = document.createElement('span')
  cnt.className = 'cnt'
  cnt.textContent = node.count
  row.appendChild(cnt)

  twisty.addEventListener('click', (e) => {
    if (!hasChildren) return
    e.stopPropagation()
    if (state.expanded.has(node.path)) state.expanded.delete(node.path)
    else state.expanded.add(node.path)
    renderTree()
  })
  row.addEventListener('click', () => {
    state.activeCategory = node.path
    state.selected.clear()          // 切換分類時清除選取，避免誤刪其他分類的檔案
    lastClickedIndex = -1
    renderTree()
    renderGrid()
  })
  return row
}

// ---- 篩選 ----
function filteredModels() {
  const q = state.search.trim().toLowerCase()
  return state.models.filter((m) => {
    if (state.activeCategory === '__fav__') {
      if (!state.favorites[m.id]) return false
    } else if (state.activeCategory) {
      if (m.category !== state.activeCategory && !m.category.startsWith(state.activeCategory + '/')) return false
    }
    if (state.favOnly && !state.favorites[m.id]) return false
    if (state.animOnly && !m.hasAnimation) return false
    if (state.formatFilter && !m.formatList.includes(state.formatFilter)) return false
    if (q && !m.name.toLowerCase().includes(q)) return false
    return true
  })
}

// ---- 網格 ----
let thumbObserver = null
function renderGrid() {
  const grid = $('#grid')
  grid.innerHTML = ''
  const list = filteredModels()
  currentList = list
  lastClickedIndex = -1
  $('#count').textContent = `${list.length} 個模型`

  if (!list.length) {
    grid.innerHTML = '<div class="empty">沒有符合的模型</div>'
    tStats.total = 0
    renderThumbStatus()
    return
  }

  refreshBuiltCount(list)

  if (thumbObserver) thumbObserver.disconnect()
  thumbObserver = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        loadThumb(en.target)
        thumbObserver.unobserve(en.target)
      }
    }
  }, { rootMargin: '200px' })

  list.forEach((m, i) => grid.appendChild(card(m, i)))
  updateSelToolbar()
}

function card(m, index) {
  const el = document.createElement('div')
  el.className = 'card'
  if (state.selected.has(m.id)) el.classList.add('selected')
  el._model = m
  el._index = index

  const thumb = document.createElement('div')
  thumb.className = 'thumb'
  if (m.viewable) {
    thumb.innerHTML = '<div class="spin"></div>'
  } else {
    thumb.innerHTML = '<div class="ph">📦</div>'
  }
  el.appendChild(thumb)

  // 覆蓋在卡片上的標記（放在卡片而非縮圖，縮圖內容更新時才不會被清掉）
  if (m.hasAnimation) {
    const anim = document.createElement('div')
    anim.className = 'anim-chip'
    anim.textContent = '▶ 動畫'
    anim.title = '此模型含動畫'
    el.appendChild(anim)
  }
  if (state.favorites[m.id]) {
    const star = document.createElement('div')
    star.className = 'fav-star'
    star.textContent = '★'
    el.appendChild(star)
  }

  const meta = document.createElement('div')
  meta.className = 'meta'
  const nm = document.createElement('div')
  nm.className = 'nm'
  nm.textContent = m.name
  nm.title = m.name
  meta.appendChild(nm)

  const badges = document.createElement('div')
  badges.className = 'badges'
  for (const f of m.formatList) {
    const b = document.createElement('span')
    b.className = 'badge'
    if (m.viewable && m.viewable.ext === f) b.classList.add('viewable')
    b.textContent = f
    badges.appendChild(b)
  }
  meta.appendChild(badges)
  el.appendChild(meta)

  // 單擊 = 選取（延遲 220ms，若是雙擊則取消選取改為開啟）
  let clickTimer = null
  el.addEventListener('click', (e) => {
    clearTimeout(clickTimer)
    clickTimer = setTimeout(() => handleSelect(m, el._index, e), 220)
  })
  el.addEventListener('dblclick', () => {
    clearTimeout(clickTimer)
    openViewer(m)
  })

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const isSelected = state.selected.has(m.id)
    if (isSelected && state.selected.size > 1) {
      const models = currentList.filter(x => state.selected.has(x.id))
      showCtxMenu(e.clientX, e.clientY, [
        { label: `列出所有路徑（${models.length} 個）`, action: () => showPathList(models) },
        { label: '複製所有路徑', action: () => {
          const paths = models.map(x => x.viewable ? x.paths[x.viewable.ext] : Object.values(x.paths)[0])
          window.api.copyPath(paths.join('\n'))
        }},
        '---',
        { label: '取消全選', action: clearSelection }
      ])
    } else {
      const path = m.viewable ? m.paths[m.viewable.ext] : Object.values(m.paths)[0]
      showCtxMenu(e.clientX, e.clientY, [
        { label: '開啟 3D 檢視', action: () => openViewer(m) },
        { label: '複製路徑', action: () => window.api.copyPath(path) },
        { label: '外部開啟', action: () => window.api.openPath(path) },
        { label: '在檔案總管顯示', action: () => window.api.showInFolder(path) },
      ])
    }
  })

  if (m.viewable) thumbObserver.observe(el)
  return el
}

// 處理卡片選取：一般點擊=切換，Shift=範圍選取，Ctrl/Cmd=加減選
function handleSelect(m, index, e) {
  if (e.shiftKey && lastClickedIndex >= 0 && index >= 0) {
    const [a, b] = [lastClickedIndex, index].sort((x, y) => x - y)
    for (let i = a; i <= b; i++) {
      const mm = currentList[i]
      if (mm) state.selected.add(mm.id)
    }
  } else {
    if (state.selected.has(m.id)) state.selected.delete(m.id)
    else state.selected.add(m.id)
    lastClickedIndex = index
  }
  syncSelectionUI()
}

// 只更新選取相關的 DOM（不重建整個網格）
function syncSelectionUI() {
  document.querySelectorAll('#grid .card').forEach((el) => {
    el.classList.toggle('selected', state.selected.has(el._model.id))
  })
  updateSelToolbar()
}

// 更新刪除/清除按鈕狀態
function updateSelToolbar() {
  const n = state.selected.size
  const del = $('#btn-delete')
  del.textContent = `🗑 刪除選取 (${n})`
  del.disabled = n === 0
  $('#btn-clear-sel').classList.toggle('hidden', n === 0)
}

function clearSelection() {
  state.selected.clear()
  lastClickedIndex = -1
  syncSelectionUI()
}

// 刪除選取模型的原始檔案（移到資源回收桶）
async function deleteSelected() {
  if (!state.selected.size) return
  const models = state.models.filter((m) => state.selected.has(m.id))
  // 收集每個模型所有格式的檔案路徑
  const paths = []
  for (const m of models) paths.push(...Object.values(m.paths))

  const okToDelete = await window.api.confirmDelete(models.length, paths.length)
  if (!okToDelete) return

  const res = await window.api.trashFiles(paths)
  state.selected.clear()
  lastClickedIndex = -1
  await rescan()   // 重新掃描，更新模型清單與資料夾樹（已刪的檔案不會再出現）
  updateSelToolbar()
  if (res.failed && res.failed.length) {
    alert(`已刪除 ${res.ok} 個檔案，但有 ${res.failed.length} 個失敗（可能正被佔用）。`)
  }
}

async function loadThumb(cardEl) {
  const m = cardEl._model
  const dataUrl = await requestThumb(m)
  const thumb = cardEl.querySelector('.thumb')
  if (!thumb) return
  if (dataUrl) {
    const img = new Image()
    img.src = dataUrl
    thumb.innerHTML = ''
    thumb.appendChild(img)
  } else {
    thumb.innerHTML = '<div class="ph">⚠️</div>'
  }
}

// ---- 檢視器 ----
async function openViewer(m) {
  viewerModel = m
  const overlay = $('#viewer-overlay')
  overlay.classList.remove('hidden')

  if (!viewer) viewer = new Viewer($('#viewer-canvas-wrap'))

  $('#vi-name').textContent = m.name
  $('#vi-path').textContent = m.viewable ? m.paths[m.viewable.ext] : Object.values(m.paths)[0]
  $('#vi-stats').textContent = ''
  $('#anim-controls').classList.add('hidden')   // 預設隱藏動畫控制
  updateFavBtn()

  // 格式徽章
  const fwrap = $('#vi-formats')
  fwrap.innerHTML = ''
  for (const f of m.formatList) {
    const b = document.createElement('span')
    b.className = 'badge'
    if (m.viewable && m.viewable.ext === f) b.classList.add('viewable')
    b.textContent = f
    fwrap.appendChild(b)
  }

  if (!m.viewable) {
    $('#viewer-loading').textContent = '此模型只有 .blend 格式，無法在此預覽。請用外部程式開啟。'
    $('#viewer-loading').classList.remove('hidden')
    return
  }

  $('#viewer-loading').textContent = '載入中…'
  $('#viewer-loading').classList.remove('hidden')
  try {
    const stats = await viewer.show(m.viewable.ext, m.viewable.rel)
    $('#vi-stats').textContent = `${stats.tris.toLocaleString()} 面 · ${stats.verts.toLocaleString()} 頂點 · 檢視格式：${m.viewable.ext}`
    setupAnimUI(stats)
    $('#viewer-loading').classList.add('hidden')
    setTimeout(() => viewer.resize(), 30)
  } catch (e) {
    $('#viewer-loading').textContent = '載入失敗：' + (e.message || e)
  }
}

// 依模型動畫片段設定動畫控制列
function setupAnimUI(stats) {
  const wrap = $('#anim-controls')
  const sel = $('#anim-select')
  const btn = $('#anim-playpause')
  if (!stats.clips || !stats.clips.length) {
    wrap.classList.add('hidden')
    return
  }
  sel.innerHTML = stats.clips.map((n, i) => `<option value="${i}">${n}</option>`).join('')
  sel.value = String(stats.defaultClip >= 0 ? stats.defaultClip : 0)
  btn.textContent = '⏸'
  wrap.classList.remove('hidden')
}

function closeViewer() {
  $('#viewer-overlay').classList.add('hidden')
  if (viewer) viewer.clearModel()
  viewerModel = null
}

function updateFavBtn() {
  if (!viewerModel) return
  const on = !!state.favorites[viewerModel.id]
  $('#vi-fav').textContent = on ? '★' : '☆'
}

async function toggleFav() {
  if (!viewerModel) return
  const on = !state.favorites[viewerModel.id]
  state.favorites = await window.api.setFavorite(viewerModel.id, on)
  updateFavBtn()
  renderTree()
  renderGrid()
}

// ---- 右鍵選單 ----
function showCtxMenu(x, y, items) {
  const menu = $('#ctx-menu')
  menu.innerHTML = ''
  for (const it of items) {
    if (it === '---') {
      const sep = document.createElement('hr')
      sep.className = 'ctx-sep'
      menu.appendChild(sep)
    } else {
      const el = document.createElement('div')
      el.className = 'ctx-item' + (it.danger ? ' danger' : '')
      el.textContent = it.label
      el.addEventListener('mousedown', (e) => e.stopPropagation())
      el.addEventListener('click', () => { hideCtxMenu(); it.action() })
      menu.appendChild(el)
    }
  }
  menu.classList.remove('hidden')
  const mw = 230
  const mh = items.reduce((s, i) => s + (i === '---' ? 13 : 36), 8)
  const W = window.innerWidth, H = window.innerHeight
  menu.style.left = (x + mw > W ? x - mw : x) + 'px'
  menu.style.top  = (y + mh > H ? Math.max(0, y - mh) : y) + 'px'
}

function hideCtxMenu() { $('#ctx-menu').classList.add('hidden') }

// ---- 路徑清單彈窗 ----
function showPathList(models) {
  const paths = models.map(m => m.viewable ? m.paths[m.viewable.ext] : Object.values(m.paths)[0])
  $('#pl-title').textContent = `所有路徑（${models.length} 個模型）`
  const body = $('#pl-body')
  body.innerHTML = ''
  models.forEach((m, i) => {
    const row = document.createElement('div')
    row.className = 'pl-row'
    const name = document.createElement('span'); name.className = 'pl-row-name'; name.textContent = m.name
    const p = document.createElement('span'); p.className = 'pl-row-path'; p.textContent = paths[i]
    const btn = document.createElement('button'); btn.className = 'pl-row-copy'; btn.textContent = '複製'
    btn.addEventListener('click', () => window.api.copyPath(paths[i]))
    row.append(name, p, btn)
    body.appendChild(row)
  })
  $('#pl-copy-all').onclick = () => window.api.copyPath(paths.join('\n'))
  $('#path-list-overlay').classList.remove('hidden')
}

function hidePathList() { $('#path-list-overlay').classList.add('hidden') }

// ---- UI 綁定 ----
function bindUI() {
  $('#search').addEventListener('input', (e) => { state.search = e.target.value; renderGrid() })
  $('#filter-format').addEventListener('change', (e) => { state.formatFilter = e.target.value; renderGrid() })
  $('#filter-fav').addEventListener('change', (e) => { state.favOnly = e.target.checked; renderGrid() })
  $('#filter-anim').addEventListener('change', (e) => { state.animOnly = e.target.checked; renderGrid() })
  $('#view-size').addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (b) applyViewSize(b.dataset.size)
  })
  $('#btn-build-all').addEventListener('click', buildAllThumbs)
  $('#btn-clear-thumbs').addEventListener('click', async () => {
    await window.api.clearThumbs()
    clearMemCache()
    tStats.built = 0
    renderThumbStatus()
    renderGrid()
  })
  $('#btn-delete').addEventListener('click', deleteSelected)
  $('#btn-clear-sel').addEventListener('click', clearSelection)
  $('#btn-rescan').addEventListener('click', rescan)
  $('#btn-pick').addEventListener('click', async () => {
    const r = await window.api.pickLibrary()
    if (r) await rescan()
  })

  // 右鍵選單：點其他地方關閉
  document.addEventListener('mousedown', (e) => {
    if (!$('#ctx-menu').contains(e.target)) hideCtxMenu()
  })

  // 路徑清單彈窗
  $('#pl-close').addEventListener('click', hidePathList)
  $('#path-list-overlay').addEventListener('click', (e) => { if (e.target.id === 'path-list-overlay') hidePathList() })

  $('#viewer-close').addEventListener('click', closeViewer)
  $('#viewer-overlay').addEventListener('click', (e) => { if (e.target.id === 'viewer-overlay') closeViewer() })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeViewer(); hidePathList(); hideCtxMenu() }
  })

  $('#vi-fav').addEventListener('click', toggleFav)
  $('#vi-copy').addEventListener('click', () => window.api.copyPath($('#vi-path').textContent))
  $('#vi-open').addEventListener('click', () => {
    if (viewerModel) window.api.openPath(Object.values(viewerModel.paths)[0])
  })
  $('#vi-reveal').addEventListener('click', () => {
    if (viewerModel) window.api.showInFolder(Object.values(viewerModel.paths)[0])
  })

  const tb = $('#viewer-toolbar')
  tb.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn || !viewer) return
    const act = btn.dataset.act
    if (act === 'wireframe') { btn.classList.toggle('on'); viewer.toggleWireframe(btn.classList.contains('on')) }
    else if (act === 'grid') { const vis = !viewer.grid.visible; viewer.toggleGrid(vis); btn.classList.toggle('on', vis) }
    else if (act === 'bg') viewer.cycleBg()
    else if (act === 'reset') viewer.resetView()
  })

  // 動畫控制
  $('#anim-select').addEventListener('change', (e) => {
    if (!viewer) return
    viewer.playClip(+e.target.value)
    $('#anim-playpause').textContent = '⏸'
  })
  $('#anim-playpause').addEventListener('click', () => {
    if (!viewer) return
    const paused = viewer.togglePause()
    $('#anim-playpause').textContent = paused ? '▶' : '⏸'
  })
}

init()
