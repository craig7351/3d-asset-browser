const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { getLibraryRoot } = require('./config.cjs')

const MIME = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.fbx': 'application/octet-stream',
  '.obj': 'text/plain',
  '.mtl': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.tga': 'application/octet-stream'
}

// 啟動本機唯讀檔案服務，路由：GET /m/<相對素材庫根的路徑>
// 用本機 http 而非 file:// 是為了讓 three.js loader 能正確解析 obj→mtl→貼圖的相對路徑
function startFileServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1')
        if (!url.pathname.startsWith('/m/')) {
          res.writeHead(404); res.end('not found'); return
        }
        const rel = decodeURIComponent(url.pathname.slice(3))
        const root = getLibraryRoot()
        const target = path.resolve(root, rel)
        // 防止路徑穿越
        if (!target.startsWith(path.resolve(root))) {
          res.writeHead(403); res.end('forbidden'); return
        }
        fs.stat(target, (err, st) => {
          if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return }
          const ext = path.extname(target).toLowerCase()
          res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Content-Length': st.size,
            'Access-Control-Allow-Origin': '*'
          })
          fs.createReadStream(target).pipe(res)
        })
      } catch (e) {
        res.writeHead(500); res.end(String(e))
      }
    })
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port)
    })
  })
}

module.exports = { startFileServer }
