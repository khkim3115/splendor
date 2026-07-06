// anytime MCTS 계약 (docs/AI_DESIGN.md §4, 이슈 #2 DoD):
// 즉승 픽스처(하드가드 경유), anytime 합법성, 예산 준수, discard/chooseNoble 정책 즉답.
//
// 결정론 어서션은 벽시계 대신 maxIters(테스트 전용 옵션)로 고정한다 — 벽시계 기반은
// 같은 입력이라도 머신 속도에 따라 iteration 수가 달라질 수 있기 때문.
// 예산 어서션 완충: 시간 체크가 32회 간격(mcts.ts TIME_CHECK_MASK)이라 마지막 배치만큼
// 오버런이 가능하다(단독 실행 ~83ms) — CI 변동까지 고려해 여유를 둔다 (flaky 방지).

import { describe, expect, it } from 'vitest'
import { canonicalPayment } from '../../src/engine/payment'
import { createRng } from '../../src/engine/rng'
import { isLegal, legalActions } from '../../src/engine/legal'
import { playerView } from '../../src/engine/view'
import { setupGame } from '../../src/engine/setup'
import type { GameState } from '../../src/engine/types'
import { chooseAction } from '../../src/ai/chooseAction'
import { mctsChoose } from '../../src/ai/mcts'
import { discardPolicy, noblePolicy } from '../../src/ai/policies'
import { baseState, config, findCard, patchPlayer, placeOnBoard, tokens } from '../helpers'

/** 반환 수가 뷰 기준 legalActions의 원소인지 (구조 동등성) */
function isElementOfLegal(view: GameState, action: unknown): boolean {
  const keys = new Set(legalActions(view).map((a) => JSON.stringify(a)))
  return keys.has(JSON.stringify(action))
}

/** discard phase 크래프트 국면 — legalActions는 phase와 보유 토큰만 본다 */
function discardState(): GameState {
  const s = patchPlayer(baseState(2), 0, {
    tokens: tokens({ white: 4, blue: 4, green: 4 }), // 12개 보유 → 2개 반납
  })
  return { ...s, phase: { kind: 'discard', mustDiscard: 2 } }
}

/** chooseNoble phase 크래프트 국면 — 후보는 phase.options가 권위다 */
function chooseNobleState(): GameState {
  const s = baseState(2)
  return { ...s, phase: { kind: 'chooseNoble', options: s.nobles.slice(0, 2) } }
}

