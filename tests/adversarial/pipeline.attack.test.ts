// 적대적 테스트 — 턴 파이프라인: 반납과 귀족 (docs/RULES.md §5, §6, §9-H/J)
// 기대값은 전부 RULES.md에서 도출했다. 엔진 동작에 맞춘 기대값 조정은 금지.
//
// 공격 각도:
//  - discard phase 중 다른 모든 액션 거부 (§4 "행동은 정확히 1개" + §5 "즉시 반납")
//  - 반납 조합의 경계: 황금 포함/제외, 방금 얻은 것/원래 것 혼합, 음수/소수 밀반입
//  - mustDiscard 1/2/3 각각의 정확성 (§5: 초과분만큼 정확히 반납)
//  - 반납 후 귀족 자동 수여 vs chooseNoble 분기 (§6 [구현 결정] 순서, §9-J)
//  - chooseNoble phase 중 다른 액션 거부 (§9-J: 방문 거부 불가, 선택만 가능)
//  - 예약/구매 → 반납 → 귀족 → 15점 트리거가 한 턴에 연쇄 (§9-H, §6, §8-1)

import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { CARDS } from '../../src/engine/data/cards'
import { NOBLES } from '../../src/engine/data/nobles'
import { IllegalActionError } from '../../src/engine/errors'
import { tokenTotal } from '../../src/engine/tokens'
import type { Action } from '../../src/engine/types'
import { baseState, gems, patchPlayer, placeOnBoard, tokens } from '../helpers'

// 생성 데이터 전제: 귀족 0 = {red:4, black:4}, 귀족 1 = {green:3, red:3, black:3}
const NOBLE_A = 0
const NOBLE_B = 1

const ruleOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    if (e instanceof IllegalActionError) return e.rule
    throw e
  }
  throw new Error('IllegalActionError가 발생하지 않았습니다 — 엔진이 불법 액션을 통과시켰습니다')
}

describe('데이터 전제 확인', () => {
  it('이 파일이 가정하는 귀족/카드 데이터', () => {
    expect(NOBLES[NOBLE_A]!.requirement).toEqual(gems({ red: 4, black: 4 }))
    expect(NOBLES[NOBLE_B]!.requirement).toEqual(gems({ green: 3, red: 3, black: 3 }))
    // 카드 24: 티어1, 0점, 빨강 보너스, 비용 파랑2+초록1
    expect(CARDS[24]).toMatchObject({
      tier: 1,
      points: 0,
      bonus: 'red',
      cost: gems({ blue: 2, green: 1 }),
    })
  })
})

