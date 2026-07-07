import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { clampPercent, clampOpacity } = require('../../desktop/lib/opacity.cjs') as {
  clampPercent: (v: number) => number
  clampOpacity: (v: number) => number
}

describe('clampPercent', () => {
  it('30 미만은 30으로 바닥', () => {
    expect(clampPercent(0)).toBe(30)
    expect(clampPercent(29)).toBe(30)
    expect(clampPercent(-5)).toBe(30)
  })
  it('100 초과는 100으로 천장', () => {
    expect(clampPercent(150)).toBe(100)
  })
  it('범위 안은 정수로 반올림', () => {
    expect(clampPercent(55.4)).toBe(55)
    expect(clampPercent(72)).toBe(72)
  })
  it('NaN·비수치는 100(기본 불투명)', () => {
    expect(clampPercent(NaN)).toBe(100)
    expect(clampPercent(undefined as unknown as number)).toBe(100)
  })
})

describe('clampOpacity', () => {
  it('퍼센트를 0~1 로 변환(30→0.3)', () => {
    expect(clampOpacity(30)).toBeCloseTo(0.3)
    expect(clampOpacity(100)).toBeCloseTo(1)
  })
  it('바닥 클램프 후 변환(10→0.3)', () => {
    expect(clampOpacity(10)).toBeCloseTo(0.3)
  })
})
