import { describe, expect, it } from 'vitest'
import { GEM_CODE, cardCode, gemCode, playerLine } from '../../src/tray/format'
import { GEM_COLORS, TOKEN_COLORS } from '../../src/engine'
import { baseState, gems, patchPlayer, tokens } from '../helpers'
import type { Card } from '../../src/engine'

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

describe('cardCode', () => {
  it('명성보너스|비용 — 명성 있으면 앞에 숫자가 붙는다', () => {
    const card: Card = { id: 99, tier: 3, points: 3, bonus: 'green', cost: gems({ white: 3, red: 2, black: 1 }) }
    expect(cardCode(card, 'ko')).toBe('3초|흰3빨2검1')
    expect(cardCode(card, 'en')).toBe('3G|W3R2K1')
  })

  it('명성 0이면 명성 숫자 생략, 보너스|비용만', () => {
    const card: Card = { id: 98, tier: 1, points: 0, bonus: 'white', cost: gems({ red: 2, black: 1 }) }
    expect(cardCode(card, 'ko')).toBe('흰|빨2검1')
  })
})

describe('playerLine', () => {
  it('점수·보너스·토큰·예약 수를 한 줄로 요약한다', () => {
    const base = baseState(2, 42)
    const s = patchPlayer(base, 1, {
      prestige: 5,
      bonuses: gems({ white: 2, green: 1 }),
      tokens: tokens({ red: 3, gold: 1 }),
      reserved: [{ cardId: base.decks[0]![0]!, fromDeck: true }],
    })
    const line = playerLine(s, 1, 'ko')
    expect(line).toContain('5점')
    expect(line).toContain('흰2')
    expect(line).toContain('초1')
    expect(line).toContain('빨3')
    expect(line).toContain('노1')
    expect(line).toContain('예약1')
  })

  it('보너스·토큰이 없으면 자리표시 -, 점수/예약0도 항상 표기(en)', () => {
    const s = baseState(2, 42)
    const line = playerLine(s, 0, 'en')
    expect(line).toContain('0pt')
    expect(line).toContain('예약0')
  })
})
