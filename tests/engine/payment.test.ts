import { describe, expect, it } from 'vitest'
import { canAfford, canonicalPayment, isValidPayment, paymentNeed } from '../../src/engine/payment'
import type { Card, PlayerState } from '../../src/engine/types'
import { gems, tokens } from '../helpers'

const card = (cost: Parameters<typeof gems>[0]): Card => ({
  id: 0,
  tier: 1,
  points: 0,
  bonus: 'white',
  cost: gems(cost),
})

const player = (
  t: Parameters<typeof tokens>[0] = {},
  bonuses: Parameters<typeof gems>[0] = {},
): PlayerState => ({
  tokens: tokens(t),
  purchased: [],
  reserved: [],
  nobles: [],
  bonuses: gems(bonuses),
  prestige: 0,
})

describe('§4.4.1 지불 판정 (테이블 주도)', () => {
  it('§4.4.1-1: need = max(0, cost - bonus) — 보너스 초과분은 이월되지 않는다', () => {
    expect(paymentNeed(player({}, { red: 2 }), card({ red: 3, green: 1 }))).toEqual(
      gems({ red: 1, green: 1 }),
    )
    expect(paymentNeed(player({}, { red: 5 }), card({ red: 3 }))).toEqual(gems())
  })

  const AFFORD_CASES: readonly {
    name: string
    cost: Parameters<typeof gems>[0]
    t: Parameters<typeof tokens>[0]
    bonuses: Parameters<typeof gems>[0]
    afford: boolean
  }[] = [
    { name: '보석 정확히 일치', cost: { red: 2, blue: 1 }, t: { red: 2, blue: 1 }, bonuses: {}, afford: true },
    { name: '보석 1개 부족', cost: { red: 2, blue: 1 }, t: { red: 2 }, bonuses: {}, afford: false },
    { name: '부족분을 황금으로', cost: { red: 2, blue: 1 }, t: { red: 2, gold: 1 }, bonuses: {}, afford: true },
    { name: '황금도 모자람', cost: { red: 3 }, t: { red: 1, gold: 1 }, bonuses: {}, afford: false },
    { name: '§5.1 보너스 할인', cost: { red: 3, blue: 1 }, t: { blue: 1 }, bonuses: { red: 3 }, afford: true },
    { name: '§4.4.1-5 전액 보너스 = 무료 구매', cost: { red: 2 }, t: {}, bonuses: { red: 2 }, afford: true },
    { name: '빈손 + 비용 있음', cost: { white: 1 }, t: {}, bonuses: {}, afford: false },
    { name: '황금만으로 전액', cost: { green: 2 }, t: { gold: 2 }, bonuses: {}, afford: true },
  ]

  for (const c of AFFORD_CASES) {
    it(`§4.4.1-3 canAfford: ${c.name} → ${c.afford}`, () => {
      expect(canAfford(player(c.t, c.bonuses), card(c.cost))).toBe(c.afford)
    })
  }

  it('§4.4.1-4 canonicalPayment: 보석 우선, 황금은 부족분에만', () => {
    expect(canonicalPayment(player({ red: 1, gold: 2 }), card({ red: 3 }))).toEqual(
      tokens({ red: 1, gold: 2 }),
    )
    expect(canonicalPayment(player({ red: 5, gold: 2 }), card({ red: 3 }))).toEqual(
      tokens({ red: 3 }),
    )
    expect(canonicalPayment(player({}, { red: 2 }), card({ red: 2 }))).toEqual(tokens())
  })

  it('canonicalPayment는 항상 isValidPayment를 통과한다 (canAfford 전제)', () => {
    for (const c of AFFORD_CASES.filter((x) => x.afford)) {
      const p = player(c.t, c.bonuses)
      expect(isValidPayment(p, card(c.cost), canonicalPayment(p, card(c.cost)))).toBe(true)
    }
  })
})

describe('§4.4.1-4 / §9-L 지불 구성 검증', () => {
  it('색별 초과 지불은 거부된다', () => {
    expect(isValidPayment(player({ red: 5 }), card({ red: 2 }), tokens({ red: 3 }))).toBe(false)
  })

  it('보유량을 넘는 지불은 거부된다', () => {
    expect(isValidPayment(player({ red: 1, gold: 1 }), card({ red: 2 }), tokens({ red: 2 }))).toBe(
      false,
    )
  })

  it('황금은 색별 부족분의 총합과 정확히 일치해야 한다', () => {
    const p = player({ red: 1, gold: 3 })
    expect(isValidPayment(p, card({ red: 3 }), tokens({ red: 1, gold: 2 }))).toBe(true)
    expect(isValidPayment(p, card({ red: 3 }), tokens({ red: 1, gold: 3 }))).toBe(false)
    expect(isValidPayment(p, card({ red: 3 }), tokens({ red: 1, gold: 1 }))).toBe(false)
  })

  it('§9-L: 보석을 갖고 있어도 그 자리에 황금을 대신 지불할 수 있다', () => {
    const p = player({ red: 2, gold: 2 })
    expect(isValidPayment(p, card({ red: 2 }), tokens({ red: 2 }))).toBe(true)
    expect(isValidPayment(p, card({ red: 2 }), tokens({ red: 1, gold: 1 }))).toBe(true)
    expect(isValidPayment(p, card({ red: 2 }), tokens({ gold: 2 }))).toBe(true)
  })

  it('§4.4.1-5: 전액 보너스 커버 시 토큰 0개 지불이 유효하다', () => {
    expect(isValidPayment(player({}, { red: 2 }), card({ red: 2 }), tokens())).toBe(true)
  })

  it('음수/비정수 지불은 거부된다', () => {
    const p = player({ red: 3, gold: 1 })
    expect(isValidPayment(p, card({ red: 2 }), tokens({ red: -1, gold: 3 }))).toBe(false)
    expect(isValidPayment(p, card({ red: 2 }), tokens({ red: 1.5, gold: 0.5 }))).toBe(false)
  })
})
