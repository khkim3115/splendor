import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldHideOnBlur, BLUR_GUARD_MS } = require('../../desktop/lib/windowPolicy.cjs') as {
  shouldHideOnBlur: (args: {
    now: number
    shownAt: number
    pinned: boolean
    devtoolsOpen: boolean
  }) => boolean
  BLUR_GUARD_MS: number
}

describe('shouldHideOnBlur', () => {
  it('표시 가드 경과 + 비고정 + devtools 닫힘 → 숨김', () => {
    expect(
      shouldHideOnBlur({ now: 1_000, shownAt: 0, pinned: false, devtoolsOpen: false }),
    ).toBe(true)
  })

  it('pinned 면 숨기지 않는다', () => {
    expect(
      shouldHideOnBlur({ now: 1_000, shownAt: 0, pinned: true, devtoolsOpen: false }),
    ).toBe(false)
  })

  it('표시 직후 가드(300ms) 이내면 숨기지 않는다', () => {
    expect(
      shouldHideOnBlur({ now: 100, shownAt: 0, pinned: false, devtoolsOpen: false }),
    ).toBe(false)
  })

  it('가드 경계값(정확히 300ms)은 아직 가드 내(숨기지 않음)', () => {
    expect(
      shouldHideOnBlur({ now: BLUR_GUARD_MS, shownAt: 0, pinned: false, devtoolsOpen: false }),
    ).toBe(false)
  })

  it('가드 경계 다음 순간(300ms+1)은 숨김', () => {
    expect(
      shouldHideOnBlur({
        now: BLUR_GUARD_MS + 1,
        shownAt: 0,
        pinned: false,
        devtoolsOpen: false,
      }),
    ).toBe(true)
  })

  it('devtools 열려 있으면 숨기지 않는다', () => {
    expect(
      shouldHideOnBlur({ now: 1_000, shownAt: 0, pinned: false, devtoolsOpen: true }),
    ).toBe(false)
  })

  it('pinned·가드·devtools 모두 겹쳐도(우선순위 무관) 숨기지 않는다', () => {
    expect(
      shouldHideOnBlur({ now: 50, shownAt: 0, pinned: true, devtoolsOpen: true }),
    ).toBe(false)
  })
})
