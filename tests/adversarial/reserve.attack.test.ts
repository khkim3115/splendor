// 적대적 테스트 — 예약 (RULES §4.3, §9-D/E/F/H/K)
// 기대값은 전부 docs/RULES.md에서 도출했다. 엔진 동작 역산 금지.

import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { IllegalActionError } from '../../src/engine/errors'
import { tokenTotal } from '../../src/engine/tokens'
import type { GameState } from '../../src/engine/types'
import { baseState, patchPlayer, tokens } from '../helpers'

const ruleOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    if (e instanceof IllegalActionError) return e.rule
    throw e
  }
  throw new Error('IllegalActionError가 발생하지 않았습니다')
}

/** 상태 전체의 황금 총량 (공급처 + 전 플레이어) */
const goldInPlay = (s: GameState): number =>
  s.supply.gold + s.players.reduce((acc, p) => acc + p.tokens.gold, 0)

describe('공격: §9-F 황금 고갈 직전/직후 예약', () => {
  it('§9-F: 마지막 황금 1개 — 예약자가 가져가 supply가 0이 되고, 직후 예약은 무황금(음수 금지)', () => {
    // §4.3: 예약과 동시에 황금 1개. §9-F: 더미가 비면 황금 없이 예약만.
    const s = baseState(2, 1, {
      supply: tokens({ white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 1 }),
    })

    const r1 = applyAction(s, { type: 'RESERVE_DECK', tier: 3 })
    expect(r1.state.players[0]!.tokens.gold).toBe(1)
    expect(r1.state.supply.gold).toBe(0)
    const e1 = r1.events[0]!
    expect(e1.t === 'cardReserved' && e1.goldGained).toBe(true)

    // 황금 고갈 직후: 다음 플레이어의 예약은 성립하되 황금 없음, supply는 0 유지(음수 불가)
    const r2 = applyAction(r1.state, { type: 'RESERVE_DECK', tier: 3 })
    expect(r2.state.players[1]!.reserved).toHaveLength(1)
    expect(r2.state.players[1]!.tokens.gold).toBe(0)
    expect(r2.state.supply.gold).toBe(0)
    const e2 = r2.events[0]!
    expect(e2.t === 'cardReserved' && e2.goldGained).toBe(false)
  })

  it('§9-F: 연속 예약 6회 — 황금 총량은 항상 5개 보존, 6번째 예약만 무황금', () => {
    // §1: 황금은 5개뿐. §9-F: 예약이 유일한 획득 경로, 고갈 시 무황금 예약.
    let s = baseState(2)
    expect(s.supply.gold).toBe(5)

    for (let i = 0; i < 6; i++) {
      const { state, events } = applyAction(s, { type: 'RESERVE_DECK', tier: 3 })
      const e = events[0]!
      expect(e.t === 'cardReserved' && e.goldGained).toBe(i < 5)
      expect(goldInPlay(state)).toBe(5) // 매 턴 황금 총량 보존 (증발·발권 금지)
      s = state
    }

    expect(s.players[0]!.tokens.gold).toBe(3)
    expect(s.players[1]!.tokens.gold).toBe(2)
    expect(s.supply.gold).toBe(0)
    expect(s.players[0]!.reserved).toHaveLength(3)
    expect(s.players[1]!.reserved).toHaveLength(3)
  })
})

describe('공격: §9-D 예약 한도 2→3→거부 경계', () => {
  it('§9-D: 2장 보유 시 3장째 예약은 성립, 그 다음 자기 턴에는 보드/덱 예약 모두 거부', () => {
    // §4.3: 최대 3장. 이미 3장이면 행동 C 선택 불가(§9-D). 경계는 "3장째까지 허용".
    let s = baseState(2)
    s = patchPlayer(s, 0, {
      reserved: [
        { cardId: s.decks[2]![5]!, fromDeck: true },
        { cardId: s.decks[2]![6]!, fromDeck: true },
      ],
    })

    // 2 → 3: 성립해야 한다
    const r1 = applyAction(s, { type: 'RESERVE_BOARD', cardId: s.board[0]![0]! })
    expect(r1.state.players[0]!.reserved).toHaveLength(3)

    // P1이 턴을 소모하고 P0 턴으로 복귀
    const r2 = applyAction(r1.state, {
      type: 'TAKE_DIFFERENT',
      colors: ['white', 'blue', 'green'],
    })
    expect(r2.state.currentPlayer).toBe(0)

    // 3 → 4: 보드/덱 모두 거부 (§9-D: 행동 C 자체가 불가)
    expect(
      ruleOf(() =>
        applyAction(r2.state, { type: 'RESERVE_BOARD', cardId: r2.state.board[1]![0]! }),
      ),
    ).toBe('§4.3')
    expect(ruleOf(() => applyAction(r2.state, { type: 'RESERVE_DECK', tier: 2 }))).toBe('§4.3')
  })
})

