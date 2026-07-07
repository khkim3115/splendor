import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { clampBounds } = require('../../desktop/lib/position.cjs') as {
  clampBounds: (
    target: { w: number; h: number },
    anchor: { right: number; bottom: number },
    workArea: { x: number; y: number; width: number; height: number },
  ) => { x: number; y: number; width: number; height: number }
}

const WA = { x: 0, y: 0, width: 1920, height: 1040 } // 작업영역(태스크바 제외)

describe('clampBounds', () => {
  it('우하단 앵커를 유지하며 커진다(오른쪽·아래 고정)', () => {
    // 현재 우하단이 (1900, 1000). 250x178 → 260x440 로 확장.
    const b = clampBounds({ w: 260, h: 440 }, { right: 1900, bottom: 1000 }, WA)
    expect(b.width).toBe(260)
    expect(b.height).toBe(440)
    expect(b.x).toBe(1900 - 260) // 우변 1900 유지
    expect(b.y).toBe(1000 - 440) // 하변 1000 유지
  })
  it('왼쪽으로 넘치면 작업영역 안으로 클램프', () => {
    const b = clampBounds({ w: 400, h: 200 }, { right: 300, bottom: 500 }, WA)
    expect(b.x).toBe(0) // x 가 음수가 되지 않는다
    expect(b.width).toBe(400)
  })
  it('위로 넘치면 y 를 작업영역 상단으로 클램프', () => {
    const b = clampBounds({ w: 200, h: 600 }, { right: 500, bottom: 400 }, WA)
    expect(b.y).toBe(0)
  })
  it('오른쪽으로 넘치면 우변을 작업영역 우단으로 클램프', () => {
    const b = clampBounds({ w: 200, h: 100 }, { right: 2000, bottom: 500 }, WA)
    expect(b.x + b.width).toBe(WA.width) // 1920
  })
  it('아래로 넘치면 하변을 작업영역 하단으로 클램프', () => {
    const b = clampBounds({ w: 200, h: 100 }, { right: 500, bottom: 2000 }, WA)
    expect(b.y + b.height).toBe(WA.height) // 1040
  })
  it('작업영역 오프셋(멀티모니터)을 반영한다', () => {
    const wa = { x: 1920, y: 0, width: 1920, height: 1040 }
    const b = clampBounds({ w: 300, h: 300 }, { right: 1000, bottom: 300 }, wa)
    expect(b.x).toBe(1920) // 왼쪽 넘침 → 두 번째 모니터 좌단
  })
})
