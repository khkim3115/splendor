import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import type { ApplyOutcome } from '../../src/engine/apply'
import { baseState, gems, patchPlayer } from '../helpers'

const take3 = (o: ApplyOutcome | { state: ReturnType<typeof baseState> }): ApplyOutcome =>
  applyAction('state' in o ? o.state : o, {
    type: 'TAKE_DIFFERENT',
    colors: ['red', 'green', 'blue'],
  })

describe('§8 게임 종료 — §9-I 마지막 라운드 세 시나리오', () => {
  it('§9-I 시나리오 A: 선 플레이어가 트리거하면 나머지 전원이 1턴씩 더 한다', () => {
    let s = baseState(3, 1) // start=0, current=0
    s = patchPlayer(s, 0, { prestige: 15 })

    const t0 = take3({ state: s })
    expect(t0.events.some((e) => e.t === 'finalRoundTriggered')).toBe(true)
    expect(t0.state.phase).toEqual({ kind: 'play' })
    expect(t0.state.finalRound).toBe(true)

    const t1 = take3(t0)
    expect(t1.state.phase).toEqual({ kind: 'play' }) // P1 후에도 계속

    const t2 = take3(t1)
    expect(t2.state.phase.kind).toBe('gameOver') // P2(막차) 후 종료
    expect(t2.events.at(-1)!.t).toBe('gameEnded')
    if (t2.state.phase.kind === 'gameOver') {
      expect(t2.state.phase.result.winners).toEqual([0])
      expect(t2.state.phase.result.reason).toBe('prestige15')
    }
  })

  it('§9-I 시나리오 B: 중간 플레이어가 트리거하면 라운드 잔여 인원만 더 한다', () => {
    let s = baseState(3, 1, { currentPlayer: 1 })
    s = patchPlayer(s, 1, { prestige: 15 })

    const t1 = take3({ state: s })
    expect(t1.state.finalRound).toBe(true)
    expect(t1.state.phase).toEqual({ kind: 'play' })

    const t2 = take3(t1) // P2 = 막차
    expect(t2.state.phase.kind).toBe('gameOver') // P0은 추가 턴을 받지 않는다
  })

  it('§9-I 시나리오 C: 라운드 마지막 플레이어가 트리거하면 즉시 종료된다', () => {
    let s = baseState(3, 1, { currentPlayer: 2 })
    s = patchPlayer(s, 2, { prestige: 15 })

    const t2 = take3({ state: s })
    expect(t2.state.phase.kind).toBe('gameOver')
    expect(t2.events.map((e) => e.t)).toEqual([
      'tokensTaken',
      'finalRoundTriggered',
      'gameEnded',
    ])
  })

  it('§8-2: 마지막 라운드 중의 득점도 유효하며 추가 라운드는 생기지 않는다', () => {
    let s = baseState(3, 1)
    s = patchPlayer(s, 0, { prestige: 15 })
    s = patchPlayer(s, 1, { prestige: 16 }) // 마지막 라운드 중 더 높은 점수

    const t0 = take3({ state: s })
    const t1 = take3(t0)
    // P1이 16점이지만 finalRoundTriggered는 한 번만
    expect(t1.events.some((e) => e.t === 'finalRoundTriggered')).toBe(false)
    const t2 = take3(t1)
    expect(t2.state.phase.kind).toBe('gameOver')
    if (t2.state.phase.kind === 'gameOver') {
      expect(t2.state.phase.result.winners).toEqual([1]) // 최고점이 승리
    }
  })

  it('§8-4: 동점이면 구매한 개발 카드 수가 적은 쪽이 승리한다', () => {
    let s = baseState(2, 1, { currentPlayer: 1 }) // 2인전: P1이 막차
    s = patchPlayer(s, 0, { prestige: 15, purchased: [0, 1, 2] })
    s = patchPlayer(s, 1, { prestige: 15, purchased: [3, 4] })

    const t = take3({ state: s })
    expect(t.state.phase.kind).toBe('gameOver')
    if (t.state.phase.kind === 'gameOver') {
      expect(t.state.phase.result.winners).toEqual([1]) // 카드 2장 < 3장
    }
  })

  it('§8-5 [구현 결정]: 점수·카드 수 모두 같으면 공동 승리', () => {
    let s = baseState(2, 1, { currentPlayer: 1 })
    s = patchPlayer(s, 0, { prestige: 15, purchased: [0, 1] })
    s = patchPlayer(s, 1, { prestige: 15, purchased: [2, 3] })

    const t = take3({ state: s })
    if (t.state.phase.kind === 'gameOver') {
      expect(t.state.phase.result.winners).toEqual([0, 1])
    } else {
      throw new Error('게임이 종료되어야 합니다')
    }
  })

  it('§8-3: 귀족 점수가 15점 트리거에 합산된다 (귀족 수여 → 트리거 순서)', () => {
    let s = baseState(2, 1, { nobles: [0], currentPlayer: 1 })
    // 귀족 0 = {red:4, black:4}. 12점 + 귀족 3점 = 15점
    s = patchPlayer(s, 1, { prestige: 12, bonuses: gems({ red: 4, black: 4 }) })

    const t = take3({ state: s })
    expect(t.events.map((e) => e.t)).toEqual([
      'tokensTaken',
      'nobleVisited',
      'finalRoundTriggered',
      'gameEnded',
    ])
    if (t.state.phase.kind === 'gameOver') {
      expect(t.state.phase.result.scores[1]!.prestige).toBe(15)
    }
  })

  it('§8: 15점 미만이면 게임은 계속된다', () => {
    let s = baseState(2, 1)
    s = patchPlayer(s, 0, { prestige: 14 })
    const t = take3({ state: s })
    expect(t.state.finalRound).toBe(false)
    expect(t.state.phase).toEqual({ kind: 'play' })
  })
})
