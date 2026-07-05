// 적대적 테스트 — 종료와 교착 (docs/RULES.md §8, §9-E/G/I)
// 기존 tests/engine/endgame.test.ts(주로 3인·startPlayer=0)가 안 건드린 각도를 공격한다:
// 2인/4인 마지막 라운드, startPlayer≠0, 동점 3파전, 부분 교착 해제,
// finalRound 중 discard/chooseNoble phase 개입, 15점 정확히/초과.
// 기대값은 전부 RULES.md에서 도출했다 (엔진 동작 역산 금지).

import { describe, expect, it } from 'vitest'
import { applyAction, type ApplyOutcome } from '../../src/engine/apply'
import { IllegalActionError } from '../../src/engine/errors'
import { allPlayersStuck, hasAnyLegalPlayAction } from '../../src/engine/legal'
import type { GameResult, GameState } from '../../src/engine/types'
import { baseState, findCard, gems, patchPlayer, placeOnBoard, tokens } from '../helpers'

/** 행동 A(빨강·초록·파랑 1개씩) — 점수를 바꾸지 않는 중립 행동 */
const take3 = (s: GameState): ApplyOutcome =>
  applyAction(s, { type: 'TAKE_DIFFERENT', colors: ['red', 'green', 'blue'] })

/** gameOver가 아니면 실패시키고, 맞으면 결과를 꺼낸다 */
function resultOf(s: GameState): GameResult {
  if (s.phase.kind !== 'gameOver') {
    throw new Error(`게임이 종료되어야 합니다 (현재 phase: ${s.phase.kind})`)
  }
  return s.phase.result
}

/** 공급처 0 + 예약 3장 + 빈손 → 해당 플레이어를 §9-G 진행 불능으로 만든다 */
function makeStuck(s: GameState, playerIndex: number, deckOffset: number): GameState {
  return patchPlayer(s, playerIndex, {
    tokens: tokens(),
    reserved: [
      { cardId: s.decks[2]![deckOffset]!, fromDeck: true },
      { cardId: s.decks[2]![deckOffset + 1]!, fromDeck: true },
      { cardId: s.decks[2]![deckOffset + 2]!, fromDeck: true },
    ],
  })
}

describe('§9-I 마지막 라운드 — startPlayer ≠ 0 (기존 테스트는 전부 startPlayer=0)', () => {
  it('§8-2/§9-I: 2인·선=P1 — 선이 트리거하면 P0(막차)만 1턴 더 하고 종료된다', () => {
    // 턴 순서: P1(선) → P0(막차). 선이 트리거 → 잔여 인원(P0)만 1턴 (§8-2 "같은 턴 수")
    let s = baseState(2, 1, { startPlayer: 1, currentPlayer: 1 })
    s = patchPlayer(s, 1, { prestige: 15 })

    const t0 = take3(s) // P1(선) 트리거
    expect(t0.events.some((e) => e.t === 'finalRoundTriggered')).toBe(true)
    expect(t0.state.finalRound).toBe(true)
    expect(t0.state.phase).toEqual({ kind: 'play' }) // 아직 종료 아님
    expect(t0.state.currentPlayer).toBe(0)

    const t1 = take3(t0.state) // P0 = 막차
    expect(resultOf(t1.state).winners).toEqual([1])
    expect(resultOf(t1.state).reason).toBe('prestige15')
  })

  it('§8-2/§9-I: 2인·선=P1 — 막차(P0)가 트리거하면 즉시 종료, 선(P1)은 추가 턴이 없다', () => {
    let s = baseState(2, 1, { startPlayer: 1, currentPlayer: 0 })
    s = patchPlayer(s, 0, { prestige: 15 })

    const t = take3(s) // P0 = 라운드 마지막 순번
    expect(t.events.map((e) => e.t)).toEqual([
      'tokensTaken',
      'finalRoundTriggered',
      'gameEnded',
    ])
    expect(resultOf(t.state).winners).toEqual([0])
  })

  it('§8-2/§9-I: 3인·선=P2 — 선 자신이 트리거하면 나머지 전원(P0,P1)이 각 1턴 후 종료된다', () => {
    // 턴 순서: P2(선) → P0 → P1(막차)
    let s = baseState(3, 1, { startPlayer: 2, currentPlayer: 2 })
    s = patchPlayer(s, 2, { prestige: 15 })

    const t0 = take3(s) // P2(선) 트리거
    expect(t0.state.finalRound).toBe(true)
    expect(t0.state.phase).toEqual({ kind: 'play' })

    const t1 = take3(t0.state) // P0
    expect(t1.state.phase).toEqual({ kind: 'play' }) // P1이 남아 있으므로 계속

    const t2 = take3(t1.state) // P1 = 막차
    expect(resultOf(t2.state).winners).toEqual([2])
  })

  it('§8-2/§9-I: 4인·선=P2 — 중간(P3) 트리거 시 P0·P1만 더 하고, 선 P2는 추가 턴이 없다', () => {
    // 턴 순서: P2(선) → P3 → P0 → P1(막차). P3 트리거 → P0, P1 각 1턴 → 종료
    let s = baseState(4, 1, { startPlayer: 2, currentPlayer: 3 })
    s = patchPlayer(s, 3, { prestige: 15 })

    const t0 = take3(s) // P3 트리거
    expect(t0.state.finalRound).toBe(true)
    expect(t0.state.phase).toEqual({ kind: 'play' })
    expect(t0.state.currentPlayer).toBe(0)

    const t1 = take3(t0.state) // P0
    expect(t1.state.phase).toEqual({ kind: 'play' })
    expect(t1.state.currentPlayer).toBe(1)

    const t2 = take3(t1.state) // P1 = 막차 → 종료 (P2는 두 번째 턴을 받으면 안 된다)
    expect(resultOf(t2.state).winners).toEqual([3])
  })
})

