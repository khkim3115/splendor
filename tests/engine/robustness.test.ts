// JSON에서 온 비정상 액션(세이브 파일·Worker 메시지)에 대한 방어 —
// validateAction은 어떤 입력에도 throw 없이 ValidationResult를 반환해야 한다.
// (적대적 리뷰에서 확정된 결함 6건의 회귀 테스트)

import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { canonicalPayment } from '../../src/engine/payment'
import { CARDS } from '../../src/engine/data/cards'
import { isLegal, validateAction } from '../../src/engine/legal'
import { HIDDEN_CARD, type Action, type CardId, type GameState } from '../../src/engine/types'
import { baseState, gems, patchPlayer, tokens } from '../helpers'

const asAction = (raw: unknown): Action => raw as Action

const expectRejected = (s: GameState, raw: unknown, rule?: string) => {
  const v = validateAction(s, asAction(raw))
  expect(v.ok).toBe(false)
  if (!v.ok && rule) expect(v.rule).toBe(rule)
  expect(isLegal(s, asAction(raw))).toBe(false)
}

describe('비정상 액션 방어 — validateAction은 절대 throw하지 않는다', () => {
  it('알 수 없는 action.type은 §4로 거부된다', () => {
    expectRejected(baseState(2), { type: 'HACK_EVERYTHING' }, '§4')
  })

  it('action이 null/비객체여도 throw하지 않고 §4로 거부된다 (손상 세이브의 actions)', () => {
    for (const raw of [null, 'x', 42, true]) {
      expectRejected(baseState(2), raw, '§4')
    }
  })

  it('TAKE_DIFFERENT: colors가 배열이 아니면 §4.1로 거부된다 (null/문자열/숫자/객체)', () => {
    for (const colors of [null, 'white', 123, { 0: 'white' }]) {
      expectRejected(baseState(2), { type: 'TAKE_DIFFERENT', colors }, '§4.1')
    }
  })

  it('존재하지 않는 색은 §4.1/§4.2, 황금은 §9-F로 구분해 거부된다', () => {
    expectRejected(
      baseState(2),
      { type: 'TAKE_DIFFERENT', colors: ['white', 'blue', 'purple'] },
      '§4.1',
    )
    expectRejected(
      baseState(2),
      { type: 'TAKE_DIFFERENT', colors: ['white', 'blue', 'gold'] },
      '§9-F',
    )
    expectRejected(baseState(2), { type: 'TAKE_SAME', color: 'purple' }, '§4.2')
    expectRejected(baseState(2), { type: 'TAKE_SAME', color: 'gold' }, '§9-F')
  })

  it('DISCARD: tokens가 객체가 아니면 §5로 거부된다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4 }) })
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    for (const t of [null, 'white', 3]) {
      expectRejected(mid.state, { type: 'DISCARD', tokens: t }, '§5')
    }
  })

  it('PURCHASE: payment가 객체가 아니면 §4.4.1로 거부된다', () => {
    let s = baseState(2)
    const cardId = s.board[0]![0]!
    s = patchPlayer(s, 0, { tokens: tokens({ ...CARDS[cardId]!.cost }) })
    expectRejected(s, { type: 'PURCHASE', cardId, payment: null }, '§4.4.1')
  })

  it('PURCHASE/RESERVE: cardId가 null·음수·범위 밖이면 거부된다 (null 슬롯 매칭 금지)', () => {
    // 덱이 빈 상태에서 구매해 보드에 null 슬롯을 만든다
    let s = baseState(2, 1, { decks: [[], [], []] })
    const cardId = s.board[0]![0]!
    s = patchPlayer(s, 0, { tokens: tokens({ ...CARDS[cardId]!.cost }) })
    const { state } = applyAction(s, {
      type: 'PURCHASE',
      cardId,
      payment: canonicalPayment(s.players[0]!, CARDS[cardId]!),
    })
    expect(state.board[0]![0]).toBeNull() // null 슬롯 존재 확인

    const next = { ...state, currentPlayer: 1 }
    for (const bad of [null, -1, 90, 1.5]) {
      expectRejected(next, { type: 'RESERVE_BOARD', cardId: bad }, '§4.3')
      expectRejected(next, { type: 'PURCHASE', cardId: bad, payment: tokens() }, '§4.4')
    }
  })

  it('마스킹 상태(HIDDEN_CARD 예약)에서도 validateAction이 크래시하지 않는다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { reserved: [{ cardId: HIDDEN_CARD, fromDeck: true }] })
    expectRejected(s, { type: 'PURCHASE', cardId: HIDDEN_CARD as CardId, payment: tokens() }, '§4.4')
  })

  it('RESERVE_DECK: 범위 밖 tier는 §4.3으로 거부된다', () => {
    for (const tier of [0, 4, null, 'x']) {
      expectRejected(baseState(2), { type: 'RESERVE_DECK', tier }, '§4.3')
    }
  })
})

