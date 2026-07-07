'use strict'

// 기본 보스키 — settings.cjs DEFAULTS.bossKey 와 동일해야 한다(단일 소스 아님에 주의:
// 두 값은 계약으로 일치시킨다. settings.cjs 는 영속 스키마 기본값, 이쪽은 Electron
// globalShortcut 등록 로직의 기본값 — 문서화된 계약으로 동기화한다).
const DEFAULT_BOSS_KEY = 'CommandOrControl+Alt+Space'

/**
 * 패널 표시 여부에 따른 다음 동작을 결정하는 순수 판별식(토글 로직의 핵심).
 * @param {boolean} isVisible 현재 창이 보이는 상태인지
 * @returns {'hide'|'show'}
 */
function nextVisibility(isVisible) {
  return isVisible ? 'hide' : 'show'
}

/**
 * globalShortcut 에 accel 을 등록한다. 실패(충돌로 register()가 false 반환) 또는
 * register() 자체가 예외를 던지는 경우(잘못된 가속기 문자열 등) 모두 크래시 없이
 * false 를 반환한다 — 호출자가 실패를 안내/복구할 수 있게 한다.
 * @param {{register:Function}} globalShortcut electron.globalShortcut 또는 테스트용 스텁
 * @param {string} accel
 * @param {Function} cb 등록 성공 시 트리거될 콜백(보통 togglePanel)
 * @returns {boolean} 성공 여부
 */
function registerBossKey(globalShortcut, accel, cb) {
  try {
    return Boolean(globalShortcut.register(accel, cb))
  } catch {
    return false
  }
}

/**
 * 보스키를 nextAccel 로 교체한다. 기존 바인딩을 모두 해제한 뒤 새 조합을 등록하고,
 * 실패(충돌) 시에는 기존 조합(currentAccel)으로 즉시 복구해 바인딩을 잃지 않는다.
 * @param {{register:Function, unregister:Function, unregisterAll:Function}} globalShortcut
 * @param {string} currentAccel 현재(기존) 보스키 — 실패 시 복구 대상
 * @param {string} nextAccel 새로 시도할 보스키
 * @param {Function} cb 등록 성공 시 트리거될 콜백(보통 togglePanel)
 * @returns {{ok: boolean, accel: string}} 성공 여부와 최종 확정된 accel
 *   (성공 시 nextAccel, 실패 시 currentAccel — 항상 "현재 유효한 바인딩"을 가리킨다)
 */
function setBossKey(globalShortcut, currentAccel, nextAccel, cb) {
  globalShortcut.unregisterAll()
  const ok = registerBossKey(globalShortcut, nextAccel, cb)
  if (ok) {
    return { ok: true, accel: nextAccel }
  }
  // 실패: 기존 조합으로 복구 시도(이 복구 자체의 성패와 무관하게 setBossKey 는
  // "새 조합 적용 실패"를 보고한다 — 호출자는 accel 필드로 현재 유효 바인딩을 안다).
  registerBossKey(globalShortcut, currentAccel, cb)
  return { ok: false, accel: currentAccel }
}

module.exports = { DEFAULT_BOSS_KEY, nextVisibility, registerBossKey, setBossKey }
