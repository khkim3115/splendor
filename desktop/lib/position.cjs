'use strict'

/**
 * 목표 크기로 리사이즈하되 창의 우하단을 앵커로 유지하고 작업영역 안으로 클램프한다.
 * @param {{w:number,h:number}} target 목표 폭·높이
 * @param {{right:number,bottom:number}} anchor 현재 창 우하단(디스플레이 좌표)
 * @param {{x:number,y:number,width:number,height:number}} workArea 대상 디스플레이 작업영역
 */
function clampBounds(target, anchor, workArea) {
  // 폭·높이는 요청값을 반올림한 뒤 작업영역 크기를 넘지 않도록 클램프한다(Fix 3):
  // 병적으로 큰 target 이 태스크바 위까지 겹치는 창을 만들 수 없다.
  const width = Math.min(Math.round(target.w), workArea.width)
  const height = Math.min(Math.round(target.h), workArea.height)
  // 우하단 앵커: 우변 = anchor.right, 하변 = anchor.bottom
  let x = anchor.right - width
  let y = anchor.bottom - height

  const minX = workArea.x
  const minY = workArea.y
  const maxX = workArea.x + workArea.width - width
  const maxY = workArea.y + workArea.height - height

  x = Math.min(Math.max(x, minX), Math.max(minX, maxX))
  y = Math.min(Math.max(y, minY), Math.max(minY, maxY))

  return { x, y, width, height }
}

/**
 * 프로그램 자체 이동(setBounds)과 사용자 드래그를 구분하는 순수 판별식.
 * `moved` 이벤트가 동기적으로 발생한다는 가정에 기대지 않는다 — 이벤트 발생 시점의
 * 실제 `win.getBounds()` 값을 마지막으로 프로그램이 세팅한 위치와 비교해, 그 차이가
 * 허용 오차(tol)를 넘어서는 경우에만 "사용자가 옮겼다"고 판단한다.
 * @param {{x:number,y:number}} current 이벤트 시점의 실제 현재 위치
 * @param {{x:number,y:number}|null} lastProgrammatic 마지막으로 프로그램이 setBounds 한 위치(없으면 null)
 * @param {number} [tol] 허용 오차(px). 기본 2px.
 * @returns {boolean} 사용자 이동이면 true(=persist 해야 함)
 */
function isUserMove(current, lastProgrammatic, tol = 2) {
  if (!lastProgrammatic) return true
  const dx = Math.abs(current.x - lastProgrammatic.x)
  const dy = Math.abs(current.y - lastProgrammatic.y)
  return dx > tol || dy > tol
}

/**
 * tray-resize IPC 로 들어온 목표 크기가 유효한지 검사하는 순수 판별식.
 * NaN/Infinity/0/음수/누락/숫자가 아닌 값은 모두 무효 — 그대로 setBounds 에 넘기면
 * Electron 이 미정의 동작(창 소실 등)을 보일 수 있으므로 호출부에서 조기 반환해야 한다.
 * @param {{w:number,h:number}} input
 * @returns {boolean} w/h 가 모두 유한한 양수이면 true
 */
function isValidResize(input) {
  if (!input) return false
  const { w, h } = input
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
}

module.exports = { clampBounds, isUserMove, isValidResize }
