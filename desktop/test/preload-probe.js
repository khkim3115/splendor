'use strict'
const { ipcRenderer } = require('electron')

// 렌더러 로드 후: (1) 체감 지연 제거, (2) __traySmokeStart 로 AI 게임 구동,
// (3) __splendorAi 진단(workerCreated·responses·fallbacks·lastAlgo)을 폴링해 메인으로 보고.
window.addEventListener('load', () => {
  const started = typeof window.__traySmokeStart === 'function'
  if (started) {
    try {
      window.__splendorAi && window.__splendorAi.setDelayScale(0) // 연출 지연 제거
    } catch {}
    window.__traySmokeStart() // 사람1+AI1(easy) 게임 시작 → AI 차례로 넘어가 워커 구동
  }
  let tries = 0
  const iv = setInterval(() => {
    tries++
    const diag = window.__splendorAi
    const done = diag && diag.workerCreated && diag.responses > 0
    if (done || tries > 40) {
      clearInterval(iv)
      ipcRenderer.send('smoke-diag', {
        hookPresent: started,
        workerCreated: !!(diag && diag.workerCreated),
        responses: (diag && diag.responses) || 0,
        fallbacks: (diag && diag.fallbacks) || 0,
        lastAlgo: (diag && diag.lastAlgo) || null,
      })
    }
  }, 250) // 최대 10s
})