describe('§5 discard phase — 반납 외 모든 액션 거부', () => {
  it('§5+§4: discard phase에서는 A/B/C/D/PASS/CHOOSE_NOBLE 전부 거부되고 DISCARD만 통과한다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4, green: 2 }) }) // 10개
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 3 })

    const boardCard = mid.state.board[0]![0]!
    const forbidden: Action[] = [
      { type: 'TAKE_DIFFERENT', colors: ['white', 'blue', 'red'] },
      { type: 'TAKE_SAME', color: 'blue' },
      { type: 'RESERVE_BOARD', cardId: boardCard },
      { type: 'RESERVE_DECK', tier: 1 },
      { type: 'PURCHASE', cardId: boardCard, payment: tokens() },
      { type: 'CHOOSE_NOBLE', nobleId: NOBLE_A },
      { type: 'PASS' },
    ]
    for (const action of forbidden) {
      expect(() => applyAction(mid.state, action)).toThrow(IllegalActionError)
    }

    // 거부 이후에도 정상 반납은 그대로 성립해야 한다 (throw가 상태를 오염시키지 않음)
    const after = applyAction(mid.state, {
      type: 'DISCARD',
      tokens: tokens({ white: 2, blue: 1 }),
    })
    expect(tokenTotal(after.state.players[0]!.tokens)).toBe(10)
    expect(after.state.currentPlayer).toBe(1)
  })

  it('§5: mustDiscard=2 — 12개면 정확히 2개, 1개/3개 반납은 거부된다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4, green: 1 }) }) // 9개
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 2 })

    expect(
      ruleOf(() => applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ white: 1 }) })),
    ).toBe('§5')
    expect(
      ruleOf(() => applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ white: 3 }) })),
    ).toBe('§5')

    const after = applyAction(mid.state, {
      type: 'DISCARD',
      tokens: tokens({ white: 1, green: 1 }),
    })
    expect(tokenTotal(after.state.players[0]!.tokens)).toBe(10)
    expect(after.state.phase).toEqual({ kind: 'play' })
    expect(after.state.currentPlayer).toBe(1)
  })

  it('§5: 원래 갖고 있던 황금 + 방금 가져온 보석의 혼합 반납이 허용된다 (반납 자유 선택)', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ gold: 2, white: 4, blue: 4 }) }) // 10개 (황금 포함)
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 3 })

    const supplyGoldBefore = mid.state.supply.gold
    const supplyRedBefore = mid.state.supply.red
    // §5: "반납할 토큰은 자유 선택" — 황금 2(원래 것) + 빨강 1(방금 것)
    const after = applyAction(mid.state, {
      type: 'DISCARD',
      tokens: tokens({ gold: 2, red: 1 }),
    })
    const p = after.state.players[0]!
    expect(p.tokens).toEqual(tokens({ white: 4, blue: 4, green: 1, black: 1 }))
    expect(after.state.supply.gold).toBe(supplyGoldBefore + 2)
    expect(after.state.supply.red).toBe(supplyRedBefore + 1)
    expect(after.state.currentPlayer).toBe(1)
  })

  it('§5: 방금 가져온 3개를 그대로 전부 반납하면 상태가 행동 전과 동일해진다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4, green: 2 }) }) // 10개
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })

    // §5 원문: "방금 가져온 토큰의 전부 또는 일부를 그대로 반납해도 된다"
    const after = applyAction(mid.state, {
      type: 'DISCARD',
      tokens: tokens({ red: 1, green: 1, black: 1 }),
    })
    expect(after.state.players[0]!.tokens).toEqual(s.players[0]!.tokens)
    expect(after.state.supply).toEqual(s.supply)
  })

  it('§5 방어: 음수/소수 수량을 섞어 총합만 맞춘 반납은 거부되어야 한다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4, green: 1 }) }) // 9개
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 2 })

    // 총합 2로 위장했지만 red:-1은 공급처에서 토큰을 훔쳐오는 셈 — §5 반납은 소지 토큰을 되돌리는 행위
    expect(() =>
      applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ white: 3, red: -1 }) }),
    ).toThrow(IllegalActionError)
    // 총합 2지만 토큰은 이산적이다
    expect(() =>
      applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ white: 1.5, blue: 0.5 }) }),
    ).toThrow(IllegalActionError)
  })
})

describe('§9-H 예약과 반납의 상호작용', () => {
  it('§9-H: 10개에서 예약 → 11개 → 예약은 이미 성립, 황금 대신 원래 보석 반납도 허용', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 2 }) })
    const cardId = s.board[0]![0]!
    const expectedRefill = s.decks[0]![0]!
    const mid = applyAction(s, { type: 'RESERVE_BOARD', cardId })

    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 1 })
    // §9-H: "예약 자체는 항상 유효하게 성립한다" — 반납 대기 중에도 예약·보충은 이미 완료 상태
    expect(mid.state.players[0]!.reserved).toEqual([{ cardId, fromDeck: false }])
    expect(mid.state.board[0]![0]).toBe(expectedRefill)
    expect(mid.state.players[0]!.tokens.gold).toBe(1)

    // §5 반납 자유 선택: 방금 받은 황금이 아니라 원래 갖고 있던 보석을 반납해도 된다
    const after = applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ white: 1 }) })
    const p = after.state.players[0]!
    expect(p.tokens.gold).toBe(1) // 황금은 유지
    expect(tokenTotal(p.tokens)).toBe(10)
    expect(after.state.currentPlayer).toBe(1)
  })

  it('§9-H+§9-F: 황금 공급이 없으면 10개 소지 상태의 예약도 반납 없이 턴이 넘어간다', () => {
    let s = baseState(2, 1, {
      supply: tokens({ white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 0 }),
    })
    s = patchPlayer(s, 0, { tokens: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 2 }) })
    const cardId = s.board[0]![0]!
    const { state, events } = applyAction(s, { type: 'RESERVE_BOARD', cardId })

    // 황금을 못 받았으므로 여전히 10개 — §5 초과 없음 → discard phase 없이 턴 종료
    expect(tokenTotal(state.players[0]!.tokens)).toBe(10)
    expect(state.players[0]!.tokens.gold).toBe(0)
    expect(events.some((e) => e.t === 'discardRequired')).toBe(false)
    expect(state.phase).toEqual({ kind: 'play' })
    expect(state.currentPlayer).toBe(1)
  })
})

