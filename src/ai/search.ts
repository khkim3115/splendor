// applyResolved — 탐색용 phase 붕괴 래퍼 (docs/AI_DESIGN.md §4.3)
// 엔진 이중화가 아니라 공개 API의 합성이다. discard/chooseNoble 중간 노드를
// 실전과 동일한 정책 함수로 자동 해소해 탐색 깊이 낭비를 막는다.

import { applyAction, type Action, type GameState } from '../engine'
import { discardPolicy, noblePolicy } from './policies'

export function applyResolved(state: GameState, action: Action): GameState {
  let cur = applyAction(state, action).state
  while (cur.phase.kind === 'discard' || cur.phase.kind === 'chooseNoble') {
    const auto =
      cur.phase.kind === 'discard'
        ? discardPolicy(cur, cur.currentPlayer)
        : noblePolicy(cur, cur.currentPlayer)
    cur = applyAction(cur, auto).state
  }
  return cur
}
