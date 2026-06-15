const STRINGS = {
  en: {
    title: '3D Asset Browser',
    sidebar_title: '3D Library',
    rescan_title: 'Rescan',
    pick_library: 'Change library folder…',
    search_placeholder: 'Search model name…',
    fav_only: '⭐ Favorites only',
    anim_only: '🎬 Animated only',
    all_formats: 'All formats',
    size_sm: 'S', size_md: 'M', size_lg: 'L',
    clear_sel: 'Clear selection',
    build_all: '⚡ Build all thumbnails',
    clear_thumbs: '🗑 Clear thumbnail cache',
    wireframe: 'Wireframe', grid: 'Grid', bg: 'BG', reset_view: 'Reset view',
    close_esc: 'Close (Esc)',
    copy_path: 'Copy path',
    open_external: 'Open externally',
    show_in_folder: 'Show in folder',
    copy_all: 'Copy all',
    lang_toggle: '中文',
    // dynamic
    scanning: 'Scanning…',
    no_models: 'No matching models',
    model_count: '{n} models',
    tree_all: 'All',
    tree_fav: '⭐ Favorites',
    anim_chip: '▶ Anim',
    anim_chip_title: 'This model contains animation',
    delete_btn: '🗑 Delete ({n})',
    thumb_done: 'Thumbnails: {built}/{total} built',
    thumb_count: 'Thumbnails: {built}/{total} built ({notBuilt} remaining)',
    build_all_progress: 'Building {done} / {total}',
    build_all_done: '✓ {total} thumbnails built',
    ctx_view3d: 'Open 3D viewer',
    ctx_copy_path: 'Copy path',
    ctx_open_external: 'Open externally',
    ctx_show_folder: 'Show in folder',
    ctx_list_paths: 'List all paths ({n})',
    ctx_copy_all_paths: 'Copy all paths',
    ctx_deselect: 'Deselect all',
    path_list_title: 'All paths ({n} models)',
    path_list_copy_row: 'Copy',
    viewer_no_preview: 'This model only has .blend format and cannot be previewed here. Open with an external application.',
    viewer_stats: '{tris} faces · {verts} vertices · Format: {ext}',
    viewer_error: 'Load failed: ',
    viewer_loading: 'Loading…',
    delete_error: 'Deleted {ok} files, but {failed} failed (may be in use).',
    // confirm delete dialog
    dlg_delete_title: 'Delete models',
    dlg_delete_message: 'Delete {count} selected model(s)?',
    dlg_delete_detail: 'This will move {fileCount} file(s) to the Recycle Bin (can be restored).',
    dlg_cancel: 'Cancel',
    dlg_confirm: 'Move to Recycle Bin',
  },
  zh: {
    title: '3D 素材瀏覽器',
    sidebar_title: '3D 素材庫',
    rescan_title: '重新掃描',
    pick_library: '變更素材庫資料夾…',
    search_placeholder: '搜尋模型名稱…',
    fav_only: '⭐ 只看最愛',
    anim_only: '🎬 只看動畫',
    all_formats: '所有格式',
    size_sm: '小', size_md: '中', size_lg: '大',
    clear_sel: '清除選取',
    build_all: '⚡ 全部產生縮圖',
    clear_thumbs: '🗑 清除縮圖快取',
    wireframe: '線框', grid: '格線', bg: '背景', reset_view: '重置視角',
    close_esc: '關閉 (Esc)',
    copy_path: '複製路徑',
    open_external: '外部開啟',
    show_in_folder: '在檔案總管顯示',
    copy_all: '全部複製',
    lang_toggle: 'English',
    // dynamic
    scanning: '掃描中…',
    no_models: '沒有符合的模型',
    model_count: '{n} 個模型',
    tree_all: '全部',
    tree_fav: '⭐ 最愛',
    anim_chip: '▶ 動畫',
    anim_chip_title: '此模型含動畫',
    delete_btn: '🗑 刪除選取 ({n})',
    thumb_done: '縮圖 已建 {built} / 共 {total}',
    thumb_count: '縮圖 已建 {built} / 共 {total}（未建 {notBuilt}）',
    build_all_progress: '全部產生縮圖 {done} / {total}',
    build_all_done: '✓ 已全部產生 {total} 張縮圖',
    ctx_view3d: '開啟 3D 檢視',
    ctx_copy_path: '複製路徑',
    ctx_open_external: '外部開啟',
    ctx_show_folder: '在檔案總管顯示',
    ctx_list_paths: '列出所有路徑（{n} 個）',
    ctx_copy_all_paths: '複製所有路徑',
    ctx_deselect: '取消全選',
    path_list_title: '所有路徑（{n} 個模型）',
    path_list_copy_row: '複製',
    viewer_no_preview: '此模型只有 .blend 格式，無法在此預覽。請用外部程式開啟。',
    viewer_stats: '{tris} 面 · {verts} 頂點 · 檢視格式：{ext}',
    viewer_error: '載入失敗：',
    viewer_loading: '載入中…',
    delete_error: '已刪除 {ok} 個檔案，但有 {failed} 個失敗（可能正被佔用）。',
    // confirm delete dialog
    dlg_delete_title: '刪除模型',
    dlg_delete_message: '確定要刪除選取的 {count} 個模型嗎？',
    dlg_delete_detail: '將把這些模型的 {fileCount} 個原始檔案移到資源回收桶（可從回收桶還原）。',
    dlg_cancel: '取消',
    dlg_confirm: '移到資源回收桶',
  }
}

let _lang = localStorage.getItem('lang') || 'en'

export function getLang() { return _lang }

export function t(key, vars) {
  let s = STRINGS[_lang]?.[key] ?? STRINGS.en?.[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v)
  return s
}

export function applyI18n() {
  document.title = t('title')
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n
    const attr = el.dataset.i18nAttr
    if (attr) el.setAttribute(attr, t(key))
    else el.textContent = t(key)
  })
}

export function setLang(lang) {
  _lang = lang
  localStorage.setItem('lang', lang)
  applyI18n()
}
