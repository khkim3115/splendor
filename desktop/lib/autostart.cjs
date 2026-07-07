'use strict'

/** setLoginItemSettings 인자를 구성한다. ON 이면 숨김 부팅(--hidden). */
function loginItemArgs(hidden) {
  return hidden
    ? { openAtLogin: true, openAsHidden: true, args: ['--hidden'] }
    : { openAtLogin: false, openAsHidden: false, args: [] }
}

/** 부팅 시 숨김 시작 여부(--hidden 플래그). */
function startsHidden(argv) {
  return argv.includes('--hidden')
}

module.exports = { loginItemArgs, startsHidden }