describe('§6/§9-J 반납 → 귀족 분기, chooseNoble phase 가드', () => {
  it('§5→§9-J: 반납 완료 후에야 복수 귀족 chooseNoble 분기 — 반납 전 CHOOSE_NOBLE은 거부', () => {
    let s = baseState(2, 1, { nobles: [NOBLE_A, NOBLE_B] })
    s = patchPlayer(s, 0, {
      tokens: tokens({ white: 4, blue: 4, green: 2 }), // 10개
      bonuses: gems({ green: 3, red: 4, black: 4 }), // 귀족 0·1 모두 충족
    })
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 3 })

    // §6 [구현 결정] 순서: ② 반납 → ③ 귀족. 반납이 끝나기 전 귀족 선택은 불법
    expect(() =>
      applyAction(mid.state, { type: 'CHOOSE_NOBLE', nobleId: NOBLE_A }),
    ).toThrow(IllegalActionError)

    const mid2 = applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ white: 3 }) })
    expect(mid2.state.phase).toEqual({ kind: 'chooseNoble', options: [NOBLE_A, NOBLE_B] })

    // §9-J: chooseNoble phase에서는 귀족 선택 외 어떤 액션도 불가 (방문 거부·회피 불가)
    const boardCard = mid2.state.board[0]![0]!
    const forbidden: Action[] = [
      { type: 'TAKE_DIFFERENT', colors: ['white', 'blue', 'red'] },
      { type: 'TAKE_SAME', color: 'blue' },
      { type: 'RESERVE_BOARD', cardId: boardCard },
      { type: 'RESERVE_DECK', tier: 2 },
      { type: 'PURCHASE', cardId: boardCard, payment: tokens() },
      { type: 'DISCARD', tokens: tokens({ white: 1 }) },
      { type: 'PASS' },
    ]
    for (const action of forbidden) {
      expect(() => applyAction(mid2.state, action)).toThrow(IllegalActionError)
    }

    const after = applyAction(mid2.state, { type: 'CHOOSE_NOBLE', nobleId: NOBLE_B })
    expect(after.state.players[0]!.nobles).toEqual([NOBLE_B])
    expect(after.state.players[0]!.prestige).toBe(3)
    expect(after.state.nobles).toEqual([NOBLE_A]) // 한 턴에 1장만, 나머지는 테이블에
    expect(after.state.currentPlayer).toBe(1)
  })

  it('§5→§6: 반납 후 단일 충족이면 chooseNoble 없이 자동 수여로 턴이 끝난다', () => {
    let s = baseState(2, 1, { nobles: [NOBLE_A, NOBLE_B] })
    s = patchPlayer(s, 0, {
      tokens: tokens({ white: 4, blue: 4, green: 2 }), // 10개
      bonuses: gems({ red: 4, black: 4 }), // 귀족 0만 충족 (green 0 < 3)
    })
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    const after = applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ white: 3 }) })

    expect(after.events.map((e) => e.t)).toEqual(['tokensReturned', 'nobleVisited', 'turnEnded'])
    expect(after.state.players[0]!.nobles).toEqual([NOBLE_A])
    expect(after.state.nobles).toEqual([NOBLE_B])
    expect(after.state.phase).toEqual({ kind: 'play' })
    expect(after.state.currentPlayer).toBe(1)
  })

  it('§6 경계: 요구 보너스가 1개라도 모자라면 방문 없음 — 토큰은 판정에 쓰이지 않는다', () => {
    let s = baseState(2, 1, { nobles: [NOBLE_A] })
    s = patchPlayer(s, 0, {
      bonuses: gems({ red: 4, black: 3 }), // black 1개 부족
      tokens: tokens({ red: 4, black: 4 }), // 토큰으로는 충족 — 하지만 §6은 보너스만 본다
    })
    const { state, events } = applyAction(s, { type: 'TAKE_SAME', color: 'green' })

    expect(events.some((e) => e.t === 'nobleVisited')).toBe(false)
    expect(state.players[0]!.nobles).toEqual([])
    expect(state.players[0]!.prestige).toBe(0)
    expect(state.nobles).toEqual([NOBLE_A]) // 귀족은 테이블에 그대로
    expect(state.currentPlayer).toBe(1)
  })
})

