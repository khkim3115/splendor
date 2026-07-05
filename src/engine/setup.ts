// 게임 셋업 (docs/RULES.md §2) — RNG의 유일한 소비처

import { CARDS } from './data/cards'
import { NOBLES } from './data/nobles'
import {
  BOARD_SLOTS,
  GEM_TOKENS_BY_PLAYERS,
  GOLD_TOKENS,
  NOBLES_BY_PLAYERS,
  type PlayerCount,
} from './constants'
import { createRng, nextInt, shuffle, type RngState } from './rng'
import type {
  CardId,
  GameConfig,
  GameState,
  PlayerKind,
  PlayerState,
  TokenMap,
} from './types'

const EMPTY_TOKENS: TokenMap = { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }

const EMPTY_PLAYER: PlayerState = {
  tokens: EMPTY_TOKENS,
  purchased: [],
  reserved: [],
  nobles: [],
  bonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
  prestige: 0,
}

function isPlayerCount(n: number): n is PlayerCount {
  return n === 2 || n === 3 || n === 4
}

export function setupGame(config: GameConfig): GameState {
  const playerCount = config.players.length
  if (!isPlayerCount(playerCount)) {
    throw new Error(`플레이어 수는 2~4명이어야 합니다 (${playerCount}명 지정됨)`)
  }

  let rng: RngState = createRng(config.seed)

  // 티어별로 각각 따로 셔플, 맨 위(index 0)부터 4장 공개 (§2-1, §2-2)
  const decks: CardId[][] = []
  const board: (CardId | null)[][] = []
  for (const tier of [1, 2, 3] as const) {
    const tierCards = CARDS.filter((c) => c.tier === tier).map((c) => c.id)
    const [shuffled, nextRng] = shuffle(rng, tierCards)
    rng = nextRng
    board.push(shuffled.slice(0, BOARD_SLOTS))
    decks.push([...shuffled.slice(BOARD_SLOTS)])
  }

  // 귀족: 10장 셔플 후 인원+1장 공개, 나머지는 게임에서 제외 (§2-3)
  const [shuffledNobles, rngAfterNobles] = shuffle(
    rng,
    NOBLES.map((n) => n.id),
  )
  rng = rngAfterNobles
  const nobles = shuffledNobles.slice(0, NOBLES_BY_PLAYERS[playerCount])

  // 선 플레이어 무작위 결정 (§2 [구현 결정])
  const [startPlayer] = nextInt(rng, playerCount)

  const gems = GEM_TOKENS_BY_PLAYERS[playerCount]
  const supply: TokenMap = {
    white: gems,
    blue: gems,
    green: gems,
    red: gems,
    black: gems,
    gold: GOLD_TOKENS,
  }

  // hashState(JSON.stringify 기반)가 호출자 객체의 키 삽입 순서에 의존하지 않도록
  // config를 고정 키 순서로 재구성해 임베드한다
  const players: readonly PlayerKind[] = config.players.map((p) =>
    p.type === 'ai'
      ? { type: 'ai', name: p.name, difficulty: p.difficulty }
      : { type: 'human', name: p.name },
  )
  const normalizedConfig: GameConfig = { players, seed: config.seed }

  return {
    config: normalizedConfig,
    supply,
    decks: [decks[0] as CardId[], decks[1] as CardId[], decks[2] as CardId[]],
    board,
    nobles,
    players: config.players.map(() => EMPTY_PLAYER),
    currentPlayer: startPlayer,
    startPlayer,
    phase: { kind: 'play' },
    finalRound: false,
    turn: 0,
  }
}
