'use strict'
const MIN = 30
const MAX = 100

/** 임의 입력 → 30..100 정수 퍼센트. 비수치는 100(불투명). */
function clampPercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return MAX
  return Math.min(MAX, Math.max(MIN, Math.round(n)))
}

/** 퍼센트 → win.setOpacity 용 0~1(먼저 클램프). */
function clampOpacity(value) {
  return clampPercent(value) / 100
}

module.exports = { clampPercent, clampOpacity, MIN, MAX }
