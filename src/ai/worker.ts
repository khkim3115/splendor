// Web Worker 엔트리 — 엔진·AI가 DOM 무의존 순수 모듈이라 그대로 import된다.
// 상태는 마스킹 완료본(playerView)만 수신한다 — 덱 훔쳐보기 구조적 차단.
/// <reference lib="webworker" />

import { createRng, type GameState } from '../engine'
import { chooseActionSync } from './greedy'
import type { AiRequest, AiResponse } from './protocol'

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const req = e.data
  const started = performance.now()
  const view = JSON.parse(req.stateJson) as GameState
  const [action] = chooseActionSync(view, req.me, req.difficulty, createRng(req.aiSeed))
  const response: AiResponse = {
    id: req.id,
    actionJson: JSON.stringify(action),
    stats: {
      elapsedMs: Math.round(performance.now() - started),
      algo: req.difficulty === 'easy' ? 'greedy1' : 'greedy2',
    },
  }
  self.postMessage(response)
}
