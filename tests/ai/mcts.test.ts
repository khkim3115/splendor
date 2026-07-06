// anytime MCTS 계약 (docs/AI_DESIGN.md §4, 이슈 #2 DoD):
// 즉승 픽스처(하드가드 경유), anytime 합법성, 예산 준수, discard/chooseNoble 정책 즉답.
//
// 결정론 어서션은 벽시계 대신 maxIters(테스트 전용 옵션)로 고정한다 — 벽시계 기반은
// 같은 입력이라도 머신 속도에 따라 iteration 수가 달라질 수 있기 때문.
// 예산 어서션: 시간 체크가 32회 간격(mcts.ts TIME_CHECK_MASK)이라 오버런은 마지막
// 배치 1개로 유계 — 절대 벽시계 상한 대신 그 러닝의 실측 단가로 상한을 계산하는
// 상대 어서션을 쓴다(커버리지 계측·CI 부하에 단가가 부풀어도 flaky하지 않다).

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

  it('예산 준수: 1000ms 예산의 오버런이 시간 체크 배치 규모로 유계이고 반복이 실제로 돈다', { timeout: 10_000 }, () => {
    const s = setupGame(config(4, 3))
    const view = playerView(s, s.currentPlayer)
    const started = performance.now()
    const [action, , iters] = mctsChoose(view, s.currentPlayer, 1000, createRng(1))
    const elapsed = performance.now() - started
    console.log(
      `[mcts] 예산 준수 실측: elapsed ${elapsed.toFixed(0)}ms, iters ${iters}, 단가 ${(elapsed / iters).toFixed(2)}ms/iter`,
    )
    expect(isLegal(s, action)).toBe(true)
    expect(iters).toBeGreaterThan(0)
    // 예산 준수의 본질: 오버런은 "마지막 시간 체크 배치(TIME_CHECK_MASK+1 = 32회)
    // 1개"로 유계다. 구 어서션(벽시계 절대 상한 1500ms)은 CI 게이트의 커버리지 계측·
    // 러너 병렬 부하로 단가가 부풀면 구현과 무관하게 깨질 수 있었다 — 커버리지+풀
    // 스위트 실측(2026-07-06 로컬): elapsed 1323ms, 단가 13.8ms/iter로 여유가 177ms
    // 까지 줄었다(더 느린 CI 러너에서는 초과 가능). 그래서 이 러닝의 실측 단가로
    // 상한을 계산하는 상대 어서션으로 재구성 — 환경이 느려지면 상한도 함께 스케일
    // 되어 flaky하지 않다. 250ms + 계수 4는 마지막 배치의 단가 분산·GC 완충.
    const overrun = elapsed - 1000
    const perIter = elapsed / iters
    expect(overrun).toBeLessThan(250 + 32 * perIter * 4)
    // 프로덕션 보증(하드 타임아웃 1500ms 미위협)은 위 메커니즘 × 프로덕션 단가에서
    // 산출된다: 오버런 ≤ 32 × ~2.6ms ≈ 83ms ≪ 타임아웃 마진 500ms (단가는 bench
    // 실측 — docs/AI_DESIGN.md §4.4, freeze OFF인 출하 Worker는 이보다 싸다).
    // 아래 절대 상한은 "예산 메커니즘 자체의 고장"(예산의 수 배 초과) 검출용 새니티.
    expect(elapsed).toBeLessThan(2500)
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
