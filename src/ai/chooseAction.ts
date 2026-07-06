// 난이도 라우팅 단일 진입점 (docs/AI_DESIGN.md §5.1 — "코드 경로 1개").
// Worker 엔트리와 클라이언트의 Worker 미지원 폴백이 같은 코드를 쓴다 —
// hard가 chooseActionSync로 새면 PARAMS 조회가 normal로 퇴화하는 사고를 막는다.

import type { Action, Difficulty, GameState, RngState } from '../engine'
import { chooseActionSync } from './greedy'
import { mctsChoose } from './mcts'
import type { AiAlgo } from './protocol'

export interface ChooseOutcome {
  readonly action: Action
  readonly rng: RngState
  readonly algo: Exclude<AiAlgo, 'fallback'> // fallback은 client 타임아웃 경로 전용
  readonly iters: number // 그리디는 반복 탐색이 아니다 — 자연값 0
}

export function chooseAction(
  view: GameState,
  me: number,
  difficulty: Difficulty,
  budgetMs: number,
  rng: RngState,
): ChooseOutcome {
  if (difficulty === 'hard') {
    const [action, next, iters] = mctsChoose(view, me, budgetMs, rng)
    return { action, rng: next, algo: 'mcts', iters }
  }
  const [action, next] = chooseActionSync(view, me, difficulty, rng)
  return { action, rng: next, algo: difficulty === 'easy' ? 'greedy1' : 'greedy2', iters: 0 }
}
