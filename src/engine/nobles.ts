// 귀족 방문 판정 (docs/RULES.md §6)

import { NOBLES } from './data/nobles'
import { GEM_COLORS, type GemMap, type NobleId } from './types'

/** 보너스(구매 카드)만으로 판정 — 토큰 무관 (§6) */
export function eligibleNobles(bonuses: GemMap, nobleIds: readonly NobleId[]): readonly NobleId[] {
  return nobleIds.filter((id) => {
    const noble = NOBLES[id]
    if (!noble) return false
    return GEM_COLORS.every((g) => bonuses[g] >= noble.requirement[g])
  })
}
