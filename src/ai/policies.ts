// discardPolicy/noblePolicy — 탐색 내부 자동 해소와 실전 phase 응답이 같은 함수다
// (policy-consistency 계약, docs/AI_DESIGN.md §4.3). 출력은 반드시 legalActions의 원소.
// 두 정책 모두 "평가함수상 최선"을 결정적으로 고른다 — 후보가 작아(반납 ≤56, 귀족 ≤5)
// 전수 평가가 저렴하고, 원시 프록시(수요 합산)는 보너스가 쌓인 핵심 색을
// 체계적으로 저평가하는 편향이 있었다 (M5 리뷰 확정).

import { applyAction, legalActions, type Action, type GameState } from '../engine'
import { evaluate } from './evaluate'

/** 후보(전부 같은 phase의 합법수) 중 적용 후 평가가 최대인 액션 — 동률은 열거 순서 (결정론) */
function argmaxByEvaluate(state: GameState, me: number): Action {
  const candidates = legalActions(state)
  let best = candidates[0]!
  let bestScore = -Infinity
  for (const action of candidates) {
    const score = evaluate(applyAction(state, action).state, me, 'full')
    if (score > bestScore) {
      bestScore = score
      best = action
    }
  }
  return best
}

/** §5 반납 정책: 평가함수상 가치 최저의 반납 조합 (결정적) */
export function discardPolicy(state: GameState, me: number): Action {
  if (state.phase.kind !== 'discard') {
    throw new Error('discardPolicy는 discard phase에서만 호출된다')
  }
  return argmaxByEvaluate(state, me)
}

/** §9-J 귀족 선택 정책: 즉시 평가 가치 최대의 귀족 (결정적) */
export function noblePolicy(state: GameState, me: number): Action {
  if (state.phase.kind !== 'chooseNoble') {
    throw new Error('noblePolicy는 chooseNoble phase에서만 호출된다')
  }
  return argmaxByEvaluate(state, me)
}
