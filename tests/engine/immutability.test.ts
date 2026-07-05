import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { hashState } from '../../src/engine/serialize'
import { setupGame } from '../../src/engine/setup'
import type { Action } from '../../src/engine/types'
import { baseState, config, patchPlayer, tokens } from '../helpers'

describe('불변성·결정론·이벤트 계약', () => {
  it('applyAction은 입력 상태를 변형하지 않는다 (deep-freeze + 직렬화 비교)', () => {
    const s = baseState(2)
    const before = JSON.stringify(s)
    applyAction(s, { type: 'TAKE_SAME', color: 'red' })
    expect(JSON.stringify(s)).toBe(before)

    // deep-freeze 가드: 적용 후 입력 상태의 깊은 곳까지 동결된다
    expect(Object.isFrozen(s)).toBe(true)
    expect(Object.isFrozen(s.players[0])).toBe(true)
    expect(Object.isFrozen(s.players[0]!.tokens)).toBe(true)
    expect(Object.isFrozen(s.board[0])).toBe(true)
  })

  it('반환된 상태도 동결되어 하위 계층의 변이 시도가 즉시 드러난다', () => {
    const { state } = applyAction(baseState(2), { type: 'TAKE_SAME', color: 'red' })
    const mutable = state as unknown as { turn: number }
    expect(() => {
      mutable.turn = 99
    }).toThrow(TypeError)
  })

  it('같은 (seed, actions) → hashState 동일 (결정론)', () => {
    const script: readonly Action[] = [
      { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'blue'] },
      { type: 'TAKE_SAME', color: 'white' },
      { type: 'RESERVE_DECK', tier: 1 },
      { type: 'TAKE_DIFFERENT', colors: ['black', 'white', 'blue'] },
    ]
    const run = () => {
      let s = { ...setupGame(config(2, 42)), currentPlayer: 0, startPlayer: 0 }
      for (const a of script) {
        s = applyAction(s, a).state
      }
      return hashState(s)
    }
    expect(run()).toBe(run())
  })

  it('모든 applyAction 호출은 비어 있지 않은 events를 반환한다', () => {
    // 행동 4종 + DISCARD + CHOOSE_NOBLE은 각 §테스트에서 검증됨. 여기선 PASS 경로 확인
    let s = baseState(2, 1, { supply: tokens() })
    s = patchPlayer(s, 0, {
      tokens: tokens(),
      reserved: [
        { cardId: s.decks[2]![0]!, fromDeck: true },
        { cardId: s.decks[2]![1]!, fromDeck: true },
        { cardId: s.decks[2]![2]!, fromDeck: true },
      ],
    })
    const { events } = applyAction(s, { type: 'PASS' })
    expect(events.length).toBeGreaterThan(0)
  })

  it('턴 종료 이벤트는 항상 마지막이다 (이벤트 순서 = 처리 순서)', () => {
    const s = baseState(2)
    const { events } = applyAction(s, { type: 'TAKE_SAME', color: 'red' })
    expect(events.at(-1)!.t).toBe('turnEnded')
  })
})
