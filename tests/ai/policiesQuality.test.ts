// M5 리뷰 확정 결함의 회귀 테스트 — 정책·평가의 강함 결함

import { describe, expect, it } from 'vitest'
import { evaluate } from '../../src/ai/evaluate'
import { discardPolicy } from '../../src/ai/policies'
import { baseState, findCard, gems, patchPlayer, tokens } from '../helpers'

describe('discardPolicy — 평가 기반 반납', () => {
  it('예약 대작의 마지막 핵심 토큰을 잉여 토큰보다 먼저 버리지 않는다', () => {
    // 보너스 red 6 + 예약한 red-7 4점 카드 → red 토큰 1개가 구매 거리 0의 핵심
    const target = findCard((c) => c.tier === 3 && c.points === 4 && c.cost.red === 7)
    let s = baseState(2)
    s = patchPlayer(s, 0, {
      bonuses: gems({ red: 6 }),
      tokens: tokens({ red: 1, white: 4, blue: 3, green: 3 }), // 11개 — 1개 반납
      reserved: [{ cardId: target.id, fromDeck: true }],
    })
    s = { ...s, phase: { kind: 'discard', mustDiscard: 1 } }

    const action = discardPolicy(s, 0)
    expect(action.type).toBe('DISCARD')
    if (action.type === 'DISCARD') {
      expect(action.tokens.red, 'red는 핵심 토큰 — 반납하면 안 된다').toBe(0)
      expect(action.tokens.gold).toBe(0)
    }
  })
})

describe('evaluate — 승리 임박도 (§2 full)', () => {
  it('마지막 라운드에 턴이 남지 않은 플레이어는 미래 가치를 인정받지 못한다', () => {
    // 3인전, 선=0, 현재=1 → 잔여 턴: P1, P2. P0은 이번 게임에 더 둘 수 없다
    let s = baseState(3, 7, { currentPlayer: 1, startPlayer: 0 })
    s = patchPlayer(s, 0, { tokens: tokens({ white: 3, blue: 3, red: 2 }), prestige: 10 })

    const active = evaluate({ ...s, finalRound: false }, 0, 'full')
    const finished = evaluate({ ...s, finalRound: true }, 0, 'full')
    expect(finished).toBeLessThan(active) // 토큰·구매 거리 등 미래 항이 제거된다

    // 턴이 남은 P1은 finalRound 여부와 무관하게 미래 가치를 유지한다
    const p1Active = evaluate({ ...s, finalRound: false }, 1, 'full')
    const p1Final = evaluate({ ...s, finalRound: true }, 1, 'full')
    // (상대 P0의 평가가 달라지므로 완전 동일하진 않지만, 자기 미래 항은 유지)
    expect(p1Final).toBeGreaterThanOrEqual(p1Active)
  })

  it('simple 프로파일은 임박도를 보지 못한다 (시야가 좁은 초보)', () => {
    let s = baseState(3, 7, { currentPlayer: 1, startPlayer: 0 })
    s = patchPlayer(s, 0, { tokens: tokens({ white: 3, blue: 3, red: 2 }) })
    expect(evaluate({ ...s, finalRound: true }, 0, 'simple')).toBe(
      evaluate({ ...s, finalRound: false }, 0, 'simple'),
    )
  })
})
