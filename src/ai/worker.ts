// Web Worker 엔트리 — 엔진·AI가 DOM 무의존 순수 모듈이라 그대로 import된다.
// 상태는 마스킹 완료본(playerView)만 수신한다 — 덱 훔쳐보기 구조적 차단.
/// <reference lib="webworker" />

import { createRng, setStateFreezing, type GameState } from '../engine'
import { chooseAction } from './chooseAction'
import type { AiRequest, AiResponse } from './protocol'

// L0 성능 최적화 (docs/AI_DESIGN.md §4.4): Worker 프로덕션 번들에서는 dev 전용
// deep-freeze 가드가 필요 없다 — 엔진 불변식은 순수 함수 계약으로 이미 보장되고,
// 여기서는 탐색 핫패스의 동결/순회 비용만 제거한다 (동작 불변, 안전망은 전체 테스트).
setStateFreezing(false)

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const req = e.data
  const started = performance.now()
  const view = JSON.parse(req.stateJson) as GameState
  // 난이도 라우팅은 chooseAction 단일 진입점 (§5.1) — hard면 anytime MCTS(§4)
  const { action, algo, iters } = chooseAction(
    view,
    req.me,
    req.difficulty,
    req.budgetMs,
    createRng(req.aiSeed),
  )
  const response: AiResponse = {
    id: req.id,
    actionJson: JSON.stringify(action),
    stats: {
      elapsedMs: Math.round(performance.now() - started),
      algo,
      iters,
    },
  }
  self.postMessage(response)
}
