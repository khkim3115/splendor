// 어려움 MCTS (docs/AI_DESIGN.md §4) — anytime 계약, 즉승 가드, 결정론,
// composite 스왑, policy-consistency(hard 확장)

import { describe, expect, it } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { canonicalPayment } from '../../src/engine/payment'
import { isLegal, legalActions } from '../../src/engine/legal'
import { playerView } from '../../src/engine/view'
import { setupGame } from '../../src/engine/setup'
import { hashState } from '../../src/engine/serialize'
import { createRng, nextInt, type RngState } from '../../src/engine/rng'
import type { GameState } from '../../src/engine/types'
import { createHardAgent, createPlanMemo, mctsChoose } from '../../src/ai/mcts'
import { evaluate, evaluateAllFull } from '../../src/ai/evaluate'
import { compositeMoves } from '../../src/ai/moveGen'
import { discardPolicy, noblePolicy } from '../../src/ai/policies'
import { applyResolved, applyResolvedWith } from '../../src/ai/search'
import { baseState, config, findCard, patchPlayer, placeOnBoard, tokens } from '../helpers'

describe('mctsChoose', () => {
  it('즉승 국면 픽스처에서 어려움은 항상 즉승수를 선택한다 (M6 DoD)', () => {
    const winner = findCard((c) => c.tier === 3 && c.points === 5)
    let s = placeOnBoard(baseState(2), winner.id)
    s = patchPlayer(s, 0, {
      prestige: 10,
      tokens: tokens({ white: 7, blue: 7, green: 7, red: 7, black: 7 }),
    })
    for (let seed = 0; seed < 5; seed++) {
      const agent = createHardAgent()
      const [action] = agent.chooseAction(playerView(s, 0), 0, 50, createRng(seed))
      expect(action).toEqual({
        type: 'PURCHASE',
        cardId: winner.id,
        payment: canonicalPayment(s.players[0]!, winner),
      })
    }
  })

  it('anytime: 예산 0에서도 1-ply 폴백으로 합법 수를 반환한다', () => {
    const s = baseState(2, 11)
    const view = playerView(s, 0)
    const [move, , stats] = mctsChoose(view, 0, 0, createRng(1))
    expect(stats.iters).toBe(0)
    expect(isLegal(s, move.action)).toBe(true)
  })

  it('시뮬레이션 수 고정 시 같은 시드는 같은 수 (결정론)', () => {
    const s = baseState(3, 21)
    const view = playerView(s, 0)
    const pick = () => mctsChoose(view, 0, 60_000, createRng(9), { maxIters: 150 })
    const [a, , statsA] = pick()
    const [b, , statsB] = pick()
    expect(statsA.iters).toBe(150)
    expect(statsB.iters).toBe(150)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(isLegal(s, a.action)).toBe(true)
  })

  it('예산을 크게 넘기지 않는다 (16회 간격 시간 체크의 오버슈트 한도)', () => {
    const s = baseState(2, 31)
    const [, , stats] = mctsChoose(playerView(s, 0), 0, 150, createRng(2))
    expect(stats.iters).toBeGreaterThan(0)
    expect(stats.elapsedMs).toBeLessThan(700) // 예산 150ms + CI 여유
  })

  it('프로덕션 예산(1,000ms)에서 하드 타임아웃(1,500ms) 안에 착수한다 (§5.4, M6 DoD)', () => {
    const s = baseState(2, 33)
    const [move, , stats] = mctsChoose(playerView(s, 0), 0, 1000, createRng(4))
    expect(isLegal(s, move.action)).toBe(true)
    expect(stats.iters).toBeGreaterThan(100)
    expect(stats.elapsedMs).toBeLessThan(1450) // 초과 시 클라이언트가 그리디 폴백해 강함이 사라진다
  })
})

