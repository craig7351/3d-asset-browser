import * as THREE from 'three'
import { loadModel, measure, forceDoubleSide } from './loader.js'

// L1: 本次 session 的記憶體快取，避免重複 IPC；重啟後清空
const memCache = new Map()
export function clearMemCache() { memCache.clear() }

// 單一離屏渲染器，重複使用以節省資源
const SIZE = 256
let renderer = null
let scene = null
let camera = null

function ensure() {
  if (renderer) return
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(SIZE, SIZE)
  scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.1))
  const dir = new THREE.DirectionalLight(0xffffff, 1.6)
  dir.position.set(3, 6, 4)
  scene.add(dir)
  scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000)
}

function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m) => { Object.values(m).forEach((v) => v && v.isTexture && v.dispose()); m.dispose() })
    }
  })
}

// 渲染單一模型為 PNG dataURL
async function renderOne(ext, rel) {
  ensure()
  const obj = await loadModel(ext, rel)
  forceDoubleSide(obj)
  const { center, radius } = measure(obj)
  obj.position.sub(center)
  scene.add(obj)

  const dist = radius * 3.0
  camera.position.set(dist * 0.7, dist * 0.6, dist)
  camera.near = radius / 100
  camera.far = radius * 100
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()

  // 等貼圖載入完成再拍照，否則 FBX 等格式的貼圖是非同步載入，會拍到沒貼圖的黑色狀態
  await waitTextures(obj)

  renderer.render(scene, camera)
  const dataUrl = renderer.domElement.toDataURL('image/png')

  scene.remove(obj)
  disposeObject(obj)
  return dataUrl
}

// 檢查模型上所有貼圖是否都已載入完成
function texturesReady(obj) {
  let ready = true
  obj.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      for (const k in m) {
        const t = m[k]
        if (t && t.isTexture) {
          const img = t.image
          // 還沒指定 image，或是 <img> 還沒載完 → 尚未就緒
          if (!img) { ready = false }
          else if (img.complete === false) { ready = false }
        }
      }
    }
  })
  return ready
}

// 輪詢等待貼圖就緒（已就緒立即返回），最多等 maxMs 避免卡住
async function waitTextures(obj, maxMs = 1500) {
  const start = performance.now()
  while (performance.now() - start < maxMs) {
    if (texturesReady(obj)) return
    await new Promise((r) => setTimeout(r, 40))
  }
}

// ---- 任務佇列（限制同時渲染數）----
const queue = []
let active = 0
const MAX = 6
const inflight = new Map()  // model.id → Promise，避免同一模型重複排隊

// 進度回報：讓 UI 顯示還有多少縮圖在處理
let onProgress = null
export function setProgressHandler(fn) { onProgress = fn }
function emitProgress() {
  if (onProgress) onProgress({ active, pending: queue.length, remaining: active + queue.length })
}

// 每當「新」縮圖渲染完成（非快取命中）時通知，讓 UI 累加已建數
let onBuilt = null
export function setBuiltHandler(fn) { onBuilt = fn }

function pump() {
  while (active < MAX && queue.length) {
    const job = queue.shift()
    active++
    run(job).finally(() => { active--; emitProgress(); pump() })
  }
  emitProgress()
}

async function run(job) {
  const { model, resolve } = job
  const key = model.paths[model.viewable.ext]
  // L1: 記憶體快取（本次 session，零 IPC）
  if (memCache.has(key)) { resolve(memCache.get(key)); return }
  // L2: 磁碟快取（IPC → main → PNG，跨重啟持久）
  const cached = await window.api.getThumb(key)
  if (cached) { memCache.set(key, cached); resolve(cached); return }
  // L3: 重新渲染
  try {
    const dataUrl = await renderOne(model.viewable.ext, model.viewable.rel)
    window.api.saveThumb(key, dataUrl)  // fire & forget
    memCache.set(key, dataUrl)
    if (onBuilt) onBuilt()
    resolve(dataUrl)
  } catch {
    resolve(null)
  }
}

// 對外：取得縮圖（含快取與佇列）。無可檢視格式則回 null
// 同一模型若已在佇列中，回傳相同 Promise 避免重複渲染
export function requestThumb(model) {
  if (!model.viewable) return Promise.resolve(null)
  if (inflight.has(model.id)) return inflight.get(model.id)
  let outerResolve
  const p = new Promise((resolve) => { outerResolve = resolve })
  inflight.set(model.id, p)
  queue.push({ model, resolve: (v) => { inflight.delete(model.id); outerResolve(v) } })
  emitProgress()
  pump()
  return p
}
