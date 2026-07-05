// 순수 룰 엔진 공개 API (docs/ARCHITECTURE.md §3)

export const ENGINE_VERSION = '0.3.0-m3'

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
export { deserialize, fnv1a, hashState, replay, serialize } from './serialize'
export { canReserve, excessTokens, paymentBounds, type PaymentBounds } from './helpers'
export type { GameEvent } from './events'
export { IllegalActionError, type ValidationFailure, type ValidationResult } from './errors'
export { canAfford, canonicalPayment, isValidPayment, paymentNeed } from './payment'
export { eligibleNobles } from './nobles'
export {
  allPlayersStuck,
  findBoardLocation,
  hasAnyLegalPlayAction,
  isLegal,
  legalActions,
  validateAction,
} from './legal'
export { computeResult } from './end'
export { playerView } from './view'
export { applyAction, type ApplyOutcome } from './apply'
export { setStateFreezing } from './freeze'
export {
  ZERO_GEMS,
  ZERO_TOKENS,
  addTokens,
  subtractTokens,
  tokenTotal,
  withGemDelta,
  withTokenDelta,
} from './tokens'
