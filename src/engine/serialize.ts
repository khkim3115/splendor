// 직렬화·해시·리플레이 (docs/ARCHITECTURE.md §3)
// 엔진이 생성하는 모든 객체는 고정 키 순서의 리터럴이고, 유일한 외부 유입 조각인
// config는 setupGame이 고정 키 순서로 재구성해 임베드하므로 JSON.stringify가 결정론적이다.
// JSON.parse는 stringify가 쓴 키 순서를 보존하므로 라운드트립 후에도 해시가 유지된다.

import { applyAction } from './apply'
import { GEM_TOKENS_BY_PLAYERS, GOLD_TOKENS, type PlayerCount } from './constants'
import { maybeFreeze } from './freeze'
import { setupGame } from './setup'
import {
  GEM_COLORS,
  TOKEN_COLORS,
  type Action,
  type GameConfig,
  type GameState,
} from './types'

/** FNV-1a 32비트 해시 — 결정론/리플레이 비교용 (암호학적 아님) */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function hashState(state: GameState): string {
  return fnv1a(JSON.stringify(state))
}

export function serialize(state: GameState): string {
  return JSON.stringify(state)
}

/**
 * 역직렬화 + 형태·정합 검증 — 손상된 데이터는 지연 크래시나 조용한 오염 대신
 * 즉시 명확한 오류로 거부한다. (진짜 상태 전용 — 마스킹된 뷰는 저장 대상이 아니다)
 */
