// applyAction — 유일한 전이 함수 (docs/ARCHITECTURE.md §3)
// 완전 순수·불변(구조적 공유). 불법 액션은 IllegalActionError throw.
// 턴 처리 순서 (RULES §6 [구현 결정] 고정):
//   행동 → 보충(§7) → 토큰 10개 검사(§5 → discard phase)
//   → 귀족 판정(§6, 단일=자동/복수=chooseNoble phase)
//   → 15점 트리거(§8-1) → 라운드 종료 검사(§8-2, §9-I) → gameOver 전이

import { CARDS } from './data/cards'
import { NOBLES } from './data/nobles'
import { TOKEN_LIMIT, WINNING_PRESTIGE } from './constants'
import { computeResult } from './end'
import { IllegalActionError } from './errors'
import type { GameEvent } from './events'
import { maybeFreeze } from './freeze'
import { allPlayersStuck, findBoardLocation, validateAction } from './legal'
import { eligibleNobles } from './nobles'
import {
  ZERO_TOKENS,
  addTokens,
  subtractTokens,
  tokenTotal,
  withGemDelta,
  withTokenDelta,
} from './tokens'
import type {
  Action,
  CardId,
  GameState,
  NobleId,
  PlayerState,
} from './types'

export interface ApplyOutcome {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

function updatePlayer(
  state: GameState,
  index: number,
  f: (p: PlayerState) => PlayerState,
): GameState {
  return {
    ...state,
    players: state.players.map((p, i) => (i === index ? f(p) : p)),
  }
}

/** 보드 슬롯을 덱 맨 위 카드로 보충 (§7). 덱이 비면 null 유지 */
function refillSlot(
  state: GameState,
  tier: 1 | 2 | 3,
  slot: number,
  events: GameEvent[],
): GameState {
  const deck = state.decks[tier - 1]!
  const refillId: CardId | null = deck.length > 0 ? deck[0]! : null
  const decks = state.decks.map((d, i) =>
    i === tier - 1 && refillId !== null ? d.slice(1) : d,
  ) as unknown as GameState['decks']
  const board = state.board.map((row, i) =>
    i === tier - 1 ? row.map((c, j) => (j === slot ? refillId : c)) : row,
  )
  events.push({ t: 'slotRefilled', tier, slot, cardId: refillId })
  return { ...state, decks, board }
}

function awardNoble(state: GameState, playerIndex: number, nobleId: NobleId): GameState {
  const noble = NOBLES[nobleId]!
  const withoutNoble: GameState = {
    ...state,
    nobles: state.nobles.filter((id) => id !== nobleId),
  }
  return updatePlayer(withoutNoble, playerIndex, (p) => ({
    ...p,
    nobles: [...p.nobles, nobleId],
    prestige: p.prestige + noble.points,
  }))
}

export function applyAction(state: GameState, action: Action): ApplyOutcome {
  const v = validateAction(state, action)
  if (!v.ok) throw new IllegalActionError(v, action)
  maybeFreeze(state)

  const events: GameEvent[] = []
  const me = state.currentPlayer

  switch (action.type) {
    case 'TAKE_DIFFERENT':
    case 'TAKE_SAME': {
      let taken = ZERO_TOKENS
      if (action.type === 'TAKE_DIFFERENT') {
        for (const c of action.colors) taken = withTokenDelta(taken, c, 1)
      } else {
        taken = withTokenDelta(taken, action.color, 2)
      }
      let s: GameState = { ...state, supply: subtractTokens(state.supply, taken) }
      s = updatePlayer(s, me, (p) => ({ ...p, tokens: addTokens(p.tokens, taken) }))
      events.push({ t: 'tokensTaken', player: me, tokens: taken })
      return afterPlayAction(s, events)
    }

    case 'RESERVE_BOARD': {
      const loc = findBoardLocation(state, action.cardId)!
      const reserved = { cardId: action.cardId, fromDeck: false }
      const goldGained = state.supply.gold > 0
      let s: GameState = goldGained
        ? { ...state, supply: withTokenDelta(state.supply, 'gold', -1) }
        : state
      s = updatePlayer(s, me, (p) => ({
        ...p,
        tokens: goldGained ? withTokenDelta(p.tokens, 'gold', 1) : p.tokens,
        reserved: [...p.reserved, reserved],
      }))
      events.push({
        t: 'cardReserved',
        player: me,
        card: reserved,
        from: { tier: loc.tier, slot: loc.slot },
        goldGained,
      })
      s = refillSlot(s, loc.tier, loc.slot, events)
      return afterPlayAction(s, events)
    }

    case 'RESERVE_DECK': {
      const deck = state.decks[action.tier - 1]!
      const cardId = deck[0]!
      const reserved = { cardId, fromDeck: true }
      const goldGained = state.supply.gold > 0
      const decks = state.decks.map((d, i) =>
        i === action.tier - 1 ? d.slice(1) : d,
      ) as unknown as GameState['decks']
      let s: GameState = {
        ...state,
        decks,
        supply: goldGained ? withTokenDelta(state.supply, 'gold', -1) : state.supply,
      }
      s = updatePlayer(s, me, (p) => ({
        ...p,
        tokens: goldGained ? withTokenDelta(p.tokens, 'gold', 1) : p.tokens,
        reserved: [...p.reserved, reserved],
      }))
      events.push({
        t: 'cardReserved',
        player: me,
        card: reserved,
        from: { tier: action.tier, slot: 'deck' },
        goldGained,
      })
      return afterPlayAction(s, events)
    }

    case 'PURCHASE': {
      const card = CARDS[action.cardId]!
      const loc = findBoardLocation(state, action.cardId)
      const from = loc ? 'board' : 'reserve'

      // 지불한 토큰(황금 포함)은 공급처로 (§9-M)
      let s: GameState = { ...state, supply: addTokens(state.supply, action.payment) }
      s = updatePlayer(s, me, (p) => ({
        ...p,
        tokens: subtractTokens(p.tokens, action.payment),
        purchased: [...p.purchased, action.cardId],
        reserved: loc ? p.reserved : p.reserved.filter((r) => r.cardId !== action.cardId),
        bonuses: withGemDelta(p.bonuses, card.bonus, 1),
        prestige: p.prestige + card.points,
      }))
      events.push({
        t: 'cardPurchased',
        player: me,
        cardId: action.cardId,
        payment: action.payment,
        from,
      })
      if (loc) s = refillSlot(s, loc.tier, loc.slot, events)
      return afterPlayAction(s, events)
    }

    case 'PASS': {
      // §6: 패스도 턴이므로 귀족 판정은 수행된다 — 수여할 귀족이 남아 있으면 일반
      // 파이프라인을 태운다 (수여로 15점에 닿으면 §8 경로가 종료를 처리한다).
      // §9-E/G [구현 결정]: 그 외에 전원 진행 불능이면 현재 점수로 교착 종료
      // (finalRound 중에는 §8 라운드 종료가 처리).
      const pendingNobles = eligibleNobles(state.players[me]!.bonuses, state.nobles)
      if (pendingNobles.length === 0 && !state.finalRound && allPlayersStuck(state)) {
        const result = computeResult(state, 'deadlockExhausted')
        const s: GameState = { ...state, phase: { kind: 'gameOver', result } }
        events.push({ t: 'gameEnded', result })
        return { state: maybeFreeze(s), events }
      }
      return afterPlayAction(state, events)
    }

    case 'DISCARD': {
      let s: GameState = { ...state, supply: addTokens(state.supply, action.tokens) }
      s = updatePlayer(s, me, (p) => ({
        ...p,
        tokens: subtractTokens(p.tokens, action.tokens),
      }))
      events.push({ t: 'tokensReturned', player: me, tokens: action.tokens })
      return resolveNobles(s, events) // §6 순서: 반납 후 귀족 판정
    }

    case 'CHOOSE_NOBLE': {
      const s = awardNoble(state, me, action.nobleId)
      events.push({ t: 'nobleVisited', player: me, nobleId: action.nobleId, auto: false })
      return finishTurn(s, events)
    }
  }
}

/** 행동 직후: 토큰 10개 검사 (§5) → 귀족 → 종료 */
function afterPlayAction(state: GameState, events: GameEvent[]): ApplyOutcome {
  const p = state.players[state.currentPlayer]!
  const excess = tokenTotal(p.tokens) - TOKEN_LIMIT
  if (excess > 0) {
    const s: GameState = {
      ...state,
      phase: { kind: 'discard', mustDiscard: excess as 1 | 2 | 3 },
    }
    events.push({ t: 'discardRequired', player: s.currentPlayer, mustDiscard: excess })
    return { state: maybeFreeze(s), events }
  }
  return resolveNobles(state, events)
}

/** 귀족 방문 판정 (§6): 단일 충족 자동 수여, 복수 충족은 플레이어 선택 대기 */
function resolveNobles(state: GameState, events: GameEvent[]): ApplyOutcome {
  const me = state.currentPlayer
  const p = state.players[me]!
  const eligible = eligibleNobles(p.bonuses, state.nobles)

  if (eligible.length === 1) {
    const s = awardNoble(state, me, eligible[0]!)
    events.push({ t: 'nobleVisited', player: me, nobleId: eligible[0]!, auto: true })
    return finishTurn(s, events)
  }
  if (eligible.length > 1) {
    const s: GameState = { ...state, phase: { kind: 'chooseNoble', options: eligible } }
    return { state: maybeFreeze(s), events }
  }
  return finishTurn(state, events)
}

/** 15점 트리거 (§8-1) → 라운드 종료 검사 (§8-2, §9-I) → 턴 넘김 */
function finishTurn(state: GameState, events: GameEvent[]): ApplyOutcome {
  const me = state.currentPlayer
  const p = state.players[me]!
  let finalRound = state.finalRound

  if (!finalRound && p.prestige >= WINNING_PRESTIGE) {
    finalRound = true
    events.push({ t: 'finalRoundTriggered', byPlayer: me })
  }

  const n = state.players.length
  const lastInRound = (me + 1) % n === state.startPlayer

  if (finalRound && lastInRound) {
    const result = computeResult(state, 'prestige15')
    const s: GameState = { ...state, finalRound, phase: { kind: 'gameOver', result } }
    events.push({ t: 'gameEnded', result })
    return { state: maybeFreeze(s), events }
  }

  const next = (me + 1) % n
  const s: GameState = {
    ...state,
    finalRound,
    phase: { kind: 'play' },
    currentPlayer: next,
    turn: state.turn + 1,
  }
  events.push({ t: 'turnEnded', nextPlayer: next })
  return { state: maybeFreeze(s), events }
}
