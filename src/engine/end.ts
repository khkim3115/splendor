// 게임 종료·승자 판정 (docs/RULES.md §8, §9-E/G)

import type { GameResult, GameState } from './types'

/** §8-3~5: 최고 명성점 → 동점이면 구매 카드 수 적은 쪽 → 그래도 같으면 공동 승리 */
export function computeResult(
  state: GameState,
  reason: GameResult['reason'],
): GameResult {
  const scores = state.players.map((p) => ({
    prestige: p.prestige,
    purchasedCount: p.purchased.length,
  }))

  const maxPrestige = Math.max(...scores.map((s) => s.prestige))
  const contenders = scores
    .map((s, i) => ({ ...s, i }))
    .filter((s) => s.prestige === maxPrestige)
  const minCards = Math.min(...contenders.map((s) => s.purchasedCount))
  const winners = contenders.filter((s) => s.purchasedCount === minCards).map((s) => s.i)

  return { winners, scores, reason }
}