export function deserialize(json: string): GameState {
  const v = JSON.parse(json) as unknown
  const bad = (why: string): never => {
    throw new Error(`세이브 데이터 형식이 올바르지 않습니다: ${why}`)
  }
  const isObj = (x: unknown): x is Record<string, unknown> =>
    typeof x === 'object' && x !== null && !Array.isArray(x)
  const isInt = (x: unknown): x is number => Number.isInteger(x)
  const isCardId = (x: unknown): x is number => isInt(x) && x >= 0 && x < 90
  const isNobleId = (x: unknown): x is number => isInt(x) && x >= 0 && x < 10
  const checkCounts = (x: unknown, keys: readonly string[], where: string): void => {
    if (!isObj(x)) bad(where)
    for (const k of keys) {
      const n = (x as Record<string, unknown>)[k]
      if (!isInt(n) || n < 0) bad(`${where}.${k}`)
    }
  }

  if (!isObj(v)) bad('최상위가 객체가 아님')
  const s = v as Record<string, unknown>

  // config — replay/undo/재저장의 기반이므로 엄격히 검증
  if (!isObj(s.config)) bad('config')
  const cfg = s.config as Record<string, unknown>
  if (!isInt(cfg.seed)) bad('config.seed')
  if (!Array.isArray(cfg.players) || cfg.players.length < 2 || cfg.players.length > 4) {
    bad('config.players')
  }
  for (const [i, pk] of (cfg.players as unknown[]).entries()) {
    if (!isObj(pk)) bad(`config.players[${i}]`)
    const kind = pk as Record<string, unknown>
    if (typeof kind.name !== 'string') bad(`config.players[${i}].name`)
    if (kind.type === 'ai') {
      if (kind.difficulty !== 'easy' && kind.difficulty !== 'normal' && kind.difficulty !== 'hard') {
        bad(`config.players[${i}].difficulty`)
      }
    } else if (kind.type !== 'human') {
      bad(`config.players[${i}].type`)
    }
  }
  const playerCount = (cfg.players as unknown[]).length as PlayerCount

  checkCounts(s.supply, TOKEN_COLORS, 'supply')

  if (!Array.isArray(s.decks) || s.decks.length !== 3) bad('decks')
  for (const [t, d] of (s.decks as unknown[]).entries()) {
    if (!Array.isArray(d) || !(d as unknown[]).every(isCardId)) bad(`decks[${t}]`)
  }
  if (!Array.isArray(s.board) || s.board.length !== 3) bad('board')
  for (const [t, row] of (s.board as unknown[]).entries()) {
    if (!Array.isArray(row) || row.length !== 4) bad(`board[${t}]`)
    if (!(row as unknown[]).every((c) => c === null || isCardId(c))) bad(`board[${t}] 내용`)
  }
  if (!Array.isArray(s.nobles) || !(s.nobles as unknown[]).every(isNobleId)) bad('nobles')

  if (!Array.isArray(s.players) || s.players.length !== playerCount) bad('players')
  for (const [i, p] of (s.players as unknown[]).entries()) {
    if (!isObj(p)) bad(`players[${i}]`)
    const pl = p as Record<string, unknown>
    checkCounts(pl.tokens, TOKEN_COLORS, `players[${i}].tokens`)
    checkCounts(pl.bonuses, GEM_COLORS, `players[${i}].bonuses`)
    if (!Array.isArray(pl.purchased) || !(pl.purchased as unknown[]).every(isCardId)) {
      bad(`players[${i}].purchased`)
    }
    if (!Array.isArray(pl.nobles) || !(pl.nobles as unknown[]).every(isNobleId)) {
      bad(`players[${i}].nobles`)
    }
    if (!Array.isArray(pl.reserved) || pl.reserved.length > 3) bad(`players[${i}].reserved`)
    for (const r of pl.reserved as unknown[]) {
      if (!isObj(r) || !isCardId((r as Record<string, unknown>).cardId)) {
        bad(`players[${i}].reserved 내용`)
      }
      if (typeof (r as Record<string, unknown>).fromDeck !== 'boolean') {
        bad(`players[${i}].reserved.fromDeck`)
      }
    }
    if (!isInt(pl.prestige) || pl.prestige < 0) bad(`players[${i}].prestige`)
  }

  if (!isInt(s.currentPlayer) || s.currentPlayer < 0 || s.currentPlayer >= playerCount) {
    bad('currentPlayer')
  }
  if (!isInt(s.startPlayer) || s.startPlayer < 0 || s.startPlayer >= playerCount) {
    bad('startPlayer')
  }
  if (typeof s.finalRound !== 'boolean') bad('finalRound')
  if (!isInt(s.turn) || s.turn < 0) bad('turn')

  // phase — kind별 필수 필드까지 검증 (완전성 불변식의 침묵 붕괴 방지)
  if (!isObj(s.phase)) bad('phase')
  const phase = s.phase as Record<string, unknown>
  switch (phase.kind) {
    case 'play':
      break
    case 'discard':
      if (phase.mustDiscard !== 1 && phase.mustDiscard !== 2 && phase.mustDiscard !== 3) {
        bad('phase.mustDiscard')
      }
      break
    case 'chooseNoble':
      if (!Array.isArray(phase.options) || phase.options.length === 0 || !phase.options.every(isNobleId)) {
        bad('phase.options')
      }
      break
    case 'gameOver': {
      if (!isObj(phase.result)) bad('phase.result')
      const result = phase.result as Record<string, unknown>
      if (!Array.isArray(result.winners) || !Array.isArray(result.scores)) bad('phase.result 내용')
      if (result.reason !== 'prestige15' && result.reason !== 'deadlockExhausted') {
        bad('phase.result.reason')
      }
      break
    }
    default:
      bad('phase.kind')
  }

  // 의미 정합: 카드 90장 분할 보존 + 색별 토큰 총량 보존
  const state = v as GameState
  const ids = [
    ...state.decks.flat(),
    ...state.board.flat().filter((c): c is number => c !== null),
    ...state.players.flatMap((p) => p.purchased),
    ...state.players.flatMap((p) => p.reserved.map((r) => r.cardId)),
  ].sort((a, b) => a - b)
  if (ids.length !== 90 || ids.some((id, i) => id !== i)) bad('카드 90장 분할 불변식')

  const gems = GEM_TOKENS_BY_PLAYERS[playerCount]
  for (const c of TOKEN_COLORS) {
    const total = state.supply[c] + state.players.reduce((sum, p) => sum + p.tokens[c], 0)
    if (total !== (c === 'gold' ? GOLD_TOKENS : gems)) bad(`토큰 보존 불변식 (${c})`)
  }

  return maybeFreeze(state)
}

/** (config, actions[])만으로 게임 전체를 재구성 — 세이브·undo·버그 재현의 공통 기반 */
export function replay(config: GameConfig, actions: readonly Action[]): GameState {
  let s = setupGame(config)
  for (const a of actions) {
    s = applyAction(s, a).state
  }
  return s
}
