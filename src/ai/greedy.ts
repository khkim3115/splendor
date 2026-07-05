// 쉬움(그리디 1-ply) / 보통(2-ply) — 상위 k 제한 softmax (docs/AI_DESIGN.md §3)
// 난이도는 실수의 빈도가 아니라 시야의 깊이·폭으로 갈린다.

import {
  legalActions,
  nextInt,
  type Action,
  type Difficulty,
  type GameState,
  type RngState,
} from '../engine'
import { evaluate } from './evaluate'
import { hardGuard } from './guards'
import { determinize } from './moveGen'
import { discardPolicy, noblePolicy } from './policies'
import { applyResolved } from './search'

/** softmax 온도의 점수 스케일 (평가값 격차의 전형적 크기) — 자가대전으로 튜닝 */
const SOFTMAX_SCALE = 25

// 아레나 측정 기록 (200판, 2026-07): easy T=1.8 → 보통 승률 86.4%, T=1.2 → 88.9%.
// 온도는 격차의 지배 변수가 아니다(시야 차이가 지배) — 문서 권고 범위(1.5~2.0)의
// T=1.8 유지, 밴드(65~80%) 소폭 초과는 M6에서 3단계 전체와 함께 재조정한다.
const PARAMS: Record<Exclude<Difficulty, 'hard'>, { topK: number; temperature: number }> = {
  easy: { topK: 4, temperature: 1.8 },
  normal: { topK: 3, temperature: 0.45 },
}

interface Scored {
  action: Action
  score: number
}

function softmaxPick(
  rng: RngState,
  scored: readonly Scored[],
  topK: number,
  temperature: number,
): [Action, RngState] {
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, topK)
  const max = top[0]!.score
  const weights = top.map((x) => Math.exp((x.score - max) / (SOFTMAX_SCALE * temperature)))
  const sum = weights.reduce((a, b) => a + b, 0)
  const [u, next] = nextInt(rng, 1 << 30)
  let target = (u / (1 << 30)) * sum
  for (const [i, w] of weights.entries()) {
    target -= w
    if (target <= 0) return [top[i]!.action, next]
  }
  return [top[top.length - 1]!.action, next]
}

/** 상대의 그리디 응수 1수(argmax full)를 가정한 후 상태 (2-ply의 두 번째 층) */
function afterOpponentReply(state: GameState, me: number): GameState {
  if (state.phase.kind === 'gameOver') return state
  const opponent = state.currentPlayer
  if (opponent === me) return state

  const guard = hardGuard(state, opponent)
  if (guard) return applyResolved(state, guard)

  let best: GameState | null = null
  let bestScore = -Infinity
  for (const action of legalActions(state)) {
    const after = applyResolved(state, action)
    const score = evaluate(after, opponent, 'full')
    if (score > bestScore) {
      bestScore = score
      best = after
    }
  }
  return best ?? state
}

/**
 * 쉬움/보통의 착수 선택 — Worker와 메인스레드 폴백이 같은 코드를 쓴다.
 * discard/chooseNoble phase는 정책 즉답 (policy-consistency 계약).
 * 보통은 탐색 전 determinize 1회 (마스킹 열화 방지, AI_DESIGN §3).
 */
export function chooseActionSync(
  view: GameState,
  me: number,
  difficulty: Difficulty,
  rng: RngState,
): [Action, RngState] {
  if (view.phase.kind === 'discard') return [discardPolicy(view, me), rng]
  if (view.phase.kind === 'chooseNoble') return [noblePolicy(view, me), rng]

  const twoPlies = difficulty !== 'easy'
  let s = view
  let r = rng
  if (twoPlies) {
    ;[s, r] = determinize(view, r)
  }

  const guard = hardGuard(s, me)
  if (guard) return [guard, r]

  const actions = legalActions(s)
  if (actions.length === 1) return [actions[0]!, r]

  const scored: Scored[] = actions.map((action) => {
    const after = applyResolved(s, action)
    const score = twoPlies
      ? evaluate(afterOpponentReply(after, me), me, 'full')
      : evaluate(after, me, 'simple')
    return { action, score }
  })

  const { topK, temperature } = PARAMS[difficulty === 'easy' ? 'easy' : 'normal']
  return softmaxPick(r, scored, topK, temperature)
}
