import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { BG, nextTheme, bgFor, normalizeTheme } = require('../../desktop/lib/theme.cjs') as {
  BG: { dark: string; light: string }
  nextTheme: (t: 'light' | 'dark') => 'light' | 'dark'
  bgFor: (t: 'light' | 'dark') => string
  normalizeTheme: (mode: unknown) => 'light' | 'dark'
}

describe('theme', () => {
  it('BG 팔레트는 공유 계약과 일치한다', () => {
    expect(BG.dark).toBe('#14161a')
    expect(BG.light).toBe('#f4f4f5')
  })
  it('nextTheme 는 dark↔light 를 토글', () => {
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
  })
  it('bgFor 는 테마별 배경색', () => {
    expect(bgFor('dark')).toBe('#14161a')
    expect(bgFor('light')).toBe('#f4f4f5')
  })
  it('normalizeTheme 는 light 만 light, 그 외 전부 dark', () => {
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme('dark')).toBe('dark')
    expect(normalizeTheme(undefined)).toBe('dark')
    expect(normalizeTheme('bogus')).toBe('dark')
  })
})