describe('§8-4/§8-5 동점 3파전 (기존 테스트는 2인 동점만)', () => {
  it('§8-4: 4인 3파전 동점 — 트리거한 플레이어라도 구매 카드 수가 많으면 패배한다', () => {
    // P1·P2·P3 모두 16점. 카드 수 P1=1, P2=1, P3=3 → 카드가 적은 P1·P2 공동 승리
    let s = baseState(4, 1, { currentPlayer: 3 }) // 선=P0, 막차=P3
    s = patchPlayer(s, 0, { prestige: 10 })
    s = patchPlayer(s, 1, { prestige: 16, purchased: [3] })
    s = patchPlayer(s, 2, { prestige: 16, purchased: [4] })
    s = patchPlayer(s, 3, { prestige: 16, purchased: [0, 1, 2] })

    const t = take3(s) // P3(막차) 턴 종료 → 트리거 + 즉시 종료
    const r = resultOf(t.state)
    expect(r.reason).toBe('prestige15')
    expect(r.winners).toEqual([1, 2]) // §8-4: 동점 시 구매 카드 수 최소인 쪽
  })

  it('§8-5 [구현 결정]: 3인 전원 점수·카드 수 완전 동률 — 3인 공동 승리', () => {
    let s = baseState(3, 1, { currentPlayer: 2 }) // 선=P0, 막차=P2
    s = patchPlayer(s, 0, { prestige: 15, purchased: [0, 1] })
    s = patchPlayer(s, 1, { prestige: 15, purchased: [2, 3] })
    s = patchPlayer(s, 2, { prestige: 15, purchased: [4, 5] })

    const t = take3(s)
    expect(resultOf(t.state).winners).toEqual([0, 1, 2])
  })
})

describe('§8-1 트리거 경계 — 15점 정확히 / 초과 (실제 행동 경로)', () => {
  it('§8-1: 실제 구매로 정확히 15점에 도달하면 트리거되고, 라운드 종료 후 승리한다', () => {
    // 1점 카드(7번: 초록4 비용)를 구매해 14→15
    const card = findCard((c) => c.points === 1)
    let s = baseState(2, 1)
    s = placeOnBoard(s, card.id)
    s = patchPlayer(s, 0, { prestige: 14, tokens: tokens({ ...card.cost }) })

    const t0 = applyAction(s, {
      type: 'PURCHASE',
      cardId: card.id,
      payment: tokens({ ...card.cost }),
    })
    expect(t0.events.some((e) => e.t === 'finalRoundTriggered')).toBe(true) // 정확히 15 = 트리거
    expect(t0.state.finalRound).toBe(true)
    expect(t0.state.phase).toEqual({ kind: 'play' }) // 선=P0이 트리거 → P1이 남음

    const t1 = take3(t0.state) // P1 = 막차
    const r = resultOf(t1.state)
    expect(r.scores[0]!.prestige).toBe(15)
    expect(r.winners).toEqual([0])
  })

  it('§8: 14점(15점 미만)에서는 트리거되지 않는다 — 막차 턴이 끝나도 게임이 계속된다', () => {
    let s = baseState(2, 1, { currentPlayer: 1 }) // P1 = 막차
    s = patchPlayer(s, 1, { prestige: 14 })

    const t = take3(s)
    expect(t.state.finalRound).toBe(false)
    expect(t.state.phase).toEqual({ kind: 'play' })
    expect(t.state.currentPlayer).toBe(0) // 다음 라운드로 정상 진행
  })
})

