'use strict'

const { updateMenuItems } = require('./updateState.cjs')

/**
 * 트레이 컨텍스트 메뉴 템플릿을 만드는 순수 함수 — electron 을 import 하지 않는다.
 * 실제 Menu.buildFromTemplate() 호출과 상태(settings/pinned 등) 읽기/쓰기는
 * main.js 가 담당하고, 이 함수는 상태를 받아 라벨·checked·enabled 만 계산한다.
 *
 * @param {{
 *   isLight: boolean,
 *   bossKey: string,
 *   pinned: boolean,
 *   hasCustomPos: boolean,
 *   autoOn: boolean,
 *   platform?: string,
 *   updateReady?: boolean,
 * }} state
 * @param {{
 *   onOpen: () => void,
 *   onToggleTheme: () => void,
 *   onChangeBossKey: () => void,
 *   onTogglePin: (checked: boolean) => void,
 *   onResetPosition: () => void,
 *   onToggleAutostart: (checked: boolean) => void,
 *   onQuit: () => void,
 *   onInstallUpdate?: () => void,
 * }} handlers
 * @returns {Array<Record<string, unknown>>} Menu.buildFromTemplate 에 그대로 넘길 템플릿
 */
function buildTrayTemplate(state, handlers) {
  const { isLight, bossKey, pinned, hasCustomPos, autoOn, platform, updateReady } = state
  const autostartLabel = platform === 'darwin' ? '로그인 시 자동 실행' : 'Windows 시작 시 자동 실행'

  // 업데이트 설치 항목(있으면 separator+메뉴)은 순수 함수 updateMenuItems(lib/updateState.cjs)
  // 에 위임 — ready 사실이 없으면(undefined/false) 빈 배열이라 기존 9항목 메뉴와 동일하다.
  const updateItems = updateMenuItems(
    { phase: updateReady ? 'downloaded' : 'idle', ready: Boolean(updateReady) },
    { onInstall: () => (handlers.onInstallUpdate ? handlers.onInstallUpdate() : undefined) },
  )

  return [
    { label: '열기', click: () => handlers.onOpen() },
    {
      label: '라이트 모드',
      type: 'checkbox',
      checked: isLight,
      click: () => handlers.onToggleTheme(),
    },
    { label: '보스키 변경 (' + bossKey + ')', click: () => handlers.onChangeBossKey() },
    { type: 'separator' },
    {
      label: '위치 고정',
      type: 'checkbox',
      checked: pinned,
      click: (item) => handlers.onTogglePin(item.checked),
    },
    {
      label: '위치 초기화',
      enabled: hasCustomPos,
      click: () => handlers.onResetPosition(),
    },
    {
      label: autostartLabel,
      type: 'checkbox',
      checked: autoOn,
      click: (item) => handlers.onToggleAutostart(item.checked),
    },
    { type: 'separator' },
    ...updateItems,
    { label: '종료', click: () => handlers.onQuit() },
  ]
}

module.exports = { buildTrayTemplate }
