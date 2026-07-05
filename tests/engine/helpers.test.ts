import { describe, expect, it } from 'vitest'
import { canReserve, excessTokens, paymentBounds } from '../../src/engine/helpers'
import { findCard } from '../helpers'
import { baseState, gems, patchPlayer, placeOnBoard, tokens } from '../helpers'

describe('UI 보조 순수 함수 (engine/helpers.ts)', () => {
  it('excessTokens: 10개 이하 0, 초과분만큼 반환', () => {
    const s = baseState(2)
    expect(excessTokens(s.players[0]!)).toBe(0)
    const p10 = patchPlayer(s, 0, { tokens: tokens({ white: 5, blue: 5 }) })
    expect(excessTokens(p10.players[0]!)).toBe(0)
    const p13 = patchPlayer(s, 0, { tokens: tokens({ white: 5, blue: 5, gold: 3 }) })
    expect(excessTokens(p13.players[0]!)).toBe(3)
  })

  it('canReserve: 예약 여유 + 예약할 카드 존재 (§4.3, §9-D/E)', () => {
    const s = baseState(2)
    expect(canReserve(s, 0)).toBe(true)

    const full = patchPlayer(s, 0, {
      reserved: [
        { cardId: s.decks[2]![0]!, fromDeck: true },
        { cardId: s.decks[2]![1]!, fromDeck: true },
        { cardId: s.decks[2]![2]!, fromDeck: true },
      ],
    })
    expect(canReserve(full, 0)).toBe(false)

    const noCards = {
      ...s,
      decks: [[], [], []] as unknown as typeof s.decks,
      board: s.board.map((r) => r.map(() => null)),
    }
    expect(canReserve(noCards, 0)).toBe(false)
    expect(canReserve(s, 99)).toBe(false) // 잘못된 인덱스 방어
  })

  it('paymentBounds: 실요구량·최소 황금·대체 가능 색을 정확히 계산한다 (§4.4.1, §9-L)', () => {
    const target = findCard((c) => c.tier === 1 && c.cost.red === 3 && c.points === 0)
    let s = placeOnBoard(baseState(2), target.id)
    s = patchPlayer(s, 0, {
      tokens: tokens({ red: 1, gold: 2 }),
      bonuses: gems({ red: 1 }),
    })
    const b = paymentBounds(s, 0, target.id)
    expect(b.need).toEqual(gems({ red: 2 })) // 비용 3 - 보너스 1
    expect(b.minGold).toBe(1) // 보석 1개 부족
    expect(b.affordable).toBe(true)
    expect(b.goldFlexibleColors).toEqual(['red']) // 보석 지불분을 황금으로 대체 가능
  })

  it('paymentBounds: 전액 보너스 커버면 need 0·minGold 0', () => {
    const target = findCard((c) => c.tier === 1 && c.cost.red === 3 && c.points === 0)
    let s = placeOnBoard(baseState(2), target.id)
    s = patchPlayer(s, 0, { bonuses: gems({ red: 3 }) })
    const b = paymentBounds(s, 0, target.id)
    expect(b).toEqual({
      affordable: true,
      need: gems(),
      minGold: 0,
      goldFlexibleColors: [],
    })
  })

  it('paymentBounds: 유효하지 않은 카드/플레이어는 affordable=false', () => {
    const s = baseState(2)
    expect(paymentBounds(s, 0, -1).affordable).toBe(false)
    expect(paymentBounds(s, 99, 0).affordable).toBe(false)
  })
})