describe('hard 에이전트 policy-consistency (§4.3 확장)', () => {
  /** 무작위 완주 중 discard/chooseNoble 국면 채집 */
  function collectPhases(): { discard: GameState[]; chooseNoble: GameState[] } {
    const discard: GameState[] = []
    const chooseNoble: GameState[] = []
    for (let seed = 0; seed < 25 && (discard.length < 10 || chooseNoble.length < 3); seed++) {
      let s = setupGame(config(2 + (seed % 3), seed))
      let rng: RngState = createRng(seed ^ 0x33aa)
      for (let step = 0; step < 800 && s.phase.kind !== 'gameOver'; step++) {
        if (s.phase.kind === 'discard' && discard.length < 20) discard.push(s)
        if (s.phase.kind === 'chooseNoble' && chooseNoble.length < 10) chooseNoble.push(s)
        const legal = legalActions(s)
        const [i, next] = nextInt(rng, legal.length)
        rng = next
        s = applyAction(s, legal[i]!).state
      }
    }
    return { discard, chooseNoble }
  }

  const phases = collectPhases()

  it(`discard phase 즉답 = discardPolicy (${phases.discard.length}개 국면, 계획 없음)`, () => {
    expect(phases.discard.length).toBeGreaterThanOrEqual(5)
    for (const s of phases.discard) {
      const agent = createHardAgent()
      const view = playerView(s, s.currentPlayer)
      const [action, , stats] = agent.chooseAction(view, s.currentPlayer, 1000, createRng(1))
      expect(action).toEqual(discardPolicy(view, s.currentPlayer))
      expect(stats.iters).toBe(0) // 탐색하지 않고 즉답 (§1 계약)
      expect(isLegal(s, action)).toBe(true)
    }
  })

  it(`chooseNoble phase 즉답 = noblePolicy (${phases.chooseNoble.length}개 국면)`, () => {
    for (const s of phases.chooseNoble) {
      const agent = createHardAgent()
      const view = playerView(s, s.currentPlayer)
      const [action] = agent.chooseAction(view, s.currentPlayer, 1000, createRng(1))
      expect(action).toEqual(noblePolicy(view, s.currentPlayer))
      expect(isLegal(s, action)).toBe(true)
    }
  })
})

describe('compositeMoves — 토큰 스왑 대표 패턴 (§4.3)', () => {
  // 9개 보유 → 3개 집기 = 12개 → 2개 반납 국면
  const overflowState = () =>
    patchPlayer(baseState(2, 41), 0, {
      tokens: tokens({ white: 3, blue: 3, green: 3 }),
    })

  it('10개 초과를 유발하는 TAKE에 대해 정책과 다른 합법 반납을 생성한다', () => {
    const s = overflowState()
    const legal = legalActions(s)
    const composites = compositeMoves(s, legal)
    expect(composites.length).toBeGreaterThan(0)
    expect(composites.length).toBeLessThanOrEqual(8) // 대표 소수 — 루트 폭발 방지

    for (const move of composites) {
      expect(move.forcedDiscard).toBeDefined()
      // 같은 take가 legalActions에도 존재한다 (composite는 해소만 다르다)
      expect(legal.some((a) => JSON.stringify(a) === JSON.stringify(move.action))).toBe(true)
      const mid = applyAction(s, move.action).state
      expect(mid.phase.kind).toBe('discard')
      expect(isLegal(mid, move.forcedDiscard!)).toBe(true)
      // 정책 반납과 달라야 새 정보다
      expect(JSON.stringify(move.forcedDiscard)).not.toBe(
        JSON.stringify(discardPolicy(mid, 0)),
      )
    }
  })

  it('applyResolvedWith는 forcedDiscard로 해소하고, 불법 계획은 정책으로 폴백한다', () => {
    const s = overflowState()
    const composites = compositeMoves(s, legalActions(s))
    const move = composites[0]!

    // forced 해소 결과는 정책 해소와 다르고, play phase까지 완전히 붕괴된다
    const forced = applyResolvedWith(s, move)
    const byPolicy = applyResolved(s, move.action)
    expect(forced.phase.kind).toBe('play')
    expect(hashState(forced)).not.toBe(hashState(byPolicy))

    // 불법 forcedDiscard(없는 gold 2개 반납)는 정책 폴백과 동일 결과
    const bogus = applyResolvedWith(s, {
      action: move.action,
      forcedDiscard: { type: 'DISCARD', tokens: tokens({ gold: 2 }) },
    })
    expect(hashState(bogus)).toBe(hashState(byPolicy))
  })

  it('play phase가 아니거나 초과가 없으면 composite를 만들지 않는다', () => {
    const fresh = baseState(2, 43) // 토큰 0개 — 어떤 take도 초과 불가
    expect(compositeMoves(fresh, legalActions(fresh))).toEqual([])
  })
})

