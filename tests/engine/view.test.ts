import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { HIDDEN_CARD } from '../../src/engine/types'
import { playerView } from '../../src/engine/view'
import { baseState } from '../helpers'

describe('§9-O 정보 공개와 마스킹', () => {
  it('§9-O: 덱에서 비공개 예약한 카드는 본인에게만 보인다', () => {
    const s = baseState(2)
    const topCard = s.decks[1]![0]!
    const { state } = applyAction(s, { type: 'RESERVE_DECK', tier: 2 })

    const ownView = playerView(state, 0)
    expect(ownView.players[0]!.reserved).toEqual([{ cardId: topCard, fromDeck: true }])

    const otherView = playerView(state, 1)
    expect(otherView.players[0]!.reserved).toEqual([{ cardId: HIDDEN_CARD, fromDeck: true }])
  })

  it('§9-O: 공개 카드를 예약한 것은 마스킹되지 않는다 (전원이 이미 본 정보)', () => {
    const s = baseState(2)
    const cardId = s.board[0]![0]!
    const { state } = applyAction(s, { type: 'RESERVE_BOARD', cardId })

    const otherView = playerView(state, 1)
    expect(otherView.players[0]!.reserved).toEqual([{ cardId, fromDeck: false }])
  })

  it('§9-O: 덱 내용은 가려지고 길이만 유지된다', () => {
    const s = baseState(2)
    const view = playerView(s, 0)
    for (const t of [0, 1, 2]) {
      expect(view.decks[t]).toHaveLength(s.decks[t]!.length)
      expect(view.decks[t]!.every((c) => c === HIDDEN_CARD)).toBe(true)
    }
  })

  it('§9-O: 토큰·구매 카드·점수·귀족은 전원 공개로 유지된다', () => {
    const s = baseState(2)
    const { state } = applyAction(s, { type: 'TAKE_SAME', color: 'red' })
    const otherView = playerView(state, 1)
    expect(otherView.players[0]!.tokens).toEqual(state.players[0]!.tokens)
    expect(otherView.players[0]!.purchased).toEqual(state.players[0]!.purchased)
    expect(otherView.players[0]!.prestige).toBe(state.players[0]!.prestige)
    expect(otherView.supply).toEqual(state.supply)
    expect(otherView.board).toEqual(state.board)
  })

  it('마스킹은 원본 상태를 변형하지 않는다', () => {
    const s = baseState(2)
    const before = JSON.stringify(s)
    playerView(s, 1)
    expect(JSON.stringify(s)).toBe(before)
  })
})
