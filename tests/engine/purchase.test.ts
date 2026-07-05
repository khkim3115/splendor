import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { CARDS } from '../../src/engine/data/cards'
import { IllegalActionError } from '../../src/engine/errors'
import { canonicalPayment } from '../../src/engine/payment'
import { baseState, findCard, gems, patchPlayer, placeOnBoard, tokens } from '../helpers'

const ruleOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    if (e instanceof IllegalActionError) return e.rule
    throw e
  }
  throw new Error('IllegalActionError가 발생하지 않았습니다')
}

const RICH = tokens({ white: 7, blue: 7, green: 7, red: 7, black: 7, gold: 5 })

describe('§4.4 행동 D — 카드 구매', () => {
  it('§4.4: 공개 카드 구매 — 카드 획득, 보너스/점수 갱신, 즉시 보충 (§7), 이벤트 순서', () => {
    let s = baseState(2)
    const cardId = s.board[0]![0]!
    const card = CARDS[cardId]!
    const refill = s.decks[0]![0]!
    s = patchPlayer(s, 0, { tokens: tokens({ ...card.cost }) })
    const payment = canonicalPayment(s.players[0]!, card)

    const { state, events } = applyAction(s, { type: 'PURCHASE', cardId, payment })
    const p = state.players[0]!
    expect(p.purchased).toEqual([cardId])
    expect(p.bonuses[card.bonus]).toBe(1)
    expect(p.prestige).toBe(card.points)
    expect(state.board[0]![0]).toBe(refill)
    expect(events.map((e) => e.t)).toEqual(['cardPurchased', 'slotRefilled', 'turnEnded'])
  })

  it('§9-M: 지불한 토큰(황금 포함)은 공급처로 되돌아간다', () => {
    const target = findCard((c) => c.tier === 1 && c.cost.red === 3 && c.points === 0)
    let s = placeOnBoard(baseState(2), target.id)
    s = patchPlayer(s, 0, { tokens: tokens({ red: 2, gold: 1 }) })
    const payment = tokens({ red: 2, gold: 1 })

    const { state } = applyAction(s, { type: 'PURCHASE', cardId: target.id, payment })
    expect(state.players[0]!.tokens).toEqual(tokens())
    expect(state.supply.red).toBe(s.supply.red + 2)
    expect(state.supply.gold).toBe(s.supply.gold + 1)
  })

  it('§4.4: 자신의 예약 카드 구매 — 예약 목록에서 빠지고 보충은 없다', () => {
    let s = baseState(2)
    const cardId = s.decks[2]![0]!
    s = {
      ...s,
      decks: [s.decks[0], s.decks[1], s.decks[2]!.slice(1)] as unknown as typeof s.decks,
    }
    s = patchPlayer(s, 0, {
      tokens: tokens({ ...CARDS[cardId]!.cost }),
      reserved: [{ cardId, fromDeck: true }],
    })
    const payment = canonicalPayment(s.players[0]!, CARDS[cardId]!)

    const { state, events } = applyAction(s, { type: 'PURCHASE', cardId, payment })
    expect(state.players[0]!.reserved).toEqual([])
    expect(state.players[0]!.purchased).toEqual([cardId])
    expect(events.map((e) => e.t)).toEqual(['cardPurchased', 'turnEnded'])
    const e = events[0]!
    expect(e.t === 'cardPurchased' && e.from).toBe('reserve')
  })

  it('§4.4: 다른 플레이어의 예약 카드는 구매할 수 없다', () => {
    let s = baseState(2)
    const cardId = s.decks[2]![0]!
    s = patchPlayer(s, 1, { reserved: [{ cardId, fromDeck: true }] })
    s = patchPlayer(s, 0, { tokens: RICH })
    expect(
      ruleOf(() =>
        applyAction(s, { type: 'PURCHASE', cardId, payment: canonicalPayment(s.players[0]!, CARDS[cardId]!) }),
      ),
    ).toBe('§4.4')
  })

  it('§5.1: 보너스 할인이 적용된다 (보너스 2 + 토큰 1로 비용 3 지불)', () => {
    const target = findCard((c) => c.tier === 1 && c.cost.red === 3 && c.points === 0)
    let s = placeOnBoard(baseState(2), target.id)
    s = patchPlayer(s, 0, { tokens: tokens({ red: 1 }), bonuses: gems({ red: 2 }) })

    const { state } = applyAction(s, {
      type: 'PURCHASE',
      cardId: target.id,
      payment: tokens({ red: 1 }),
    })
    expect(state.players[0]!.tokens.red).toBe(0)
  })

  it('§4.4.1-5: 전액 보너스 커버 시 토큰 0개로 무료 구매', () => {
    const target = findCard((c) => c.tier === 1 && c.cost.red === 3 && c.points === 0)
    let s = placeOnBoard(baseState(2), target.id)
    s = patchPlayer(s, 0, { tokens: tokens({ blue: 2 }), bonuses: gems({ red: 3 }) })
    const supplyBefore = { ...s.supply }

    const { state } = applyAction(s, { type: 'PURCHASE', cardId: target.id, payment: tokens() })
    expect(state.players[0]!.tokens).toEqual(tokens({ blue: 2 }))
    expect(state.supply).toEqual(supplyBefore)
    expect(state.players[0]!.purchased).toEqual([target.id])
  })

  it('§9-L: 보석을 갖고 있어도 황금으로 대신 지불할 수 있다', () => {
    const target = findCard((c) => c.tier === 1 && c.cost.red === 3 && c.points === 0)
    let s = placeOnBoard(baseState(2), target.id)
    s = patchPlayer(s, 0, { tokens: tokens({ red: 3, gold: 1 }) })

    const { state } = applyAction(s, {
      type: 'PURCHASE',
      cardId: target.id,
      payment: tokens({ red: 2, gold: 1 }),
    })
    expect(state.players[0]!.tokens).toEqual(tokens({ red: 1 }))
  })

  it('§4.4.1: 잘못된 지불 구성은 §번호와 함께 거부된다', () => {
    let s = baseState(2)
    const cardId = s.board[0]![0]!
    s = patchPlayer(s, 0, { tokens: RICH })
    const over = tokens({ white: 7, blue: 7, green: 7, red: 7, black: 7 })
    expect(ruleOf(() => applyAction(s, { type: 'PURCHASE', cardId, payment: over }))).toBe(
      '§4.4.1',
    )
  })

  it('§4.4.1: 토큰이 부족하면 구매가 거부된다', () => {
    const s = baseState(2) // 빈손
    const cardId = s.board[2]![0]! // 3티어 — 빈손으로 불가
    expect(
      ruleOf(() => applyAction(s, { type: 'PURCHASE', cardId, payment: tokens() })),
    ).toBe('§4.4.1')
  })

  it('§7/§9-E: 덱이 소진되면 구매 후 빈자리가 null로 남는다', () => {
    let s = baseState(2, 1, { decks: [[], [], []] })
    const cardId = s.board[0]![0]!
    s = patchPlayer(s, 0, { tokens: RICH })
    const { state, events } = applyAction(s, {
      type: 'PURCHASE',
      cardId,
      payment: canonicalPayment(s.players[0]!, CARDS[cardId]!),
    })
    expect(state.board[0]![0]).toBeNull()
    expect(events[1]).toEqual({ t: 'slotRefilled', tier: 1, slot: 0, cardId: null })
  })

  it('§9-N: 예약 상태의 카드는 점수·보너스에 반영되지 않는다', () => {
    const pointCard = findCard((c) => c.tier === 3 && c.points === 5)
    const s = placeOnBoard(baseState(2), pointCard.id)
    const { state } = applyAction(s, { type: 'RESERVE_BOARD', cardId: pointCard.id })
    expect(state.players[0]!.prestige).toBe(0)
    expect(state.players[0]!.bonuses).toEqual(gems())
  })
})