describe('마스킹 상태 탐색 안전성 (AI 탐색 계약)', () => {
  it('마스킹 상태에 수를 적용해 HIDDEN_CARD가 보드에 유입돼도 legalActions가 안전하다', async () => {
    const { playerView } = await import('../../src/engine/view')
    const { legalActions } = await import('../../src/engine/legal')
    const view = playerView(baseState(2), 0)

    // 보드 예약 적용 → 마스킹된 덱 맨 위(-1)가 보드로 보충된다
    const reserveAction = legalActions(view).find((a) => a.type === 'RESERVE_BOARD')!
    const after = applyAction(view, reserveAction).state
    expect(after.board.flat()).toContain(HIDDEN_CARD)

    const legal = legalActions(after)
    expect(legal.length).toBeGreaterThan(0)
    for (const a of legal) {
      expect(isLegal(after, a), JSON.stringify(a)).toBe(true)
      expect(() => applyAction(after, a)).not.toThrow()
    }
    // HIDDEN 카드는 예약/구매 후보로 열거되지 않는다
    expect(
      legal.every(
        (a) =>
          (a.type !== 'RESERVE_BOARD' && a.type !== 'PURCHASE') ||
          ('cardId' in a && a.cardId >= 0),
      ),
    ).toBe(true)
  })

  it('마스킹 상태에서 덱 예약을 적용해도 크래시 없이 탐색이 이어진다', async () => {
    const { playerView } = await import('../../src/engine/view')
    const { legalActions } = await import('../../src/engine/legal')
    const view = playerView(baseState(2), 0)

    const after = applyAction(view, { type: 'RESERVE_DECK', tier: 1 }).state
    expect(after.players[0]!.reserved).toEqual([{ cardId: HIDDEN_CARD, fromDeck: true }])
    const legal = legalActions(after)
    expect(legal.length).toBeGreaterThan(0)
    for (const a of legal) {
      expect(() => applyAction(after, a)).not.toThrow()
    }
  })
})

describe('§9-E/G 교착 종료와 §6 귀족 판정의 일관성', () => {
  function stuckState(): GameState {
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
    return s
  }

  it('패스 턴에도 귀족 판정이 수행된다 — 교착이어도 수여 후 게임이 이어진다', () => {
    let s = stuckState()
    s = { ...s, nobles: [0] } // 귀족 0 = {red:4, black:4}
    s = patchPlayer(s, 0, { bonuses: gems({ red: 4, black: 4 }), prestige: 5 })
    s = patchPlayer(s, 1, { prestige: 7 })

    const t0 = applyAction(s, { type: 'PASS' })
    expect(t0.events.map((e) => e.t)).toEqual(['nobleVisited', 'turnEnded'])
    expect(t0.state.players[0]!.prestige).toBe(8)

    // 다음 패스에서는 수여할 귀족이 없으므로 교착 종료 — 귀족 3점이 승부에 반영된다
    const t1 = applyAction(t0.state, { type: 'PASS' })
    expect(t1.state.phase.kind).toBe('gameOver')
    if (t1.state.phase.kind === 'gameOver') {
      expect(t1.state.phase.result.reason).toBe('deadlockExhausted')
      expect(t1.state.phase.result.winners).toEqual([0]) // 8점 > 7점
    }
  })

  it('패스 턴의 귀족 수여로 15점에 도달하면 §8 정상 종료 경로를 탄다', () => {
    let s = stuckState()
    s = { ...s, nobles: [0] }
    s = patchPlayer(s, 0, { bonuses: gems({ red: 4, black: 4 }), prestige: 12 })

    const t0 = applyAction(s, { type: 'PASS' })
    expect(t0.events.map((e) => e.t)).toEqual([
      'nobleVisited',
      'finalRoundTriggered',
      'turnEnded',
    ])

    const t1 = applyAction(t0.state, { type: 'PASS' }) // P1 = 막차
    expect(t1.state.phase.kind).toBe('gameOver')
    if (t1.state.phase.kind === 'gameOver') {
      expect(t1.state.phase.result.reason).toBe('prestige15')
      expect(t1.state.phase.result.winners).toEqual([0])
    }
  })
})
