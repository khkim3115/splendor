'use strict'
const fs = require('fs')
const path = require('path')

const DEFAULTS = {
  theme: 'dark',
  opacity: 100,
  pinned: false,
  winPos: null,
  bossKey: 'CommandOrControl+Alt+Space',
  autostart: true,
}

function settingsPath(userDataDir) {
  return path.join(userDataDir, 'settings.json')
}

/** 기본값에 파일값을 병합해 반환(파일 없음/손상 시 기본값). */
function readSettings(userDataDir) {
  try {
    const raw = fs.readFileSync(settingsPath(userDataDir), 'utf8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

/** patch 를 병합해 원자적으로 저장하고 병합 결과를 반환. */
function writeSettings(userDataDir, patch) {
  const next = { ...readSettings(userDataDir), ...patch }
  const file = settingsPath(userDataDir)
  const tmp = file + '.tmp'
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  fs.renameSync(tmp, file)
  return next
}

module.exports = { readSettings, writeSettings, DEFAULTS }
