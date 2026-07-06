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

/** 착수를 만든 알고리즘 — fallback은 client 하드 타임아웃 경로 기록용 (§5.3) */
export type AiAlgo = 'greedy1' | 'greedy2' | 'mcts' | 'fallback'

export interface AiResponse {
  readonly id: number
  readonly actionJson: string
  readonly stats: {
    readonly elapsedMs: number
    readonly algo: AiAlgo
    readonly iters: number // 탐색 iteration 수 (§5.2) — 그리디는 0
  }
}
