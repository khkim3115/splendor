import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { IllegalActionError } from '../../src/engine/errors'
import { canAfford } from '../../src/engine/payment'
import { CARDS } from '../../src/engine/data/cards'
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

describe('§4.3 행동 C — 카드 예약 + 황금', () => {
  it('§4.3: 공개 카드 예약 시 황금 1개를 받고, 빈자리는 즉시 보충된다 (§7)', () => {
    const s = baseState(2)
    const cardId = s.board[0]![0]!
    const expectedRefill = s.decks[0]![0]!
    const { state, events } = applyAction(s, { type: 'RESERVE_BOARD', cardId })

    expect(state.players[0]!.reserved).toEqual([{ cardId, fromDeck: false }])
    expect(state.players[0]!.tokens.gold).toBe(1)
    expect(state.supply.gold).toBe(4)
    expect(state.board[0]![0]).toBe(expectedRefill)
    expect(state.decks[0]).toHaveLength(35)
    expect(events.map((e) => e.t)).toEqual(['cardReserved', 'slotRefilled', 'turnEnded'])
  })

  it('§4.3: 덱 맨 위 비공개 예약 — fromDeck=true, 보드는 그대로', () => {
    const s = baseState(2)
    const topCard = s.decks[1]![0]!
    const boardBefore = s.board.map((r) => [...r])
    const { state, events } = applyAction(s, { type: 'RESERVE_DECK', tier: 2 })

    expect(state.players[0]!.reserved).toEqual([{ cardId: topCard, fromDeck: true }])
    expect(state.decks[1]).toHaveLength(25)
    expect(state.board).toEqual(boardBefore)
    expect(events.map((e) => e.t)).toEqual(['cardReserved', 'turnEnded'])
    const reservedEvent = events[0]!
    expect(reservedEvent.t === 'cardReserved' && reservedEvent.from.slot).toBe('deck')
  })

  it('§9-F: 황금이 없으면 황금 없이 예약된다', () => {
    const s = baseState(2, 1, { supply: tokens({ red: 4, blue: 4, green: 4, white: 4, black: 4 }) })
    const cardId = s.board[0]![0]!
    const { state, events } = applyAction(s, { type: 'RESERVE_BOARD', cardId })
    expect(state.players[0]!.reserved).toHaveLength(1)
    expect(state.players[0]!.tokens.gold).toBe(0)
    const e = events[0]!
    expect(e.t === 'cardReserved' && e.goldGained).toBe(false)
  })

  it('§9-D: 예약 3장이면 예약 행동 자체가 거부된다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, {
      reserved: [
        { cardId: s.decks[2]![0]!, fromDeck: true },
        { cardId: s.decks[2]![1]!, fromDeck: true },
        { cardId: s.decks[2]![2]!, fromDeck: true },
      ],
    })
    expect(ruleOf(() => applyAction(s, { type: 'RESERVE_BOARD', cardId: s.board[0]![0]! }))).toBe(
      '§4.3',
    )
    expect(ruleOf(() => applyAction(s, { type: 'RESERVE_DECK', tier: 1 }))).toBe('§4.3')
  })

  it('§9-E: 덱이 소진된 티어는 비공개 예약이 불가하다', () => {
    const s = baseState(2, 1, {
      decks: [[], [], []],
    })
    expect(ruleOf(() => applyAction(s, { type: 'RESERVE_DECK', tier: 1 }))).toBe('§9-E')
  })

  it('§4.3: 공개 카드가 아닌 카드는 예약할 수 없다', () => {
    const s = baseState(2)
    const deckCard = s.decks[0]![5]!
    expect(ruleOf(() => applyAction(s, { type: 'RESERVE_BOARD', cardId: deckCard }))).toBe('§4.3')
  })

  it('§9-K: 즉시 구매 가능한 카드도 예약할 수 있다', () => {
    let s = baseState(2)
    const cardId = s.board[0]![0]!
    s = patchPlayer(s, 0, { tokens: tokens({ white: 3, blue: 3, green: 3, red: 3, black: 3 }) })
    expect(canAfford(s.players[0]!, CARDS[cardId]!)).toBe(true)
    const { state } = applyAction(s, { type: 'RESERVE_BOARD', cardId })
    expect(state.players[0]!.reserved).toEqual([{ cardId, fromDeck: false }])
  })

  it('§9-H: 토큰 10개에서 예약하면 황금으로 11개가 되어 반납 phase로 들어간다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 2, blue: 2, green: 2, red: 2, black: 2 }) })
    const { state, events } = applyAction(s, { type: 'RESERVE_BOARD', cardId: s.board[0]![0]! })

    expect(state.phase).toEqual({ kind: 'discard', mustDiscard: 1 })
    expect(events.at(-1)).toEqual({ t: 'discardRequired', player: 0, mustDiscard: 1 })

    // 방금 받은 황금을 그대로 반납해도 된다
    const after = applyAction(state, { type: 'DISCARD', tokens: tokens({ gold: 1 }) })
    expect(after.state.players[0]!.tokens.gold).toBe(0)
    expect(after.state.supply.gold).toBe(5)
    expect(after.state.currentPlayer).toBe(1)
  })
})
