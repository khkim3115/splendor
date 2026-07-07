import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { clampBounds, isUserMove, isValidResize } = require('../../desktop/lib/position.cjs') as {
  clampBounds: (
    target: { w: number; h: number },
    anchor: { right: number; bottom: number },
    workArea: { x: number; y: number; width: number; height: number },
  ) => { x: number; y: number; width: number; height: number }
  isUserMove: (
    current: { x: number; y: number },
    lastProgrammatic: { x: number; y: number } | null,
    tol?: number,
  ) => boolean
  isValidResize: (input: { w: number; h: number }) => boolean
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
  it('타겟이 작업영역보다 큰 경우 역전 가드가 적용되어 좌상단(workArea.x/y)에 안착한다', () => {
    // work area 보다 큰 target: width/height 를 workArea 로 클램프한 뒤에도
    // anchor 기반 x/y 계산에서 minX>maxX 역전이 발생할 수 있는 케이스.
    const b = clampBounds({ w: 3000, h: 2000 }, { right: 1900, bottom: 1000 }, WA)
    // width/height 는 workArea 크기로 클램프된다(Fix 3).
    expect(b.width).toBe(WA.width)
    expect(b.height).toBe(WA.height)
    // 역전 가드(Math.max(minX, maxX)) 로 인해 x/y 는 정확히 workArea 좌상단.
    expect(b.x).toBe(WA.x)
    expect(b.y).toBe(WA.y)
  })
  it('폭·높이를 작업영역 크기로 클램프한다(태스크바 위 겹침 방지)', () => {
    const b = clampBounds({ w: 5000, h: 5000 }, { right: 1900, bottom: 1000 }, WA)
    expect(b.width).toBe(WA.width)
    expect(b.height).toBe(WA.height)
  })
})

describe('isUserMove', () => {
  it('현재 위치가 마지막 프로그램 설정 위치와 동일하면 사용자 이동이 아니다', () => {
    expect(isUserMove({ x: 100, y: 200 }, { x: 100, y: 200 })).toBe(false)
  })
  it('허용 오차(tol) 이내의 차이는 사용자 이동이 아니다', () => {
    expect(isUserMove({ x: 101, y: 199 }, { x: 100, y: 200 }, 2)).toBe(false)
  })
  it('허용 오차를 초과하는 차이는 사용자 이동이다', () => {
    expect(isUserMove({ x: 150, y: 200 }, { x: 100, y: 200 }, 2)).toBe(true)
  })
  it('y 축만 오차를 초과해도 사용자 이동이다', () => {
    expect(isUserMove({ x: 100, y: 260 }, { x: 100, y: 200 }, 2)).toBe(true)
  })
  it('마지막 프로그램 위치가 없으면(null) 사용자 이동으로 간주한다', () => {
    expect(isUserMove({ x: 100, y: 200 }, null)).toBe(true)
  })
  it('기본 허용오차는 2px 이다', () => {
    expect(isUserMove({ x: 102, y: 200 }, { x: 100, y: 200 })).toBe(false)
    expect(isUserMove({ x: 103, y: 200 }, { x: 100, y: 200 })).toBe(true)
  })
})

describe('isValidResize', () => {
  it('유한한 양수 w/h 는 유효하다', () => {
    expect(isValidResize({ w: 250, h: 200 })).toBe(true)
  })
  it('NaN 이면 무효하다', () => {
    expect(isValidResize({ w: NaN, h: 200 })).toBe(false)
    expect(isValidResize({ w: 250, h: NaN })).toBe(false)
  })
  it('0 이하이면 무효하다', () => {
    expect(isValidResize({ w: 0, h: 200 })).toBe(false)
    expect(isValidResize({ w: 250, h: -10 })).toBe(false)
  })
  it('Infinity 이면 무효하다', () => {
    expect(isValidResize({ w: Infinity, h: 200 })).toBe(false)
  })
  it('누락된 값이면 무효하다', () => {
    expect(isValidResize({ w: undefined, h: 200 } as any)).toBe(false)
    expect(isValidResize({} as any)).toBe(false)
  })
  it('문자열 등 숫자가 아닌 값이면 무효하다', () => {
    expect(isValidResize({ w: '250' as any, h: 200 })).toBe(false)
  })
})
