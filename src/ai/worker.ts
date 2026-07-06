// Web Worker 엔트리 — 엔진·AI가 DOM 무의존 순수 모듈이라 그대로 import된다.
// 상태는 마스킹 완료본(playerView)만 수신한다 — 덱 훔쳐보기 구조적 차단.
/// <reference lib="webworker" />

import { createRng, setStateFreezing, type GameState } from '../engine'
import { chooseActionSync } from './greedy'
import { createHardAgent } from './mcts'
import type { AiRequest, AiResponse } from './protocol'

// L0 (docs/AI_DESIGN.md §4.4): Worker에서 dev deep-freeze 가드 제거 — 탐색 핫패스.
// 엔진 불변성은 tests/engine/immutability.test.ts가 동결 가드 하에서 보증한다.
setStateFreezing(false)

// Worker당 1개 — composite 반납 계획을 턴 사이에 기억한다 (docs/AI_DESIGN.md §4.3)
const hardAgent = createHardAgent()

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const req = e.data
  const started = performance.now()
  const view = JSON.parse(req.stateJson) as GameState
  let response: AiResponse
  if (req.difficulty === 'hard') {
    const [action, , stats] = hardAgent.chooseAction(
      view,
      req.me,
      req.budgetMs,
      createRng(req.aiSeed),
    )
    response = {
      id: req.id,
      actionJson: JSON.stringify(action),
      stats: {
        elapsedMs: Math.round(performance.now() - started),
        algo: 'mcts',
        iters: stats.iters,
      },
    }
  } else {
    const [action] = chooseActionSync(view, req.me, req.difficulty, createRng(req.aiSeed))
    response = {
      id: req.id,
      actionJson: JSON.stringify(action),
      stats: {
        elapsedMs: Math.round(performance.now() - started),
        algo: req.difficulty === 'easy' ? 'greedy1' : 'greedy2',
      },
    }
  }
  self.postMessage(response)
}
