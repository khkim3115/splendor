import { describe, expect, it } from 'vitest'
import { GEM_CODE, gemCode } from '../../src/tray/format'
import { GEM_COLORS, TOKEN_COLORS } from '../../src/engine'

describe('gemCode / GEM_CODE', () => {
  it('한글 5색 코드 = 흰파초빨검', () => {
    expect(GEM_COLORS.map((c) => gemCode(c, 'ko')).join('')).toBe('흰파초빨검')
  })

  it('영문 5색 코드 = WBGRK (검정=K)', () => {
    expect(GEM_COLORS.map((c) => gemCode(c, 'en')).join('')).toBe('WBGRK')
  })

  it('황금(조커)은 ko 노 / en Y', () => {
    expect(gemCode('gold', 'ko')).toBe('노')
    expect(gemCode('gold', 'en')).toBe('Y')
  })

  it('GEM_CODE는 6색(gold 포함) 전부를 두 언어로 정의한다', () => {
    for (const lang of ['ko', 'en'] as const) {
      for (const c of TOKEN_COLORS) {
        expect(typeof GEM_CODE[lang][c]).toBe('string')
        expect(GEM_CODE[lang][c].length).toBeGreaterThan(0)
      }
    }
  })
})
