import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { IllegalActionError } from '../../src/engine/errors'
import { allPlayersStuck, hasAnyLegalPlayAction } from '../../src/engine/legal'
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

/** 공급처 완전 고갈 + 지정 플레이어들 예약 가득 + 빈손 → 진행 불능 상태 조립 */
function stuckState(stuckPlayers: readonly number[]): GameState {
  let s = baseState(2, 1, { supply: tokens() })
  for (const i of stuckPlayers) {
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

describe('§9-G 패스(행동 생략)', () => {
  it('§9-G: 가능한 행동이 하나라도 있으면 패스할 수 없다', () => {
    expect(ruleOf(() => applyAction(baseState(2), { type: 'PASS' }))).toBe('§9-G')
  })

  it('§9-G: 토큰이 10개여도 공급처에 보석이 있으면 패스할 수 없다 (가져와서 반납 가능)', () => {
    let s = baseState(2)
    s = patchPlayer(s, 0, { tokens: tokens({ white: 4, blue: 4, green: 2 }) })
    expect(hasAnyLegalPlayAction(s)).toBe(true)
    expect(ruleOf(() => applyAction(s, { type: 'PASS' }))).toBe('§9-G')
  })

  it('§9-G: 합법 행동이 공집합인 플레이어만 패스할 수 있다', () => {
    const s = stuckState([0]) // P0만 막힘, P1은 예약 여유가 있음
    expect(hasAnyLegalPlayAction(s, 0)).toBe(false)
    expect(hasAnyLegalPlayAction(s, 1)).toBe(true)
    expect(allPlayersStuck(s)).toBe(false)

    const { state, events } = applyAction(s, { type: 'PASS' })
    expect(events.map((e) => e.t)).toEqual(['turnEnded']) // 게임은 계속
    expect(state.currentPlayer).toBe(1)
  })

  it('§9-E [구현 결정]: 전원 진행 불능이면 현재 점수로 게임을 종료한다', () => {
    let s = stuckState([0, 1])
    s = patchPlayer(s, 0, { prestige: 7 })
    s = patchPlayer(s, 1, { prestige: 4 })
    expect(allPlayersStuck(s)).toBe(true)

    const { state, events } = applyAction(s, { type: 'PASS' })
    expect(events.map((e) => e.t)).toEqual(['gameEnded'])
    if (state.phase.kind === 'gameOver') {
      expect(state.phase.result.reason).toBe('deadlockExhausted')
      expect(state.phase.result.winners).toEqual([0])
    } else {
      throw new Error('게임이 종료되어야 합니다')
    }
  })

  it('§9-G: 마지막 라운드 중에는 교착 종료 대신 §8 라운드 종료가 처리한다', () => {
    const s: GameState = { ...stuckState([0, 1]), finalRound: true }

    const t0 = applyAction(s, { type: 'PASS' }) // P0 (막차 아님)
    expect(t0.state.phase).toEqual({ kind: 'play' })

    const t1 = applyAction(t0.state, { type: 'PASS' }) // P1 = 막차
    expect(t1.state.phase.kind).toBe('gameOver')
    if (t1.state.phase.kind === 'gameOver') {
      expect(t1.state.phase.result.reason).toBe('prestige15')
    }
  })
})
