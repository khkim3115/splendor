import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { IllegalActionError } from '../../src/engine/errors'
import type { GemColor } from '../../src/engine/types'
import { baseState, tokens } from '../helpers'

const ruleOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    if (e instanceof IllegalActionError) return e.rule
    throw e
  }
  throw new Error('IllegalActionError가 발생하지 않았습니다')
}

describe('§4.1 행동 A — 서로 다른 색 보석 3개', () => {
  it('§4.1: 서로 다른 3색을 가져오면 공급처가 줄고 플레이어가 얻는다', () => {
    const s = baseState(2)
    const { state, events } = applyAction(s, {
      type: 'TAKE_DIFFERENT',
      colors: ['red', 'green', 'blue'],
    })
    expect(state.players[0]!.tokens).toEqual(tokens({ red: 1, green: 1, blue: 1 }))
    expect(state.supply.red).toBe(3)
    expect(state.supply.gold).toBe(5)
    expect(events.map((e) => e.t)).toEqual(['tokensTaken', 'turnEnded'])
    expect(state.currentPlayer).toBe(1)
    expect(state.turn).toBe(1)
  })

  it('§4.1: 같은 색 중복 선택은 거부된다', () => {
    const s = baseState(2)
    expect(
      ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'red', 'blue'] })),
    ).toBe('§4.1')
  })

  it('§4.1 엄격 해석: 3색 이상 남았는데 1~2개만 가져오는 것은 거부된다', () => {
    const s = baseState(2)
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red'] }))).toBe('§4.1')
    expect(
      ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'blue'] })),
    ).toBe('§4.1')
  })

  it('§9-B: 2색만 남았으면 2개를 가져올 수 있고, 그 이하/이상은 거부된다', () => {
    const s = baseState(2, 1, { supply: tokens({ red: 2, blue: 1, gold: 5 }) })
    const { state } = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'blue'] })
    expect(state.players[0]!.tokens).toEqual(tokens({ red: 1, blue: 1 }))

    const s2 = baseState(2, 1, { supply: tokens({ red: 2, blue: 1, gold: 5 }) })
    expect(ruleOf(() => applyAction(s2, { type: 'TAKE_DIFFERENT', colors: ['red'] }))).toBe('§4.1')
    expect(
      ruleOf(() =>
        applyAction(s2, { type: 'TAKE_DIFFERENT', colors: ['red', 'blue', 'green'] }),
      ),
    ).toBe('§4.1')
  })

  it('§9-A: 1색만 남았으면 1개, 0색이면 행동 A 자체가 불가', () => {
    const s = baseState(2, 1, { supply: tokens({ green: 3, gold: 5 }) })
    const { state } = applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['green'] })
    expect(state.players[0]!.tokens).toEqual(tokens({ green: 1 }))

    const empty = baseState(2, 1, { supply: tokens({ gold: 5 }) })
    expect(ruleOf(() => applyAction(empty, { type: 'TAKE_DIFFERENT', colors: ['green'] }))).toBe(
      '§4.1',
    )
    expect(ruleOf(() => applyAction(empty, { type: 'TAKE_DIFFERENT', colors: [] }))).toBe('§9-A')
  })

  it('§9-F: 황금은 행동 A로 가져올 수 없다 (런타임 방어)', () => {
    const s = baseState(2)
    const goldSneak = ['gold', 'red', 'blue'] as unknown as GemColor[]
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: goldSneak }))).toBe(
      '§9-F',
    )
  })
})

describe('§4.2 행동 B — 같은 색 보석 2개', () => {
  it('§4.2: 4개 이상 남은 색에서 2개를 가져온다 (정확히 4개 남은 경우 허용)', () => {
    const s = baseState(2) // 2인전: 각 색 4개
    const { state } = applyAction(s, { type: 'TAKE_SAME', color: 'red' })
    expect(state.players[0]!.tokens).toEqual(tokens({ red: 2 }))
    expect(state.supply.red).toBe(2)
  })

  it('§9-C: 3개 이하 남은 색에서는 같은 색 2개를 가져올 수 없다', () => {
    const s = baseState(2, 1, { supply: tokens({ red: 3, blue: 4, gold: 5 }) })
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'red' }))).toBe('§4.2')
  })

  it('§9-F: 황금은 행동 B로도 가져올 수 없다 (런타임 방어)', () => {
    const s = baseState(2)
    expect(
      ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'gold' as unknown as GemColor })),
    ).toBe('§9-F')
  })
})

describe('§4 phase 가드', () => {
  it('discard phase에서는 행동 A/B가 거부된다', () => {
    const s = baseState(2, 1, { phase: { kind: 'discard', mustDiscard: 1 } })
    expect(
      ruleOf(() => applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'blue', 'green'] })),
    ).toBe('§4')
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'red' }))).toBe('§4')
  })

  it('gameOver phase에서는 모든 액션이 거부된다', () => {
    const s = baseState(2, 1, {
      phase: {
        kind: 'gameOver',
        result: { winners: [0], scores: [], reason: 'prestige15' },
      },
    })
    expect(ruleOf(() => applyAction(s, { type: 'TAKE_SAME', color: 'red' }))).toBe('§8')
    expect(ruleOf(() => applyAction(s, { type: 'PASS' }))).toBe('§8')
  })
})