describe('mctsChoose (docs/AI_DESIGN.md §4)', () => {
  it('즉승 국면 픽스처에서 항상 즉승수를 선택한다 (하드가드 경유)', () => {
    const winner = findCard((c) => c.tier === 3 && c.points === 5)
    let s = placeOnBoard(baseState(2), winner.id)
    s = patchPlayer(s, 0, {
      prestige: 10,
      tokens: tokens({ white: 7, blue: 7, green: 7, red: 7, black: 7 }),
    })
    for (let seed = 0; seed < 5; seed++) {
      const [action] = mctsChoose(playerView(s, 0), 0, 50, createRng(seed), { maxIters: 4 })
      expect(action, `seed ${seed}`).toEqual({
        type: 'PURCHASE',
        cardId: winner.id,
        payment: canonicalPayment(s.players[0]!, winner),
      })
    }
  })

  it('anytime: 짧은 예산(20ms)에서도 legalActions의 원소를 반환한다', () => {
    const s = setupGame(config(4, 42))
    const view = playerView(s, s.currentPlayer)
    const [action] = mctsChoose(view, s.currentPlayer, 20, createRng(7))
    expect(isLegal(s, action)).toBe(true)
    expect(isElementOfLegal(view, action)).toBe(true)
  })

  it('예산 0에서도 유효한 수를 반환한다 (0 iteration 안전)', () => {
    const s = setupGame(config(3, 8))
    const view = playerView(s, s.currentPlayer)
    const [action, , iters] = mctsChoose(view, s.currentPlayer, 0, createRng(1))
    expect(iters).toBe(0)
    expect(isLegal(s, action)).toBe(true)
    expect(isElementOfLegal(view, action)).toBe(true)
  })

  it('예산 준수: 1000ms 예산이 완충 내로 반환되고 반복이 실제로 돈다', { timeout: 10_000 }, () => {
    const s = setupGame(config(4, 3))
    const view = playerView(s, s.currentPlayer)
    const started = performance.now()
    const [action, , iters] = mctsChoose(view, s.currentPlayer, 1000, createRng(1))
    const elapsed = performance.now() - started
    expect(isLegal(s, action)).toBe(true)
    expect(iters).toBeGreaterThan(0)
    // 상한 1500ms = client.ts 하드 타임아웃 — "구현이 폴백(쉬움 1-ply 강등)을 위협하지
    // 않는다"를 그대로 어서션한다. 오버런 상한은 마지막 32회 배치 1개: 단독 실행
    // ~83ms(실측 ~2.6ms/iter), 풀 스위트 병렬 부하에서도 ~210ms 수준(부하 시 단가
    // ~6.5ms/iter 관측)이라 1000+210 ≈ 1210ms — 1500까지 ~290ms 여유로 flaky하지 않다.
    // (128 간격 시절에는 부하 배치가 ~0.8s라 이 어서션이 불가능해 2500ms로 완화했었다.)
    expect(elapsed).toBeLessThan(1500)
  })

  it('결정론: 같은 view/seed/maxIters면 같은 수와 같은 RNG 상태를 반환한다', () => {
    const s = setupGame(config(3, 99))
    const view = playerView(s, s.currentPlayer)
    const run = () => mctsChoose(view, s.currentPlayer, 60_000, createRng(5), { maxIters: 48 })
    const [a1, r1, i1] = run()
    const [a2, r2, i2] = run()
    expect(a1).toEqual(a2)
    expect(r1).toBe(r2)
    expect(i1).toBe(48) // 예산(60s)보다 maxIters가 먼저 닿는다 — 고정 반복 종료 검증
    expect(i2).toBe(48)
    expect(isLegal(s, a1)).toBe(true)
  })

  it('discard phase 뷰에는 탐색 없이 discardPolicy로 즉답한다 (policy-consistency)', () => {
    const s = discardState()
    const view = playerView(s, 0)
    const [action, , iters] = mctsChoose(view, 0, 1000, createRng(9))
    expect(iters).toBe(0) // 탐색이 돌지 않았다
    expect(action).toEqual(discardPolicy(view, 0))
    expect(isLegal(s, action)).toBe(true)
  })

  it('chooseNoble phase 뷰에는 탐색 없이 noblePolicy로 즉답한다 (policy-consistency)', () => {
    const s = chooseNobleState()
    const view = playerView(s, 0)
    const [action, , iters] = mctsChoose(view, 0, 1000, createRng(9))
    expect(iters).toBe(0)
    expect(action).toEqual(noblePolicy(view, 0))
    expect(isLegal(s, action)).toBe(true)
  })
})

describe('chooseAction 난이도 라우팅 (docs/AI_DESIGN.md §5.1 — 코드 경로 1개)', () => {
  it('hard는 mcts, easy/normal은 그리디로 라우팅되고 stats 원천이 기록된다', () => {
    const s = setupGame(config(2, 21))
    const view = playerView(s, s.currentPlayer)

    const hard = chooseAction(view, s.currentPlayer, 'hard', 0, createRng(1))
    expect(hard.algo).toBe('mcts')
    expect(isLegal(s, hard.action)).toBe(true)

    const easy = chooseAction(view, s.currentPlayer, 'easy', 5, createRng(1))
    expect(easy.algo).toBe('greedy1')
    expect(isLegal(s, easy.action)).toBe(true)

    const normal = chooseAction(view, s.currentPlayer, 'normal', 30, createRng(1))
    expect(normal.algo).toBe('greedy2')
    expect(isLegal(s, normal.action)).toBe(true)
  })
})
