// @vitest-environment jsdom
// Worker 엔트리 직접 실행 — 프로덕션 어려움 AI의 유일한 실행 경로(worker.ts의 hard 분기)를
// CI에서 실제로 구동한다. jsdom의 self에 onmessage/postMessage를 걸어 메시지를 주입한다.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyAction } from '../../src/engine/apply'
import { isLegal, legalActions } from '../../src/engine/legal'
import { playerView } from '../../src/engine/view'
import { setStateFreezing } from '../../src/engine/freeze'
import type { Action, GameState } from '../../src/engine/types'
import { discardPolicy } from '../../src/ai/policies'
import type { AiRequest, AiResponse } from '../../src/ai/protocol'
import { baseState, patchPlayer, tokens } from '../helpers'

// import 시점에 self.onmessage 등록 + setStateFreezing(false) 실행 (L0)
beforeAll(async () => {
  await import('../../src/ai/worker')
})
afterAll(() => setStateFreezing(true))

function ask(state: GameState, me: number, difficulty: AiRequest['difficulty']): AiResponse {
  const responses: AiResponse[] = []
  vi.stubGlobal('postMessage', (msg: AiResponse) => {
    responses.push(msg)
  })
  const request: AiRequest = {
    id: 7,
    stateJson: JSON.stringify(playerView(state, me)),
    me,
    difficulty,
    // 콜드 CI 러너에서 anytime MCTS가 첫 반복도 못 끝내 iters:0이 되는 flaky를 막을
    // 만큼 넉넉히. greedy(easy/normal)·hard discard 즉답은 예산과 무관해 영향 없다.
    budgetMs: 200,
    aiSeed: 1,
  }
  const handler = self.onmessage!
  handler.call(self, { data: request } as MessageEvent<AiRequest>)
  vi.unstubAllGlobals()
  expect(responses).toHaveLength(1)
  return responses[0]!
}

describe('Worker 엔트리', () => {
  it('hard 요청이 MCTS로 처리되고 합법 수·iters·id를 반환한다', () => {
    const s = baseState(2, 51)
    const response = ask(s, 0, 'hard')
    expect(response.id).toBe(7)
    expect(response.stats.algo).toBe('mcts')
    expect(response.stats.iters).toBeGreaterThan(0)
    expect(isLegal(s, JSON.parse(response.actionJson) as Action)).toBe(true)
  })

  it('hard의 discard phase 요청은 정책 즉답이다', () => {
    // 9개 보유 → 3색 집기 = 12개 → discard phase
    let s = patchPlayer(baseState(2, 52), 0, {
      tokens: tokens({ white: 3, blue: 3, green: 3 }),
    })
    const take = legalActions(s).find((a) => a.type === 'TAKE_DIFFERENT')!
    s = applyAction(s, take).state
    expect(s.phase.kind).toBe('discard')

    const response = ask(s, 0, 'hard')
    expect(response.stats.iters).toBe(0) // 탐색하지 않고 즉답 (§1 계약)
    expect(JSON.parse(response.actionJson)).toEqual(discardPolicy(playerView(s, 0), 0))
  })

  it('easy/normal 요청은 기존 그리디 경로를 유지한다', () => {
    const s = baseState(2, 53)
    expect(ask(s, 0, 'easy').stats.algo).toBe('greedy1')
    expect(ask(s, 0, 'normal').stats.algo).toBe('greedy2')
  })
})