describe('공격: §9-E 덱 잔량 1장 경계와 티어 혼합 소진', () => {
  it('§9-E: 덱 잔량 1장 — 덱 예약 성공 후 같은 티어 연속 덱 예약은 거부, 보드 예약은 여전히 가능', () => {
    // §4.3: 덱 맨 위 비공개 예약. §9-E: 덱 소진 티어는 비공개 예약 불가, 남은 공개 카드 예약은 가능.
    const base = baseState(2)
    const lastDeckCard = base.decks[0]![0]!
    const s: GameState = {
      ...base,
      decks: [base.decks[0]!.slice(0, 1), base.decks[1]!, base.decks[2]!],
    }

    // P0: 마지막 1장 덱 예약 성공 — 정확히 그 카드여야 한다
    const r1 = applyAction(s, { type: 'RESERVE_DECK', tier: 1 })
    expect(r1.state.players[0]!.reserved).toEqual([{ cardId: lastDeckCard, fromDeck: true }])
    expect(r1.state.decks[0]).toHaveLength(0)

    // P1: 같은 티어 덱 예약 연속 시도 → §9-E 거부
    expect(ruleOf(() => applyAction(r1.state, { type: 'RESERVE_DECK', tier: 1 }))).toBe('§9-E')

    // P1: 같은 티어의 공개 카드 예약은 가능해야 하고(§9-E), 빈자리는 빈 채 유지(§7)
    const boardCard = r1.state.board[0]![2]!
    const r2 = applyAction(r1.state, { type: 'RESERVE_BOARD', cardId: boardCard })
    expect(r2.state.players[1]!.reserved).toEqual([{ cardId: boardCard, fromDeck: false }])
    expect(r2.state.board[0]![2]).toBeNull()
  })

  it('§7/§9-E: 덱 잔량 1장에서 보드 예약 — 마지막 덱 카드로 즉시 보충되고 그 후 덱 예약은 거부', () => {
    // §7: 공개 카드가 예약되면 즉시 같은 레벨 덱 맨 위로 보충.
    const base = baseState(2)
    const lastDeckCard = base.decks[0]![0]!
    const s: GameState = {
      ...base,
      decks: [base.decks[0]!.slice(0, 1), base.decks[1]!, base.decks[2]!],
    }
    const target = s.board[0]![1]!

    const r1 = applyAction(s, { type: 'RESERVE_BOARD', cardId: target })
    expect(r1.state.board[0]![1]).toBe(lastDeckCard) // 보충 카드 = 덱 맨 위였던 카드
    expect(r1.state.decks[0]).toHaveLength(0)
    expect(r1.state.board[0]!.every((c) => c !== null)).toBe(true) // 보드는 여전히 4장

    // 보충이 덱을 비웠으므로 이제 이 티어 덱 예약은 불가
    expect(ruleOf(() => applyAction(r1.state, { type: 'RESERVE_DECK', tier: 1 }))).toBe('§9-E')
  })

  it('§9-E/§7: 덱이 이미 소진된 티어의 보드 예약 — 성립하고 황금도 받고 빈자리는 빈 채로 남는다', () => {
    const base = baseState(2)
    const s: GameState = { ...base, decks: [[], base.decks[1]!, base.decks[2]!] }
    const target = s.board[0]![3]!

    const { state } = applyAction(s, { type: 'RESERVE_BOARD', cardId: target })
    expect(state.players[0]!.reserved).toEqual([{ cardId: target, fromDeck: false }])
    expect(state.players[0]!.tokens.gold).toBe(1) // §4.3: 황금 지급은 정상
    expect(state.board[0]![3]).toBeNull() // §7: 빈자리는 빈 채 유지
    expect(state.board[0]!.filter((c) => c !== null)).toHaveLength(3)
  })

  it('§9-E: 티어 1·3만 소진된 혼합 상황 — 소진 티어 덱 예약만 거부되고 티어 2는 성립', () => {
    const base = baseState(2)
    const s: GameState = { ...base, decks: [[], base.decks[1]!, []] }

    expect(ruleOf(() => applyAction(s, { type: 'RESERVE_DECK', tier: 1 }))).toBe('§9-E')
    expect(ruleOf(() => applyAction(s, { type: 'RESERVE_DECK', tier: 3 }))).toBe('§9-E')

    const top2 = s.decks[1]![0]!
    const { state } = applyAction(s, { type: 'RESERVE_DECK', tier: 2 })
    expect(state.players[0]!.reserved).toEqual([{ cardId: top2, fromDeck: true }])
    expect(state.decks[1]).toHaveLength(base.decks[1]!.length - 1)
  })
})

