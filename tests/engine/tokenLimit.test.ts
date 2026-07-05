import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { IllegalActionError } from '../../src/engine/errors'
import { tokenTotal } from '../../src/engine/tokens'
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

describe('§5 토큰 10개 소지 제한', () => {
  it('§5: 10개를 넘기면 discard phase로 들어가고 초과분만큼 반납해야 한다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4 }) }) // 8개
    const { state, events } = applyAction(s, {
      type: 'TAKE_DIFFERENT',
      colors: ['red', 'green', 'black'],
    })
    expect(state.phase).toEqual({ kind: 'discard', mustDiscard: 1 })
    expect(events.at(-1)).toEqual({ t: 'discardRequired', player: 0, mustDiscard: 1 })

    // 턴은 아직 넘어가지 않았다
    expect(state.currentPlayer).toBe(0)

    const after = applyAction(state, { type: 'DISCARD', tokens: tokens({ white: 1 }) })
    expect(tokenTotal(after.state.players[0]!.tokens)).toBe(10)
    expect(after.state.supply.white).toBe(s.supply.white + 1)
    expect(after.state.currentPlayer).toBe(1)
    expect(after.events.map((e) => e.t)).toEqual(['tokensReturned', 'turnEnded'])
  })

  it('§5 [FAQ]: 방금 가져온 토큰을 그대로 반납하는 색 교환이 가능하다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4, green: 2 }) }) // 10개
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(mid.state.phase).toEqual({ kind: 'discard', mustDiscard: 3 })

    // 원래 갖고 있던 하양 2 + 파랑 1을 반납 → 사실상 색 교환
    const after = applyAction(mid.state, {
      type: 'DISCARD',
      tokens: tokens({ white: 2, blue: 1 }),
    })
    const p = after.state.players[0]!
    expect(tokenTotal(p.tokens)).toBe(10)
    expect(p.tokens).toEqual(tokens({ white: 2, blue: 3, green: 3, red: 1, black: 1 }))
  })

  it('§5: 반납 개수가 틀리면 거부된다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4 }) })
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(
      ruleOf(() => applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ white: 2 }) })),
    ).toBe('§5')
    expect(ruleOf(() => applyAction(mid.state, { type: 'DISCARD', tokens: tokens() }))).toBe('§5')
  })

  it('§5: 갖고 있지 않은 토큰은 반납할 수 없다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4 }) })
    const mid = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(
      ruleOf(() => applyAction(mid.state, { type: 'DISCARD', tokens: tokens({ gold: 1 }) })),
    ).toBe('§5')
  })

  it('§5: play phase에서의 DISCARD는 거부된다', () => {
    const s = baseState(2)
    expect(ruleOf(() => applyAction(s, { type: 'DISCARD', tokens: tokens({ red: 1 }) }))).toBe(
      '§5',
    )
  })

  it('§5: 정확히 10개는 반납 없이 턴이 넘어간다', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 3 }) }) // 7개
    const { state } = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'black'] })
    expect(tokenTotal(state.players[0]!.tokens)).toBe(10)
    expect(state.phase).toEqual({ kind: 'play' })
    expect(state.currentPlayer).toBe(1)
  })
})