describe('PlanMemo — composite 반납 계획의 전제 국면 대조 (리뷰 확정 결함 수정)', () => {
  const overflowState = () =>
    patchPlayer(baseState(2, 41), 0, {
      tokens: tokens({ white: 3, blue: 3, green: 3 }),
    })

  function fixture() {
    const s = overflowState()
    const composites = compositeMoves(s, legalActions(s))
    expect(composites.length).toBeGreaterThanOrEqual(2)
    return { s, composites }
  }

  it('전제 국면(take 직후 토큰·mustDiscard)이 일치할 때만 계획을 반환한다', () => {
    const { s, composites } = fixture()
    const move = composites[0]!
    const memo = createPlanMemo()
    memo.remember(playerView(s, 0), 0, move)

    const mid = applyAction(s, move.action).state
    expect(mid.phase.kind).toBe('discard')
    expect(memo.consume(playerView(mid, 0), 0)).toEqual(move.forcedDiscard)
    // 소비 후에는 소거된다
    expect(memo.consume(playerView(mid, 0), 0)).toBeNull()
  })

  it("'다른 take를 위한 계획'은 합법이어도 적용하지 않는다 — 타임아웃 폴백 시나리오", () => {
    const { s, composites } = fixture()
    const planned = composites[0]!
    const other = composites.find(
      (c) => JSON.stringify(c.action) !== JSON.stringify(planned.action),
    )!
    const memo = createPlanMemo()
    memo.remember(playerView(s, 0), 0, planned)

    // 실전에는 계획과 다른 take가 적용됐다 (예: 클라이언트 타임아웃 → 그리디 폴백)
    const midOther = applyAction(s, other.action).state
    expect(midOther.phase.kind).toBe('discard')
    expect(memo.consume(playerView(midOther, 0), 0)).toBeNull() // 토큰 보유량 불일치 → 정책 복귀
  })

  it('다른 플레이어·비 discard phase·clear 후에는 계획을 반환하지 않는다', () => {
    const { s, composites } = fixture()
    const move = composites[0]!
    const mid = applyAction(s, move.action).state

    const memo = createPlanMemo()
    memo.remember(playerView(s, 0), 0, move)
    expect(memo.consume(playerView(mid, 1), 1)).toBeNull() // 다른 플레이어
    memo.remember(playerView(s, 0), 0, move)
    expect(memo.consume(playerView(s, 0), 0)).toBeNull() // play phase
    memo.remember(playerView(s, 0), 0, move)
    memo.clear()
    expect(memo.consume(playerView(mid, 0), 0)).toBeNull()
  })

  it('forcedDiscard가 없는 일반 수는 기존 계획을 소거한다', () => {
    const { s, composites } = fixture()
    const memo = createPlanMemo()
    memo.remember(playerView(s, 0), 0, composites[0]!)
    memo.remember(playerView(s, 0), 0, { action: { type: 'PASS' } }) // 계획 없는 수
    const mid = applyAction(s, composites[0]!.action).state
    expect(memo.consume(playerView(mid, 0), 0)).toBeNull()
  })
})

describe('evaluateAllFull — evaluate(s, p, full) 동일성 불변식', () => {
  it('무작위 진행 국면과 종국 상태에서 마진 벡터가 개별 평가와 일치한다', () => {
    for (let seed = 0; seed < 6; seed++) {
      let s = setupGame(config(2 + (seed % 3), seed * 13 + 1))
      let rng: RngState = createRng(seed ^ 0xe4a1)
      for (let step = 0; step < 250 && s.phase.kind !== 'gameOver'; step++) {
        if (step % 10 === 0) {
          const all = evaluateAllFull(s)
          for (let p = 0; p < s.players.length; p++) {
            expect(all[p]).toBe(evaluate(s, p, 'full'))
          }
        }
        const legal = legalActions(s)
        const [i, next] = nextInt(rng, legal.length)
        rng = next
        s = applyAction(s, legal[i]!).state
      }
      if (s.phase.kind === 'gameOver') {
        const all = evaluateAllFull(s)
        for (let p = 0; p < s.players.length; p++) {
          expect(all[p]).toBe(evaluate(s, p, 'full'))
        }
      }
    }
  })
})