describe('공격: §9-H 예약+황금 10개/11개 경계', () => {
  it('§9-H: 9개 소지 + 황금 = 정확히 10개 — 반납 없이 턴이 정상 종료된다', () => {
    // §5: 제한은 "10개 초과" — 정확히 10개는 합법이므로 반납 phase가 뜨면 안 된다.
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 1 }) })

    const { state, events } = applyAction(s, { type: 'RESERVE_DECK', tier: 1 })
    expect(tokenTotal(state.players[0]!.tokens)).toBe(10)
    expect(events.some((e) => e.t === 'discardRequired')).toBe(false)
    expect(state.phase).toEqual({ kind: 'play' })
    expect(state.currentPlayer).toBe(1)
  })

  it('§9-H×§9-F: 10개 소지 + 황금 고갈 — 예약해도 10개 유지, 반납 phase 없음', () => {
    // §9-H는 황금을 "받아서" 11개가 될 때만 발동. 황금이 없으면 10개 그대로 → 반납 불필요.
    let s = baseState(2, 1, {
      supply: tokens({ white: 4, blue: 4, green: 4, red: 4, black: 4 }),
    })
    s = patchPlayer(s, 0, { tokens: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 2 }) })

    const { state, events } = applyAction(s, { type: 'RESERVE_BOARD', cardId: s.board[1]![0]! })
    expect(state.players[0]!.tokens.gold).toBe(0)
    expect(tokenTotal(state.players[0]!.tokens)).toBe(10)
    expect(events.some((e) => e.t === 'discardRequired')).toBe(false)
    expect(state.phase).toEqual({ kind: 'play' })
    expect(state.currentPlayer).toBe(1)
    expect(state.players[0]!.reserved).toHaveLength(1) // 예약 자체는 성립 (§9-F)
  })

  it('§9-H: 10개 + 마지막 황금 = 11개 — 반납 1개 강제, 황금이 아닌 보석 반납도 허용', () => {
    // §5: 반납할 토큰은 자유 선택. §9-H: 방금 받은 황금을 반납해도 되지만 의무는 아니다.
    let s = baseState(2, 1, {
      supply: tokens({ white: 4, blue: 4, green: 4, red: 4, black: 4, gold: 1 }),
    })
    s = patchPlayer(s, 0, { tokens: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 2 }) })

    const r1 = applyAction(s, { type: 'RESERVE_DECK', tier: 2 })
    expect(r1.state.phase).toEqual({ kind: 'discard', mustDiscard: 1 })
    expect(r1.state.supply.gold).toBe(0)

    // 황금 대신 하양 반납 → 황금 유지, 반납분은 공급처로 (§5)
    const r2 = applyAction(r1.state, { type: 'DISCARD', tokens: tokens({ white: 1 }) })
    expect(r2.state.players[0]!.tokens.gold).toBe(1)
    expect(r2.state.players[0]!.tokens.white).toBe(1)
    expect(tokenTotal(r2.state.players[0]!.tokens)).toBe(10)
    expect(r2.state.supply.white).toBe(5)
    expect(r2.state.supply.gold).toBe(0)
    expect(r2.state.currentPlayer).toBe(1)
  })

  it('§5: 예약 후 반납은 정확히 초과분(1개)만 — 0개/2개/미보유 색 반납은 전부 거부', () => {
    // §5: "10개가 될 때까지" 반납 — 초과분만큼 정확히. 갖고 있지 않은 토큰은 낼 수 없다.
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 5, blue: 5 }) })

    const { state } = applyAction(s, { type: 'RESERVE_DECK', tier: 1 })
    expect(state.phase).toEqual({ kind: 'discard', mustDiscard: 1 })

    expect(ruleOf(() => applyAction(state, { type: 'DISCARD', tokens: tokens() }))).toBe('§5')
    expect(ruleOf(() => applyAction(state, { type: 'DISCARD', tokens: tokens({ white: 2 }) }))).toBe(
      '§5',
    )
    expect(ruleOf(() => applyAction(state, { type: 'DISCARD', tokens: tokens({ green: 1 }) }))).toBe(
      '§5',
    )
  })

  it('§4: 반납 phase 중 추가 예약 시도는 거부된다 (한 턴에 행동 하나)', () => {
    // §4: 4가지 행동 중 정확히 1개. 반납 대기 중 두 번째 행동 C는 불법.
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 2 }) })

    const { state } = applyAction(s, { type: 'RESERVE_DECK', tier: 1 })
    expect(state.phase.kind).toBe('discard')

    expect(() => applyAction(state, { type: 'RESERVE_DECK', tier: 2 })).toThrow(IllegalActionError)
    expect(() =>
      applyAction(state, { type: 'RESERVE_BOARD', cardId: state.board[0]![0]! }),
    ).toThrow(IllegalActionError)
  })
})

