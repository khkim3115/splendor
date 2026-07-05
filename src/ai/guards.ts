// 전 난이도 공통 하드가드 (docs/AI_DESIGN.md §3) — 탐색 이전에 적용.
// 목적: "고장난 AI" 인상 방지 — 명백수를 절대 놓치지 않는다.

import {
  CARDS,
  WINNING_PRESTIGE,
  legalActions,
  tokenTotal,
  type Action,
  type GameState,
} from '../engine'
import { evaluate } from './evaluate'
import { applyResolved } from './search'

/**
 * 1) 즉시 15점 이상을 확정하는 구매가 있으면 무조건 수행 (최고 도달점 우선)
 * 2) 실지불 0(전액 보너스 커버)의 1점 이상 최고점 카드는, "평가 손해가 없을 때만"
 *    결정적으로 수행한다 — softmax 무작위성이 명백수를 흘리는 것을 막되,
 *    더 좋은 수(예: 4점 유료 구매)를 가로채지 않는다 (§3 '평가 손해 없는' 조건)
 */
export function hardGuard(state: GameState, me: number): Action | null {
  if (state.phase.kind !== 'play') return null

  const actions = legalActions(state)
  let winning: { action: Action; prestige: number } | null = null
  let freeBest: { action: Action; points: number } | null = null

  for (const action of actions) {
    if (action.type !== 'PURCHASE') continue
    const after = applyResolved(state, action)
    const prestige = after.players[me]!.prestige
    if (prestige >= WINNING_PRESTIGE) {
      if (!winning || prestige > winning.prestige) winning = { action, prestige }
    }
    if (tokenTotal(action.payment) === 0) {
      const points = CARDS[action.cardId]!.points
      if (points >= 1 && (!freeBest || points > freeBest.points)) {
        freeBest = { action, points }
      }
    }
  }

  if (winning) return winning.action
  if (!freeBest) return null

  // 평가 손해 검사: 무료 구매가 1-ply 평가상 다른 모든 합법수 이상일 때만 강제
  const freeScore = evaluate(applyResolved(state, freeBest.action), me, 'full')
  for (const action of actions) {
    if (action === freeBest.action) continue
    if (evaluate(applyResolved(state, action), me, 'full') > freeScore) {
      return null // 더 좋은 수가 있다 — 탐색이 결정한다
    }
  }
  return freeBest.action
}
