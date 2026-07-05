// 메인 ↔ Worker 프로토콜 (docs/AI_DESIGN.md §5.2)

import type { Difficulty } from '../engine'

export interface AiRequest {
  readonly id: number
  readonly stateJson: string // serialize(playerView(state, me)) — 마스킹 완료본만
  readonly me: number
  readonly difficulty: Difficulty
  readonly budgetMs: number
  readonly aiSeed: number // softmax/determinize 전용 시드 (게임 시드와 분리)
}

export interface AiResponse {
  readonly id: number
  readonly actionJson: string
  readonly stats: {
    readonly elapsedMs: number
    readonly algo: 'greedy1' | 'greedy2' | 'fallback'
  }
}
