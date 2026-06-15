import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'

let FILE_PORT = 0
export function setFilePort(p) { FILE_PORT = p }

// 把相對素材庫根的路徑轉成本機 http 服務 URL（保留斜線、編碼中文）
export function fileUrl(rel) {
  return `http://127.0.0.1:${FILE_PORT}/m/${encodeURI(rel)}`
}

// 依格式載入模型，回傳 THREE.Object3D
export async function loadModel(ext, rel) {
  const url = fileUrl(rel)
  if (ext === 'glb' || ext === 'gltf') {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    // 把動畫片段掛到 scene 上，讓檢視器能取用（FBXLoader 已自帶 .animations）
    gltf.scene.animations = gltf.animations || []
    return gltf.scene
  }
  if (ext === 'fbx') {
    const loader = new FBXLoader()
    return await loader.loadAsync(url)
  }
  if (ext === 'obj') {
    // 先嘗試載入同名 .mtl 取得材質
    const base = rel.replace(/\.obj$/i, '')
    const objLoader = new OBJLoader()
    try {
      const mtlLoader = new MTLLoader()
      const dir = base.substring(0, base.lastIndexOf('/') + 1)
      mtlLoader.setResourcePath(fileUrl(dir))
      const materials = await mtlLoader.loadAsync(fileUrl(base + '.mtl'))
      materials.preload()
      objLoader.setMaterials(materials)
    } catch {
      // 沒有 mtl 就用預設材質
    }
    return await objLoader.loadAsync(url)
  }
  throw new Error('不支援的格式：' + ext)
}

// 計算包圍盒，回傳 { center, size, radius }
export function measure(object) {
  // 先更新世界矩陣，否則剛載入的模型矩陣未算好，包圍盒會錯（導致相機跑進模型、渲染空白）
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1
  return { box, size, center, radius }
}

// 將所有材質設為雙面，避免翻面法線的模型渲染成空白
export function forceDoubleSide(object) {
  object.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m) => { m.side = THREE.DoubleSide })
    }
  })
}

// 統計三角形 / 頂點數
export function countGeometry(object) {
  let tris = 0
  let verts = 0
  object.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry
      const pos = g.attributes.position
      if (pos) verts += pos.count
      if (g.index) tris += g.index.count / 3
      else if (pos) tris += pos.count / 3
    }
  })
  return { tris: Math.round(tris), verts }
}