describe('§5/§6 × §8 — finalRound 중 discard/chooseNoble phase가 끼는 턴의 종료 판정', () => {
  it('§5+§9-I: 막차의 discard phase 중에는 게임이 끝나지 않고, 반납 완료 후에 끝난다', () => {
    // finalRound 중 막차 P1이 토큰 9개 → 3개 획득 → 12개 → 2개 반납 phase
    let s = baseState(2, 1, { finalRound: true, currentPlayer: 1 })
    s = patchPlayer(s, 0, { prestige: 15 }) // finalRound의 원인 제공자
    s = patchPlayer(s, 1, { tokens: tokens({ white: 3, blue: 3, black: 3 }) })

    const t0 = take3(s)
    expect(t0.state.phase).toEqual({ kind: 'discard', mustDiscard: 2 }) // §5 반납 대기
    // 반납이 끝나기 전에는 턴이 종료되지 않았으므로 게임도 끝나면 안 된다 (§6 처리 순서 ②→④)
    expect(t0.events.some((e) => e.t === 'gameEnded')).toBe(false)

    const t1 = applyAction(t0.state, { type: 'DISCARD', tokens: tokens({ white: 2 }) })
    expect(t1.events.map((e) => e.t)).toEqual(['tokensReturned', 'gameEnded'])
    const r = resultOf(t1.state)
    expect(r.reason).toBe('prestige15')
    expect(r.winners).toEqual([0])
  })

  it('§6/§9-J+§8-1: 막차가 chooseNoble phase를 거쳐 귀족으로 15점을 초과하면 선택 직후 종료된다', () => {
    // P1(막차) 13점 + 귀족 3점 = 16점(초과 트리거). 귀족 0(빨4·검4)·2(초4·빨4) 동시 충족
    let s = baseState(2, 1, { currentPlayer: 1, nobles: [0, 2] })
    s = patchPlayer(s, 1, {
      prestige: 13,
      bonuses: gems({ green: 4, red: 4, black: 4 }),
    })

    const t0 = take3(s)
    // 복수 귀족 충족 → 플레이어 선택 대기. 턴이 아직 안 끝났으므로 종료/트리거 금지
    expect(t0.state.phase).toEqual({ kind: 'chooseNoble', options: [0, 2] })
    expect(t0.state.finalRound).toBe(false)
    expect(t0.events.some((e) => e.t === 'gameEnded')).toBe(false)

    const t1 = applyAction(t0.state, { type: 'CHOOSE_NOBLE', nobleId: 2 })
    expect(t1.events.map((e) => e.t)).toEqual([
      'nobleVisited',
      'finalRoundTriggered',
      'gameEnded',
    ])
    const r = resultOf(t1.state)
    expect(r.scores[1]!.prestige).toBe(16) // 13 + 귀족 3 = 16 (15 초과도 정상 트리거)
    expect(r.winners).toEqual([1])
  })

  it('§5+§8-1+§9-I: 막차 트리거 턴에 discard가 끼면 반납 완료 시 트리거와 종료가 동시에 처리된다', () => {
    // 막차 P1이 이미 15점 + 토큰 9개 → 3개 획득 → discard → 반납 완료가 곧 턴 종료 = 트리거 + 즉시 종료
    let s = baseState(2, 1, { currentPlayer: 1 })
    s = patchPlayer(s, 1, { prestige: 15, tokens: tokens({ white: 3, blue: 3, black: 3 }) })

    const t0 = take3(s)
    expect(t0.state.phase).toEqual({ kind: 'discard', mustDiscard: 2 })
    expect(t0.state.finalRound).toBe(false) // 턴 종료 전 — 아직 트리거 금지

    const t1 = applyAction(t0.state, { type: 'DISCARD', tokens: tokens({ blue: 2 }) })
    expect(t1.events.map((e) => e.t)).toEqual([
      'tokensReturned',
      'finalRoundTriggered',
      'gameEnded',
    ])
    expect(resultOf(t1.state).winners).toEqual([1])
  })

  it('§5+§8-1: 트리거 당사자의 턴에 discard가 끼면 트리거는 반납 완료 후(턴 종료 시)에 발생한다', () => {
    // 선 P0: 이미 15점 + 토큰 9개 → 3개 획득 → discard phase → 반납 후 트리거 → P1 턴 → 종료
    let s = baseState(2, 1)
    s = patchPlayer(s, 0, { prestige: 15, tokens: tokens({ white: 3, blue: 3, black: 3 }) })

    const t0 = take3(s)
    expect(t0.state.phase).toEqual({ kind: 'discard', mustDiscard: 2 })
    // §8-1 트리거는 "턴 종료 시점 기준" — 반납 전에는 아직 트리거되지 않아야 한다 (§6 순서 ②→④)
    expect(t0.events.some((e) => e.t === 'finalRoundTriggered')).toBe(false)
    expect(t0.state.finalRound).toBe(false)

    const t1 = applyAction(t0.state, { type: 'DISCARD', tokens: tokens({ white: 2 }) })
    expect(t1.events.some((e) => e.t === 'finalRoundTriggered')).toBe(true)
    expect(t1.state.finalRound).toBe(true)
    expect(t1.state.phase).toEqual({ kind: 'play' }) // 선이 트리거 → P1이 남음
    expect(t1.state.currentPlayer).toBe(1)

    const t2 = take3(t1.state) // P1 = 막차
    expect(resultOf(t2.state).winners).toEqual([0])
  })
})

