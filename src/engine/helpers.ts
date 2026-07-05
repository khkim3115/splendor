// UI 보조 순수 함수 (docs/ARCHITECTURE.md §3) — 룰 지식은 엔진에만 존재한다

import { CARDS } from './data/cards'
import { RESERVE_LIMIT, TOKEN_LIMIT } from './constants'
import { canAfford, paymentNeed } from './payment'
import { tokenTotal } from './tokens'
import {
  GEM_COLORS,
  type CardId,
  type GameState,
  type GemColor,
  type GemMap,
  type PlayerState,
} from './types'

export interface PaymentBounds {
  readonly affordable: boolean
  /** 색별 실요구량 (§4.4.1-1) */
  readonly need: GemMap
  /** 반드시 황금으로 내야 하는 최소량 (보석 부족분 총합) */
  readonly minGold: number
  /** 보석 지불 일부를 황금으로 대체할 여지가 있는 색 (§9-L) — UI는 여분 황금과 조합해 판단 */
  readonly goldFlexibleColors: readonly GemColor[]
}

/** PaymentModal의 데이터 소스 (§9-L) */
export function paymentBounds(
  state: GameState,
  playerIndex: number,
  cardId: CardId,
): PaymentBounds {
  const player = state.players[playerIndex]
  const card = CARDS[cardId]
  if (!player || !card) {
    return { affordable: false, need: { white: 0, blue: 0, green: 0, red: 0, black: 0 }, minGold: 0, goldFlexibleColors: [] }
  }
  const need = paymentNeed(player, card)
  let minGold = 0
  for (const c of GEM_COLORS) {
    minGold += Math.max(0, need[c] - player.tokens[c])
  }
  return {
    affordable: canAfford(player, card),
    need,
    minGold,
    goldFlexibleColors: GEM_COLORS.filter((c) => need[c] > 0 && player.tokens[c] > 0),
  }
}

/** §5: 반납해야 하는 초과 토큰 수 */
export function excessTokens(player: PlayerState): number {
  return Math.max(0, tokenTotal(player.tokens) - TOKEN_LIMIT)
}

/** §4.3/§9-D/§9-E: 지금 예약 행동이 가능한가 (예약 여유 + 예약할 카드 존재) */
export function canReserve(state: GameState, playerIndex: number): boolean {
  const player = state.players[playerIndex]
  if (!player || player.reserved.length >= RESERVE_LIMIT) return false
  return (
    state.board.some((row) => row.some((c) => c !== null)) ||
    state.decks.some((d) => d.length > 0)
  )
}