describe('공격: §4.3 보드/덱 예약의 상태 정합', () => {
  it('§4.3/§7: 예약된 보드 카드는 더 이상 공개 카드가 아니다 — 타 플레이어 재예약 거부, 보충 카드는 덱 맨 위', () => {
    const s = baseState(2)
    const target = s.board[2]![0]!
    const expectedRefill = s.decks[2]![0]!

    const r1 = applyAction(s, { type: 'RESERVE_BOARD', cardId: target })
    expect(r1.state.board[2]![0]).toBe(expectedRefill)
    // 예약된 카드가 보드 어디에도 남아 있으면 안 된다
    expect(r1.state.board.some((row) => row.includes(target))).toBe(false)
    // 보충 카드는 덱에서 빠져야 한다 (카드 복제 금지)
    expect(r1.state.decks[2]).not.toContain(expectedRefill)
    expect(r1.state.decks[2]).toHaveLength(s.decks[2]!.length - 1)

    // P1이 P0의 예약 카드를 보드 예약 시도 → 공개 카드가 아니므로 거부
    expect(ruleOf(() => applyAction(r1.state, { type: 'RESERVE_BOARD', cardId: target }))).toBe(
      '§4.3',
    )
  })

  it('§4.3: 덱 예약은 보드를 건드리지 않고 덱만 1장 줄인다 — 잔량 2장에서 연속 2회 후 3회째 거부', () => {
    // §4.3 + §9-E: 덱 예약은 보충이 없다(§7). 잔량이 정확히 소진되는 지점의 정합 검증.
    const base = baseState(2)
    const [top, second] = [base.decks[0]![0]!, base.decks[0]![1]!]
    const s: GameState = {
      ...base,
      decks: [base.decks[0]!.slice(0, 2), base.decks[1]!, base.decks[2]!],
    }
    const boardBefore = s.board.map((row) => [...row])

    const r1 = applyAction(s, { type: 'RESERVE_DECK', tier: 1 })
    expect(r1.state.players[0]!.reserved).toEqual([{ cardId: top, fromDeck: true }])
    expect(r1.state.decks[0]).toHaveLength(1)
    expect(r1.state.board).toEqual(boardBefore) // 보드 불변 (§7: 덱 예약은 보충 없음)

    const r2 = applyAction(r1.state, { type: 'RESERVE_DECK', tier: 1 })
    expect(r2.state.players[1]!.reserved).toEqual([{ cardId: second, fromDeck: true }])
    expect(r2.state.decks[0]).toHaveLength(0)
    expect(r2.state.board).toEqual(boardBefore)

    // 잔량 0 — 세 번째 시도는 거부
    expect(ruleOf(() => applyAction(r2.state, { type: 'RESERVE_DECK', tier: 1 }))).toBe('§9-E')
  })
})
