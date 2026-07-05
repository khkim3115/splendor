// 엔진 테스트 공용 픽스처 — 실제 카드/셋업 기반으로 특정 상황을 조립한다

import { CARDS } from '../src/engine/data/cards'
import { setupGame } from '../src/engine/setup'
import type {
  Card,
  CardId,
  GameConfig,
  GameState,
  GemColor,
  GemMap,
  PlayerKind,
  PlayerState,
  TokenColor,
  TokenMap,
} from '../src/engine/types'

export const tokens = (p: Partial<Record<TokenColor, number>> = {}): TokenMap => ({
  white: 0,
  blue: 0,
  green: 0,
  red: 0,
  black: 0,
  gold: 0,
  ...p,
})

export const gems = (p: Partial<Record<GemColor, number>> = {}): GemMap => ({
  white: 0,
  blue: 0,
  green: 0,
  red: 0,
  black: 0,
  ...p,
})

export const humans = (n: number): PlayerKind[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'human', name: `P${i + 1}` }))

export const config = (n: number, seed = 1): GameConfig => ({ players: humans(n), seed })

/** 셋업 상태에서 시작하되 선/현재 플레이어를 0으로 고정 (테스트 결정론) */
export function baseState(n = 2, seed = 1, overrides: Partial<GameState> = {}): GameState {
  const s = setupGame(config(n, seed))
  return { ...s, currentPlayer: 0, startPlayer: 0, ...overrides }
}

export function patchPlayer(
  s: GameState,
  index: number,
  patch: Partial<PlayerState>,
): GameState {
  return {
    ...s,
    players: s.players.map((p, i) => (i === index ? { ...p, ...patch } : p)),
  }
}

/** 조건에 맞는 실제 카드를 찾는다 (없으면 throw — 테스트 전제 오류) */
export function findCard(pred: (c: Card) => boolean): Card {
  const card = CARDS.find(pred)
  if (!card) throw new Error('테스트 전제에 맞는 카드가 데이터에 없습니다')
  return card
}

/**
 * 특정 카드를 해당 티어의 보드 slot 0에 놓는다.
 * 카드가 덱에 있으면 기존 slot 0 카드와 자리를 맞바꿔 90장 분할을 보존한다.
 */
export function placeOnBoard(s: GameState, cardId: CardId): GameState {
  const tier = CARDS[cardId]!.tier
  const row = s.board[tier - 1]!
  const existingSlot = row.indexOf(cardId)
  if (existingSlot >= 0) return s

  const deck = s.decks[tier - 1]!
  const deckIndex = deck.indexOf(cardId)
  if (deckIndex < 0) throw new Error(`카드 ${cardId}가 덱에도 보드에도 없습니다 (이미 사용됨?)`)

  const displaced = row[0]!
  const newRow = row.map((c, j) => (j === 0 ? cardId : c))
  const newDeck = deck.map((c, k) => (k === deckIndex ? displaced : c))
  return {
    ...s,
    board: s.board.map((r, i) => (i === tier - 1 ? newRow : r)),
    decks: s.decks.map((d, i) => (i === tier - 1 ? newDeck : d)) as unknown as GameState['decks'],
  }
}
