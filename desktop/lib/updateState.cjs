'use strict'

/**
 * electron-updater 진행 상태를 추적하는 순수 상태 머신 — electron 을 import 하지 않는다.
 * "설치 준비완료(ready)" 사실은 한 번 참이 되면 이후의 checking/downloading/error 같은
 * 진행성 이벤트로 절대 덮어써지지 않는다(브리프 요구사항: update-downloaded 팩트 보존).
 *
 * phase 는 트레이 메뉴에는 노출하지 않고(조용한 배경 확인) 디버깅/로그용으로만 쓰인다.
 * 메뉴 노출 여부는 오직 ready 로만 결정한다(updateMenuItems 참조).
 */
function createUpdateState() {
  const state = { phase: 'idle', ready: false }

  function setChecking() {
    if (state.ready) return // ready 사실 보존 — 후속 확인 사이클로 되돌리지 않는다
    state.phase = 'checking'
  }

  function setDownloading() {
    if (state.ready) return
    state.phase = 'downloading'
  }

  function setDownloaded() {
    state.phase = 'downloaded'
    state.ready = true
  }

  function setError(message) {
    if (state.ready) return
    state.phase = 'error'
    state.message = message
  }

  return {
    get phase() {
      return state.phase
    },
    get ready() {
      return state.ready
    },
    setChecking,
    setDownloading,
    setDownloaded,
    setError,
  }
}

/**
 * 업데이트 상태로부터 트레이 메뉴에 추가할 항목 배열을 계산한다(순수 함수).
 * ready 가 아니면 아무 항목도 추가하지 않는다(조용히 진행) — ready 가 되면
 * separator + "업데이트 설치 후 재시작" 항목을 추가한다. 클릭은 사용자 결정이며
 * 자동으로 재시작·설치하지 않는다(handlers.onInstall 이 quitAndInstall 을 담당).
 *
 * @param {{ phase: string, ready: boolean }} state
 * @param {{ onInstall: () => void }} handlers
 * @returns {Array<Record<string, unknown>>}
 */
function updateMenuItems(state, handlers) {
  if (!state.ready) return []
  return [
    { type: 'separator' },
    {
      label: '업데이트 설치 후 재시작',
      click: () => handlers.onInstall(),
    },
  ]
}

module.exports = { createUpdateState, updateMenuItems }
