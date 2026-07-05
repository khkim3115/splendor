// 지불 판정 (docs/RULES.md §4.4.1, §5.1) — 독립 순수 함수군

import { GEM_COLORS, type Card, type GemMap, type PlayerState, type TokenMap } from './types'

/** §4.4.1-1: 색별 실요구량 need[c] = max(0, cost[c] - bonus[c]) — 보너스 초과분은 이월되지 않는다 */
export function paymentNeed(player: PlayerState, card: Card): GemMap {
  return {
    white: Math.max(0, card.cost.white - player.bonuses.white),
    blue: Math.max(0, card.cost.blue - player.bonuses.blue),
    green: Math.max(0, card.cost.green - player.bonuses.green),
    red: Math.max(0, card.cost.red - player.bonuses.red),
    black: Math.max(0, card.cost.black - player.bonuses.black),
  }
}

/** §4.4.1-3: 구매 가능 조건 — Σ short[c] ≤ gold */
export function canAfford(player: PlayerState, card: Card): boolean {
  const need = paymentNeed(player, card)
  let shortfall = 0
  for (const c of GEM_COLORS) {
    shortfall += Math.max(0, need[c] - player.tokens[c])
  }
  return shortfall <= player.tokens.gold
}

/** 기본 지불안: 보석 우선, 황금은 부족분에만 (§4.4.1-4). canAfford가 참일 때만 유효 */
export function canonicalPayment(player: PlayerState, card: Card): TokenMap {
  const need = paymentNeed(player, card)
  const gems = {
    white: Math.min(need.white, player.tokens.white),
    blue: Math.min(need.blue, player.tokens.blue),
    green: Math.min(need.green, player.tokens.green),
    red: Math.min(need.red, player.tokens.red),
    black: Math.min(need.black, player.tokens.black),
  }
  const gold =
    need.white - gems.white +
    (need.blue - gems.blue) +
    (need.green - gems.green) +
    (need.red - gems.red) +
    (need.black - gems.black)
  return { ...gems, gold }
}

/**
 * 지불 구성 검증 (§4.4.1-4, §9-L):
 * - 색별 보석 지불은 0 ≤ pay[c] ≤ min(need[c], 보유량) — 초과 지불 없음
 * - 황금은 색별 부족분의 총합과 정확히 일치해야 한다 (황금 배분 자유는 이 등식 안에서 성립)
 */
export function isValidPayment(player: PlayerState, card: Card, pay: TokenMap): boolean {
  const need = paymentNeed(player, card)
  let goldRequired = 0
  for (const c of GEM_COLORS) {
    const p = pay[c]
    if (!Number.isInteger(p) || p < 0) return false
    if (p > need[c]) return false // 색별 초과 지불 금지 (§4.4.1-4)
    if (p > player.tokens[c]) return false // 보유량 초과 금지
    goldRequired += need[c] - p
  }
  if (!Number.isInteger(pay.gold) || pay.gold < 0) return false
  if (pay.gold !== goldRequired) return false // 황금이 부족분을 정확히 충당 (§4.4.1-4)
  if (pay.gold > player.tokens.gold) return false
  return true
}
