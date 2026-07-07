'use strict'

// 표시 직후 blur 무시 가드(ms) — 트레이 좌클릭/포커스 이동 순간 발생하는
// 의도치 않은 blur 이벤트로 즉시 숨겨지는 것을 막는다.
const BLUR_GUARD_MS = 300

/**
 * blur 이벤트에서 창을 숨길지 판정하는 순수 함수.
 * - pinned(고정) 이면 숨기지 않는다.
 * - 표시(shownAt) 후 BLUR_GUARD_MS 이내면 숨기지 않는다(경계값 포함 — 가드 내).
 * - devtools 가 열려 있으면 숨기지 않는다(포커스가 devtools 로 이동한 blur).
 * - 그 외에는 숨긴다.
 *
 * @param {{ now: number, shownAt: number, pinned: boolean, devtoolsOpen: boolean }} args
 * @returns {boolean}
 */
function shouldHideOnBlur({ now, shownAt, pinned, devtoolsOpen }) {
  if (pinned) return false
  if (now - shownAt <= BLUR_GUARD_MS) return false
  if (devtoolsOpen) return false
  return true
}

module.exports = { shouldHideOnBlur, BLUR_GUARD_MS }