describe('§9-E/G 교착 — 부분 교착과 해제 (기존 테스트는 정적 판정만)', () => {
  it('§9-G: 한 명만 막힌 교착에서 상대의 구매로 토큰이 풀리면 더는 패스할 수 없다', () => {
    // P0: 공급처 0 + 예약 3장 + 빈손 → 진행 불능. P1: 구매 가능 → 게임 계속
    const cheap = findCard((c) => c.tier === 1 && c.points === 0)
    let s = baseState(2, 1, { supply: tokens() })
    s = placeOnBoard(s, cheap.id)
    s = makeStuck(s, 0, 0)
    s = patchPlayer(s, 1, { tokens: tokens({ ...cheap.cost }) })

    expect(hasAnyLegalPlayAction(s, 0)).toBe(false)
    expect(hasAnyLegalPlayAction(s, 1)).toBe(true)
    expect(allPlayersStuck(s)).toBe(false)

    // P0의 자동 패스는 턴 스킵일 뿐, 게임을 끝내면 안 된다 (§9-G)
    const t0 = applyAction(s, { type: 'PASS' })
    expect(t0.events.map((e) => e.t)).toEqual(['turnEnded'])
    expect(t0.state.phase).toEqual({ kind: 'play' })

    // P1이 구매 → 지불 토큰이 공급처로 귀환 (§9-M) → P0의 행동 A가 되살아난다
    const t1 = applyAction(t0.state, {
      type: 'PURCHASE',
      cardId: cheap.id,
      payment: tokens({ ...cheap.cost }),
    })
    expect(t1.state.currentPlayer).toBe(0)
    expect(hasAnyLegalPlayAction(t1.state, 0)).toBe(true)

    // §9-G: 가능한 행동이 생겼으므로 패스는 불법이어야 한다
    expect(() => applyAction(t1.state, { type: 'PASS' })).toThrow(IllegalActionError)
    try {
      applyAction(t1.state, { type: 'PASS' })
    } catch (e) {
      expect((e as IllegalActionError).rule).toBe('§9-G')
    }
  })

  it('§9-E+§8-4: 전원 교착 종료에도 동점 타이브레이크(구매 카드 수 최소)가 적용된다', () => {
    // §9-E [구현 결정]: 교착 종료 시 "§8의 3~5항을 적용" — 동점 규칙 포함
    let s = baseState(2, 1, { supply: tokens() })
    s = makeStuck(s, 0, 0)
    s = makeStuck(s, 1, 3)
    s = patchPlayer(s, 0, { prestige: 8, purchased: [0, 1, 2] }) // 8점, 카드 3장
    s = patchPlayer(s, 1, { prestige: 8, purchased: [10, 11] }) // 8점, 카드 2장
    expect(allPlayersStuck(s)).toBe(true)

    const t = applyAction(s, { type: 'PASS' })
    const r = resultOf(t.state)
    expect(r.reason).toBe('deadlockExhausted')
    expect(r.winners).toEqual([1]) // §8-4: 카드 2장 < 3장
    expect(r.scores.map((x) => x.prestige)).toEqual([8, 8])
  })
})
