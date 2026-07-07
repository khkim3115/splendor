'use strict'

/**
 * 목표 크기로 리사이즈하되 창의 우하단을 앵커로 유지하고 작업영역 안으로 클램프한다.
 * @param {{w:number,h:number}} target 목표 폭·높이
 * @param {{right:number,bottom:number}} anchor 현재 창 우하단(디스플레이 좌표)
 * @param {{x:number,y:number,width:number,height:number}} workArea 대상 디스플레이 작업영역
 */
function clampBounds(target, anchor, workArea) {
  const width = Math.round(target.w)
  const height = Math.round(target.h)
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

module.exports = { clampBounds }
