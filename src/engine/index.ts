// 순수 룰 엔진 공개 API (docs/ARCHITECTURE.md §3)

export const ENGINE_VERSION = '0.1.0-m1'

export * from './types'
export { CARDS } from './data/cards'
export { NOBLES } from './data/nobles'
export {
  BOARD_SLOTS,
  GEM_TOKENS_BY_PLAYERS,
  GOLD_TOKENS,
  NOBLES_BY_PLAYERS,
  RESERVE_LIMIT,
  TOKEN_LIMIT,
  WINNING_PRESTIGE,
  type PlayerCount,
} from './constants'
export { createRng, nextInt, shuffle, type RngState } from './rng'
export { setupGame } from './setup'
export { fnv1a, hashState } from './serialize'
