// applyResolved — 탐색용 phase 붕괴 래퍼 (docs/AI_DESIGN.md §4.3)
// 엔진 이중화가 아니라 공개 API의 합성이다. discard/chooseNoble 중간 노드를
// 실전과 동일한 정책 함수로 자동 해소해 탐색 깊이 낭비를 막는다.

import { applyAction, isLegal, type Action, type GameState } from '../engine'
import { discardPolicy, noblePolicy } from './policies'

/**
 * 탐색 트리의 엣지 — play 액션 1개 + (composite 전용) 직후 반납의 명시적 해소.
 * forcedDiscard가 없으면 정책 자동 해소와 동일하다 (docs/AI_DESIGN.md §4.3).
 */
export interface ResolvedMove {
  readonly action: Action
  /** 루트 composite 전용: 직후 discard phase를 정책 대신 이 액션으로 해소 */
  readonly forcedDiscard?: Action
}

export function applyResolvedWith(state: GameState, move: ResolvedMove): GameState {
  let cur = applyAction(state, move.action).state
  let forced = move.forcedDiscard
  while (cur.phase.kind === 'discard' || cur.phase.kind === 'chooseNoble') {
    let auto: Action
    if (cur.phase.kind === 'discard') {
      // composite의 반납은 생성 시점에 합법이지만, 방어적으로 재검증 후 정책 폴백
      auto = forced && isLegal(cur, forced) ? forced : discardPolicy(cur, cur.currentPlayer)
      forced = undefined
    } else {
      auto = noblePolicy(cur, cur.currentPlayer)
    }
    cur = applyAction(cur, auto).state
  }
  return cur
}

export function applyResolved(state: GameState, action: Action): GameState {
  return applyResolvedWith(state, { action })
}
