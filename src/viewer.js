import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadModel, measure, countGeometry, forceDoubleSide } from './loader.js'

const BG_COLORS = [0x1a1a1e, 0x2c2c34, 0x808088, 0xf0f0f0]

export class Viewer {
  constructor(container) {
    this.container = container
    this.bgIndex = 0
    this.current = null
    this.clock = new THREE.Clock()
    this.mixer = null
    this._clips = []
    this._paused = false

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(BG_COLORS[0])

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000)
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true

    // 燈光
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.0))
    const dir = new THREE.DirectionalLight(0xffffff, 1.5)
    dir.position.set(3, 6, 4)
    this.scene.add(dir)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4))

    // 格線
    this.grid = new THREE.GridHelper(10, 20, 0x555566, 0x33333c)
    this.scene.add(this.grid)

    this._onResize = () => this.resize()
    window.addEventListener('resize', this._onResize)

    this._animate = this._animate.bind(this)
    this._raf = requestAnimationFrame(this._animate)
  }

  resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  _animate() {
    const dt = this.clock.getDelta()
    if (this.mixer && !this._paused) this.mixer.update(dt)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this._raf = requestAnimationFrame(this._animate)
  }

  clearModel() {
    if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null }
    this._clips = []
    this._paused = false
    if (this.current) {
      this.scene.remove(this.current)
      this.current.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m) => { Object.values(m).forEach((v) => v && v.isTexture && v.dispose()); m.dispose() })
        }
      })
      this.current = null
    }
  }

  async show(ext, rel) {
    this.clearModel()
    const obj = await loadModel(ext, rel)
    forceDoubleSide(obj)

    const { center, radius } = measure(obj)
    // 用 pivot 群組置中：避免動畫的根節點位移軌道覆蓋掉我們的置中位移
    const pivot = new THREE.Group()
    pivot.position.copy(center).multiplyScalar(-1)
    pivot.add(obj)
    this.current = pivot
    this.scene.add(pivot)

    // 依包圍盒放置相機與格線
    const dist = radius * 3.2
    this.camera.position.set(dist * 0.8, dist * 0.7, dist)
    this.camera.near = radius / 100
    this.camera.far = radius * 100
    this.camera.updateProjectionMatrix()
    this.controls.target.set(0, 0, 0)
    this.controls.update()

    const gridSize = radius * 4
    this.grid.scale.setScalar(gridSize / 10)
    this.grid.position.y = -radius

    // 設定動畫：有片段就建立 mixer，預設播放 Idle（找不到則播第一段）
    this._clips = obj.animations || []
    let defaultClip = -1
    if (this._clips.length) {
      this.mixer = new THREE.AnimationMixer(obj)
      defaultClip = this._clips.findIndex((c) => /idle/i.test(c.name))
      if (defaultClip < 0) defaultClip = 0
      this.playClip(defaultClip)
    }

    this.resize()
    return {
      ...countGeometry(obj),
      clips: this._clips.map((c) => c.name || '(無名)'),
      defaultClip
    }
  }

  playClip(index) {
    if (!this.mixer || !this._clips[index]) return
    this.mixer.stopAllAction()
    const action = this.mixer.clipAction(this._clips[index])
    action.reset()
    action.play()
    this._paused = false
  }

  // 切換暫停，回傳切換後的暫停狀態
  togglePause() {
    if (!this.mixer) return false
    this._paused = !this._paused
    return this._paused
  }

  toggleWireframe(on) {
    if (!this.current) return
    this.current.traverse((o) => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((m) => { m.wireframe = on })
      }
    })
  }

  toggleGrid(on) { this.grid.visible = on }

  cycleBg() {
    this.bgIndex = (this.bgIndex + 1) % BG_COLORS.length
    this.scene.background = new THREE.Color(BG_COLORS[this.bgIndex])
  }

  resetView() {
    if (!this.current) return
    const { radius } = measure(this.current)
    const dist = radius * 3.2
    this.camera.position.set(dist * 0.8, dist * 0.7, dist)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  dispose() {
    cancelAnimationFrame(this._raf)
    window.removeEventListener('resize', this._onResize)
    this.clearModel()
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
    }
  }
}
