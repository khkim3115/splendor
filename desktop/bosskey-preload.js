'use strict'
const { contextBridge, ipcRenderer } = require('electron')

// bosskey.html 렌더러가 소비하는 정확한 형태(공유 계약).
// window.bosskey = { save(accel), cancel() }
// 기존 인라인 ipcRenderer.send('tray-set-bosskey', ...) 와 완전히 동일한 채널·payload —
// IPC 계약은 바꾸지 않고 컨텍스트 격리 경계만 안전하게 만든다.
contextBridge.exposeInMainWorld('bosskey', {
  save(accel) {
    ipcRenderer.send('tray-set-bosskey', accel)
  },
  cancel() {
    ipcRenderer.send('tray-set-bosskey', null)
  },
})
