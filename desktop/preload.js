'use strict'
const { contextBridge, ipcRenderer } = require('electron')

// Plan 1 렌더러가 소비하는 정확한 형태(공유 계약).
// window.tray = { hide(), resize(w,h), setOpacity(v, persist), onOpacity(cb), onTheme(cb) }
contextBridge.exposeInMainWorld('tray', {
  hide() {
    ipcRenderer.send('tray-hide')
  },
  resize(w, h) {
    ipcRenderer.send('tray-resize', { w, h })
  },
  setOpacity(value, persist) {
    ipcRenderer.send('tray-set-opacity', { value, persist })
  },
  onOpacity(cb) {
    const handler = (_e, value) => cb(value)
    ipcRenderer.on('tray-opacity', handler)
    return () => ipcRenderer.removeListener('tray-opacity', handler)
  },
  onTheme(cb) {
    const handler = (_e, theme) => cb(theme)
    ipcRenderer.on('tray-theme', handler)
    return () => ipcRenderer.removeListener('tray-theme', handler)
  },
})
