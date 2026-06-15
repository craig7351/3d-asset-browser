# 3D 素材瀏覽器

本機 3D 素材庫快速瀏覽工具。掃描資料夾、產生縮圖、點卡片即可在 3D 中旋轉檢視。

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/Electron-33-47848F)
![three.js](https://img.shields.io/badge/three.js-r160-black)

## 功能

### 瀏覽
- 遞迴掃描素材庫，**同名多格式自動合併**成一個模型卡片（glb / gltf / fbx / obj / blend）
- 側欄資料夾樹導覽；點資料夾只看該目錄的模型
- 關鍵字搜尋、格式篩選、最愛篩選

### 縮圖
- 用 three.js 離屏渲染縮圖，**快取存在模型同目錄的 `.thumbs/`**，搬移素材庫不失效
- IntersectionObserver **懶載入**，只渲染進入畫面的卡片；`⚡ 全部產生縮圖` 可背景批次建立
- 卡片大小三段可調（小 / 中 / 大）

### 多選操作
- `Ctrl+點` 多選、`Shift+點` 範圍選取
- 右鍵選單：多選時可**列出所有路徑**、複製所有路徑；單選時可開啟 3D 檢視、複製路徑、外部開啟、在檔案總管顯示
- 批次刪除（移到資源回收桶，可還原）

### 3D 檢視器
- 滑鼠旋轉 / 縮放 / 平移；鍵盤 Esc 關閉
- 線框、格線、背景（深色 / 淺色 / 透明）切換，重置視角
- **骨架動畫**播放：GLB / GLTF / FBX 內含動畫可播放、暫停、切換片段（預設播 Idle）
- 顯示面數、頂點數、所有可用格式路徑

### 其他
- 最愛標記（⭐）
- 複製檔案路徑、外部程式開啟、在檔案總管顯示
- `.blend` 無法網頁預覽 → 僅提供外部開啟

## 快速開始

預設素材庫路徑：`F:\0_CODE\素材庫`（可在 App 內按「變更素材庫資料夾…」切換，也可修改 `electron/config.cjs` 的 `DEFAULT_LIBRARY_ROOT`）。

### 直接使用

下載 `release/3D 素材瀏覽器 0.1.0.exe`（portable，免安裝）執行即可。

### 開發模式

```powershell
npm install
npm run dev      # Vite + Electron，支援熱更新；F12 開 DevTools
```

### 打包

```powershell
npm run dist     # 產生 release/ 內的 portable .exe
```

## 技術架構

| 層級 | 技術 |
|------|------|
| 桌面框架 | Electron 33 |
| 前端建構 | Vite 5 |
| 3D 渲染 | three.js r160（GLTFLoader / FBXLoader / OBJLoader） |
| 主行程 | Node.js CJS（fs、crypto、path） |
| IPC | contextBridge + ipcMain.handle |

**縮圖流程**：renderer 用離屏 WebGLRenderer 渲染模型快照 → 透過 IPC 存成 PNG 到模型旁的 `.thumbs/` → 下次直接讀取，零重渲染。

**掃描流程**：主行程 `fs.promises` 非同步遞迴掃描 → `Promise.all` 並行偵測動畫 → 結果透過 IPC 回傳 renderer。

**本機 HTTP 伺服器**：electron 起一個唯讀靜態伺服器，讓 three.js 載入 OBJ 時能正確解析相對路徑的 MTL / 貼圖。

## 資料存放位置

| 資料 | 路徑 |
|------|------|
| 縮圖 | `{模型目錄}/.thumbs/{模型名}.png` |
| 最愛 / 標記 | `%APPDATA%\3D 素材瀏覽器\library-data.json` |
| 素材庫設定 | `%APPDATA%\3D 素材瀏覽器\settings.json` |
