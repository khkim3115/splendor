// GameEvent — 엔진 1급 시민 (docs/ARCHITECTURE.md §2.2)
// applyAction이 상태와 함께 반환한다. 게임 로그·aria-live 낭독·연출이 전부 이 스트림을 소비한다.

import type { CardId, GameResult, NobleId, ReservedCard, TokenMap } from './types'

export type GameEvent =
  | { readonly t: 'tokensTaken'; readonly player: number; readonly tokens: TokenMap }
  | { readonly t: 'tokensReturned'; readonly player: number; readonly tokens: TokenMap }
  | {
      readonly t: 'cardReserved'
      readonly player: number
      readonly card: ReservedCard
      readonly from: { readonly tier: 1 | 2 | 3; readonly slot: number | 'deck' }
      readonly goldGained: boolean
    }
  | {
      readonly t: 'cardPurchased'
      readonly player: number
      readonly cardId: CardId
      readonly payment: TokenMap
      readonly from: 'board' | 'reserve'
    }
  | {
      readonly t: 'slotRefilled'
      readonly tier: 1 | 2 | 3
      readonly slot: number
      readonly cardId: CardId | null // null = 덱 소진 (RULES §7)
    }
  | {
      readonly t: 'nobleVisited'
      readonly player: number
      readonly nobleId: NobleId
      readonly auto: boolean // true = 단일 충족 자동 수여
    }
  | { readonly t: 'discardRequired'; readonly player: number; readonly mustDiscard: number }
  | { readonly t: 'finalRoundTriggered'; readonly byPlayer: number }
  | { readonly t: 'turnEnded'; readonly nextPlayer: number }
  | { readonly t: 'gameEnded'; readonly result: GameResult }
