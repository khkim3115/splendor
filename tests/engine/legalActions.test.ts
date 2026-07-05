import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { canonicalPayment, isValidPayment } from '../../src/engine/payment'
import { CARDS } from '../../src/engine/data/cards'
import { isLegal, legalActions } from '../../src/engine/legal'
import { playerView } from '../../src/engine/view'
import type { Action } from '../../src/engine/types'
import { baseState, gems, patchPlayer, tokens } from '../helpers'

const countByType = (actions: readonly Action[]): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const a of actions) out[a.type] = (out[a.type] ?? 0) + 1
  return out
}

describe('legalActions — play phase 완전 열거', () => {
  it('초기 상태(2인): A 10조합 + B 5색 + 예약 15 + 구매 0 = 30개', () => {
    const actions = legalActions(baseState(2))
    expect(countByType(actions)).toEqual({
      TAKE_DIFFERENT: 10, // C(5,3)
      TAKE_SAME: 5,
      RESERVE_BOARD: 12,
      RESERVE_DECK: 3,
    })
  })

  it('반환된 모든 액션은 isLegal이고 throw 없이 적용된다', () => {
    const s = baseState(3, 7)
    for (const a of legalActions(s)) {
      expect(isLegal(s, a), JSON.stringify(a)).toBe(true)
      expect(() => applyAction(s, a)).not.toThrow()
    }
  })

  it('§4.1 엄격 해석: 2색만 남으면 TAKE_DIFFERENT는 2색 조합 1개뿐', () => {
    const s = baseState(2, 1, { supply: tokens({ red: 2, blue: 1, gold: 5 }) })
    const takes = legalActions(s).filter((a) => a.type === 'TAKE_DIFFERENT')
    expect(takes).toEqual([{ type: 'TAKE_DIFFERENT', colors: ['blue', 'red'] }])
  })

  it('§4.2: supply ≥ 4인 색만 TAKE_SAME에 나타난다', () => {
    const s = baseState(2, 1, { supply: tokens({ red: 4, blue: 3, green: 5, gold: 5 }) })
    const same = legalActions(s).filter((a) => a.type === 'TAKE_SAME')
    expect(same.map((a) => (a.type === 'TAKE_SAME' ? a.color : ''))).toEqual(['green', 'red'])
  })

  it('§9-D: 예약 3장이면 예약 액션이 열거되지 않는다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, {
      reserved: [
        { cardId: s.decks[2]![0]!, fromDeck: true },
        { cardId: s.decks[2]![1]!, fromDeck: true },
        { cardId: s.decks[2]![2]!, fromDeck: true },
      ],
    })
    const types = new Set(legalActions(s).map((a) => a.type))
    expect(types.has('RESERVE_BOARD')).toBe(false)
    expect(types.has('RESERVE_DECK')).toBe(false)
  })

  it('§4.4: 구매는 canonicalPayment 1개로 대표되고 유효하다', () => {
    let s = baseState(2)
    const cardId = s.board[0]![0]!
    s = patchPlayer(s, 0, { tokens: tokens({ ...CARDS[cardId]!.cost }) })
    const purchases = legalActions(s).filter(
      (a) => a.type === 'PURCHASE' && a.cardId === cardId,
    )
    expect(purchases).toHaveLength(1)
    const p = purchases[0]!
    if (p.type === 'PURCHASE') {
      expect(p.payment).toEqual(canonicalPayment(s.players[0]!, CARDS[cardId]!))
      expect(isValidPayment(s.players[0]!, CARDS[cardId]!, p.payment)).toBe(true)
    }
  })

  it('마스킹된 상태에서도 동작하며 HIDDEN 예약 카드는 구매 후보에서 제외된다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 1, { reserved: [{ cardId: s.decks[2]![0]!, fromDeck: true }] })
    const view = playerView({ ...s, currentPlayer: 1 }, 0) // P0 시점에서 P1 차례를 탐색
    const actions = legalActions(view)
    expect(actions.length).toBeGreaterThan(0)
    expect(actions.every((a) => a.type !== 'PURCHASE' || a.cardId >= 0)).toBe(true)
  })

  it('§9-G: 합법 행동이 공집합이면 [PASS] 하나만 반환한다', () => {
    let s = baseState(2, 1, { supply: tokens() })
    for (const i of [0, 1]) {
      s = patchPlayer(s, i, {
        tokens: tokens(),
        reserved: [
          { cardId: s.decks[2]![0]!, fromDeck: true },
          { cardId: s.decks[2]![1]!, fromDeck: true },
          { cardId: s.decks[2]![2]!, fromDeck: true },
        ],
      })
    }
    expect(legalActions(s)).toEqual([{ type: 'PASS' }])
  })
})

describe('legalActions — discard/chooseNoble/gameOver phase', () => {
  it('discard: 반납 조합을 전수 열거하고 전부 적용 가능하다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4, green: 2 }) })
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 3 })

    const actions = legalActions(mid.state)
    // 보유: white4 blue4 green3 red1 black1 → 3개 반납 조합 전수
    expect(actions.length).toBeGreaterThan(10)
    expect(actions.every((a) => a.type === 'DISCARD')).toBe(true)
    const seen = new Set(actions.map((a) => JSON.stringify(a)))
    expect(seen.size).toBe(actions.length) // 중복 없음
    for (const a of actions) {
      expect(isLegal(mid.state, a)).toBe(true)
      expect(() => applyAction(mid.state, a)).not.toThrow()
    }
  })

  it('discard: mustDiscard 1이면 보유 색 수만큼 열거된다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4, gold: 2 }) })
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 3 })

    // 대신 mustDiscard=1 케이스: 9개 보유에서 2개만 얻도록 재구성
    let s2 = baseState(2, 2)
    s2 = patchPlayer(s2, 0, { tokens: tokens({ white: 4, blue: 4, gold: 1 }) }) // 9개
    const mid2 = applyAction(s2, { type: 'TAKE_SAME', color: 'red' }) // 11개
    expect(mid2.state.phase).toEqual({ kind: 'discard', mustDiscard: 1 })
    const combos = legalActions(mid2.state)
    // 보유 색: white, blue, red, gold → 4가지 단일 반납
    expect(combos).toHaveLength(4)
  })

  it('chooseNoble: 후보 귀족 수만큼 CHOOSE_NOBLE을 반환한다', () => {
    let s = baseState(2, 1, { nobles: [0, 1] })
    s = patchPlayer(s, 0, { bonuses: gems({ green: 3, red: 4, black: 4 }) })
    const mid = applyAction(s, { type: 'TAKE_SAME', color: 'red' })
    expect(mid.state.phase.kind).toBe('chooseNoble')
    expect(legalActions(mid.state)).toEqual([
      { type: 'CHOOSE_NOBLE', nobleId: 0 },
      { type: 'CHOOSE_NOBLE', nobleId: 1 },
    ])
  })

  it('gameOver: 빈 배열을 반환한다', () => {
    const s = baseState(2, 1, {
      phase: { kind: 'gameOver', result: { winners: [0], scores: [], reason: 'prestige15' } },
    })
    expect(legalActions(s)).toEqual([])
  })
})