describe('§8 한 턴 연쇄 — 행동 → (반납) → 귀족 → 15점 트리거', () => {
  it('§4.4→§6→§8-1: 구매로 4번째 보너스 확보 → 귀족 자동 수여 → 15점 도달이 한 턴에 연쇄된다', () => {
    // 2인전에서 P1은 라운드 막차(§8-2) — 트리거 즉시 게임 종료까지 이어져야 한다
    let s = baseState(2, 1, { nobles: [NOBLE_A], currentPlayer: 1 })
    s = placeOnBoard(s, 24) // 티어1 빨강 보너스 0점, 비용 파랑2+초록1
    s = patchPlayer(s, 1, {
      bonuses: gems({ red: 3, black: 4 }), // 구매하면 red 4 → 귀족 0 충족
      prestige: 12, // + 카드 0점 + 귀족 3점 = 15점
      tokens: tokens({ blue: 2, green: 1 }),
    })
    const { state, events } = applyAction(s, {
      type: 'PURCHASE',
      cardId: 24,
      payment: tokens({ blue: 2, green: 1 }), // §4.4.1: need = cost (파랑·초록엔 보너스 없음)
    })

    expect(events.map((e) => e.t)).toEqual([
      'cardPurchased',
      'slotRefilled',
      'nobleVisited',
      'finalRoundTriggered',
      'gameEnded',
    ])
    const p = state.players[1]!
    expect(p.bonuses).toEqual(gems({ red: 4, black: 4 }))
    expect(p.nobles).toEqual([NOBLE_A])
    expect(p.prestige).toBe(15)
    expect(state.phase.kind).toBe('gameOver')
    if (state.phase.kind === 'gameOver') {
      expect(state.phase.result.winners).toEqual([1])
      expect(state.phase.result.reason).toBe('prestige15')
      expect(state.phase.result.scores[1]!.prestige).toBe(15)
    }
  })

  it('§9-J→§8-1: CHOOSE_NOBLE로 받은 3점이 같은 턴의 15점 트리거로 이어진다', () => {
    let s = baseState(2, 1, { nobles: [NOBLE_A, NOBLE_B], currentPlayer: 1 })
    s = patchPlayer(s, 1, {
      bonuses: gems({ green: 3, red: 4, black: 4 }), // 두 귀족 모두 충족
      prestige: 12,
    })
    const mid = applyAction(s, { type: 'TAKE_SAME', color: 'red' })
    expect(mid.state.phase).toEqual({ kind: 'chooseNoble', options: [NOBLE_A, NOBLE_B] })
    expect(mid.state.finalRound).toBe(false) // 귀족 선택 전에는 아직 12점 — 트리거 없음

    const after = applyAction(mid.state, { type: 'CHOOSE_NOBLE', nobleId: NOBLE_A })
    expect(after.events.map((e) => e.t)).toEqual([
      'nobleVisited',
      'finalRoundTriggered',
      'gameEnded', // P1이 라운드 막차이므로 즉시 종료 (§8-2)
    ])
    expect(after.state.players[1]!.prestige).toBe(15)
    expect(after.state.phase.kind).toBe('gameOver')
  })

  it('§9-H→§5→§6→§8-1: 예약(11개)→반납→귀족 자동→15점→종료가 한 턴에 전부 연쇄된다', () => {
    let s = baseState(2, 1, { nobles: [NOBLE_A], currentPlayer: 1 })
    s = patchPlayer(s, 1, {
      tokens: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 2 }), // 10개
      bonuses: gems({ red: 4, black: 4 }),
      prestige: 12,
    })
    const mid = applyAction(s, { type: 'RESERVE_DECK', tier: 1 })
    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 1 })
    // 귀족·트리거는 반납이 끝날 때까지 일어나지 않는다 (§6 [구현 결정] 순서)
    expect(mid.state.finalRound).toBe(false)
    expect(mid.events.some((e) => e.t === 'nobleVisited')).toBe(false)

    const after = applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ gold: 1 }) })
    expect(after.events.map((e) => e.t)).toEqual([
      'tokensReturned',
      'nobleVisited',
      'finalRoundTriggered',
      'gameEnded',
    ])
    expect(after.state.players[1]!.prestige).toBe(15)
    expect(after.state.phase.kind).toBe('gameOver')
    if (after.state.phase.kind === 'gameOver') {
      expect(after.state.phase.result.winners).toEqual([1])
    }
  })
})
