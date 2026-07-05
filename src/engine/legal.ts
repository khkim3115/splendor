// 액션 합법성 검증 (docs/RULES.md §4, §5, §6, §9)
// 실패 사유에 룰 문서 §번호를 담아 테스트·툴팁·디버깅이 룰 문서로 직결된다.
// legalActions 전 phase 완전 열거는 M3에서 추가된다.

import { CARDS } from './data/cards'
import { RESERVE_LIMIT } from './constants'
import type { ValidationResult } from './errors'
import { canAfford, canonicalPayment, isValidPayment } from './payment'
import { tokenTotal } from './tokens'
import {
  GEM_COLORS,
  TOKEN_COLORS,
  type Action,
  type CardId,
  type GameState,
  type GemColor,
  type TokenColor,
  type TokenMap,
} from './types'

const COLOR_KO: Record<TokenColor, string> = {
  white: '다이아몬드(하양)',
  blue: '사파이어(파랑)',
  green: '에메랄드(초록)',
  red: '루비(빨강)',
  black: '오닉스(검정)',
  gold: '황금',
}

function fail(rule: string, messageKo: string): ValidationResult {
  return { ok: false, rule, messageKo }
}

const OK: ValidationResult = { ok: true }

/** 공개 카드의 보드 위치를 찾는다. 유효하지 않은 cardId(null, -1 등)는 null 슬롯과 매칭되지 않도록 걸러낸다 */
export function findBoardLocation(
  state: GameState,
  cardId: CardId,
): { tier: 1 | 2 | 3; slot: number } | null {
  if (!Number.isInteger(cardId) || cardId < 0) return null
  for (const tier of [1, 2, 3] as const) {
    const row = state.board[tier - 1]
    if (!row) continue
    const slot = row.indexOf(cardId)
    if (slot >= 0) return { tier, slot }
  }
  return null
}

/**
 * §9-G 판정용: 해당 플레이어에게 합법인 play 행동(A/B/C/D)이 하나라도 있는가.
 * 마스킹된 상태(cardId = HIDDEN_CARD)의 타인 예약 카드는 판정에서 제외한다.
 */
export function hasAnyLegalPlayAction(
  state: GameState,
  playerIndex: number = state.currentPlayer,
): boolean {
  const p = state.players[playerIndex]
  if (!p) return false

  // 행동 A: 보석 토큰이 1색이라도 남아 있으면 성립 (§9-A/B)
  if (GEM_COLORS.some((g) => state.supply[g] > 0)) return true

  // 행동 C: 예약 여유 + 예약할 카드 존재 (황금 유무는 무관, §9-F)
  // 보드의 HIDDEN_CARD(-1)는 마스킹 상태에 수를 적용한 탐색 국면에서만 생기며,
  // legalActions와의 일관성을 위해 판정에서 제외한다
  if (p.reserved.length < RESERVE_LIMIT) {
    const anyBoardCard = state.board.some((row) => row.some((c) => c !== null && c >= 0))
    const anyDeckCard = state.decks.some((d) => d.length > 0)
    if (anyBoardCard || anyDeckCard) return true
  }

  // 행동 D: 구매 가능한 카드 존재
  for (const row of state.board) {
    for (const id of row) {
      if (id !== null && id >= 0 && canAfford(p, CARDS[id]!)) return true
    }
  }
  for (const r of p.reserved) {
    if (r.cardId >= 0 && canAfford(p, CARDS[r.cardId]!)) return true
  }
  return false
}

/** §9-E/G 교착 판정: 어느 플레이어도 합법 play 행동이 없다 */
export function allPlayersStuck(state: GameState): boolean {
  return state.players.every((_, i) => !hasAnyLegalPlayAction(state, i))
}

export function validateAction(state: GameState, action: Action): ValidationResult {
  // 액션은 JSON에서 올 수 있다 — null 등 비객체에도 throw 없이 응답한다
  if (typeof action !== 'object' || action === null) {
    return fail('§4', '알 수 없는 액션입니다')
  }
  const phase = state.phase
  if (phase.kind === 'gameOver') {
    return fail('§8', '게임이 이미 종료되었습니다')
  }

  const player = state.players[state.currentPlayer]
  if (!player) return fail('§2', '유효하지 않은 현재 플레이어입니다')

  switch (action.type) {
    case 'TAKE_DIFFERENT': {
      if (phase.kind !== 'play') return fail('§4', '지금은 행동을 할 수 없습니다')
      // 액션은 JSON(세이브/Worker)에서 올 수 있으므로 형태와 값을 모두 런타임에 방어한다
      if (!Array.isArray(action.colors)) {
        return fail('§4.1', '색 목록이 올바르지 않습니다')
      }
      const colors: readonly GemColor[] = action.colors // Array.isArray의 any[] 좁힘 되돌리기
      if (colors.length === 0) {
        return fail('§9-A', '토큰 0개 획득은 행동으로 성립하지 않습니다')
      }
      if (new Set(colors).size !== colors.length) {
        return fail('§4.1', '같은 색을 중복해서 가져올 수 없습니다')
      }
      for (const c of colors) {
        if ((c as string) === 'gold') {
          return fail('§9-F', '황금 토큰은 이 행동으로 가져올 수 없습니다 (예약으로만 획득)')
        }
        if (!GEM_COLORS.includes(c)) {
          return fail('§4.1', '유효하지 않은 색입니다')
        }
      }
      for (const c of colors) {
        if (state.supply[c] <= 0) {
          return fail('§4.1', `${COLOR_KO[c]} 토큰이 공급처에 없습니다`)
        }
      }
      const available = GEM_COLORS.filter((g) => state.supply[g] > 0).length
      const required = Math.min(3, available)
      if (colors.length !== required) {
        return fail(
          '§4.1',
          `남아 있는 서로 다른 색 기준으로 정확히 ${required}개를 가져와야 합니다 (엄격 해석)`,
        )
      }
      return OK
    }

    case 'TAKE_SAME': {
      if (phase.kind !== 'play') return fail('§4', '지금은 행동을 할 수 없습니다')
      if ((action.color as string) === 'gold') {
        return fail('§9-F', '황금 토큰은 이 행동으로 가져올 수 없습니다 (예약으로만 획득)')
      }
      if (!GEM_COLORS.includes(action.color)) {
        return fail('§4.2', '유효하지 않은 색입니다')
      }
      if (state.supply[action.color] < 4) {
        return fail(
          '§4.2',
          `${COLOR_KO[action.color]} 토큰이 4개 이상 남아 있을 때만 같은 색 2개를 가져올 수 있습니다`,
        )
      }
      return OK
    }

    case 'RESERVE_BOARD': {
      if (phase.kind !== 'play') return fail('§4', '지금은 행동을 할 수 없습니다')
      if (player.reserved.length >= RESERVE_LIMIT) {
        return fail('§4.3', `예약 카드는 최대 ${RESERVE_LIMIT}장입니다`)
      }
      if (!findBoardLocation(state, action.cardId)) {
        return fail('§4.3', '해당 카드는 공개 카드가 아닙니다')
      }
      return OK
    }

    case 'RESERVE_DECK': {
      if (phase.kind !== 'play') return fail('§4', '지금은 행동을 할 수 없습니다')
      if (player.reserved.length >= RESERVE_LIMIT) {
        return fail('§4.3', `예약 카드는 최대 ${RESERVE_LIMIT}장입니다`)
      }
      if (action.tier !== 1 && action.tier !== 2 && action.tier !== 3) {
        return fail('§4.3', '존재하지 않는 티어입니다')
      }
      if (state.decks[action.tier - 1]!.length === 0) {
        return fail('§9-E', '덱이 소진되어 비공개 예약을 할 수 없습니다')
      }
      return OK
    }

    case 'PURCHASE': {
      if (phase.kind !== 'play') return fail('§4', '지금은 행동을 할 수 없습니다')
      // HIDDEN_CARD(-1)·null 등 유효 범위 밖 cardId 방어 (마스킹 상태에서의 호출 포함)
      if (
        !Number.isInteger(action.cardId) ||
        action.cardId < 0 ||
        action.cardId >= CARDS.length
      ) {
        return fail('§4.4', '유효하지 않은 카드입니다')
      }
      if (typeof action.payment !== 'object' || action.payment === null) {
        return fail('§4.4.1', '지불 구성이 올바르지 않습니다')
      }
      const onBoard = findBoardLocation(state, action.cardId) !== null
      const inReserve = player.reserved.some((r) => r.cardId === action.cardId)
      if (!onBoard && !inReserve) {
        return fail('§4.4', '공개 카드 또는 자신의 예약 카드만 구매할 수 있습니다')
      }
      const card = CARDS[action.cardId]!
      if (!canAfford(player, card)) {
        return fail('§4.4.1', '토큰이 부족해 이 카드를 구매할 수 없습니다')
      }
      if (!isValidPayment(player, card, action.payment)) {
        return fail('§4.4.1', '지불 구성이 규칙에 맞지 않습니다 (색별 초과 지불 또는 황금 배분 오류)')
      }
      return OK
    }

    case 'DISCARD': {
      if (phase.kind !== 'discard') {
        return fail('§5', '지금은 토큰을 반납할 수 없습니다')
      }
      if (typeof action.tokens !== 'object' || action.tokens === null) {
        return fail('§5', '반납 목록이 올바르지 않습니다')
      }
      const total = tokenTotal(action.tokens)
      if (total !== phase.mustDiscard) {
        return fail('§5', `정확히 ${phase.mustDiscard}개를 반납해야 합니다`)
      }
      for (const c of Object.keys(action.tokens) as TokenColor[]) {
        const v = action.tokens[c]
        if (!Number.isInteger(v) || v < 0) return fail('§5', '반납 수량이 올바르지 않습니다')
        if (v > player.tokens[c]) {
          return fail('§5', `${COLOR_KO[c]} 토큰을 그만큼 갖고 있지 않습니다`)
        }
      }
      return OK
    }

    case 'CHOOSE_NOBLE': {
      if (phase.kind !== 'chooseNoble') {
        return fail('§6', '지금은 귀족을 선택할 수 없습니다')
      }
      if (!phase.options.includes(action.nobleId)) {
        return fail('§9-J', '조건을 충족한 귀족 중에서만 선택할 수 있습니다')
      }
      return OK
    }

    case 'PASS': {
      if (phase.kind !== 'play') return fail('§9-G', '지금은 패스할 수 없습니다')
      if (hasAnyLegalPlayAction(state)) {
        return fail('§9-G', '가능한 행동이 있으면 반드시 수행해야 합니다 (패스 불가)')
      }
      return OK
    }

    // 액션은 JSON에서 올 수 있다 — 타입 유니온 밖의 type 값도 ValidationResult로 응답한다
    default:
      return fail('§4', '알 수 없는 액션입니다')
  }
}

export function isLegal(state: GameState, action: Action): boolean {
  return validateAction(state, action).ok
}

/** k개 조합 (순서 고정 — 결정론) */
function chooseK<T>(xs: readonly T[], k: number): readonly (readonly T[])[] {
  if (k === 0) return [[]]
  if (xs.length < k) return []
  const [head, ...rest] = xs as [T, ...T[]]
  const withHead = chooseK(rest, k - 1).map((c) => [head, ...c])
  return [...withHead, ...chooseK(rest, k)]
}

/** 보유량 한도 내에서 정확히 k개를 반납하는 모든 조합 (6색 중복조합, k ≤ 3 → 최대 C(8,3)=56) */
function discardCombos(holdings: TokenMap, k: number): readonly TokenMap[] {
  const out: TokenMap[] = []
  const counts: number[] = [0, 0, 0, 0, 0, 0]
  const build = (): TokenMap => ({
    white: counts[0]!,
    blue: counts[1]!,
    green: counts[2]!,
    red: counts[3]!,
    black: counts[4]!,
    gold: counts[5]!,
  })
  const rec = (i: number, remaining: number): void => {
    if (remaining === 0) {
      out.push(build())
      return
    }
    if (i >= TOKEN_COLORS.length) return
    const cap = Math.min(remaining, holdings[TOKEN_COLORS[i]!])
    for (let take = cap; take >= 0; take--) {
      counts[i] = take
      rec(i + 1, remaining - take)
    }
    counts[i] = 0
  }
  rec(0, k)
  return out
}

/**
 * 전 phase 완전(total) 열거 (docs/ARCHITECTURE.md §3)
 * 불변식(예외 없음): phase≠gameOver ⇒ length ≥ 1, 반환된 모든 액션은
 * applyAction이 throw 없이 적용되고 isLegal=true.
 * - play: 4대 행동 전 조합. PURCHASE는 canonicalPayment 1개로 대표 (§9-L의
 *   황금 배분 자유는 UI의 PaymentModal이 노출 — 열거 폭발 방지)
 * - discard: 반납 조합 전수, chooseNoble: 후보 전체, play 공집합이면 [PASS]
 */
export function legalActions(state: GameState): readonly Action[] {
  const phase = state.phase
  if (phase.kind === 'gameOver') return []

  const player = state.players[state.currentPlayer]!

  if (phase.kind === 'discard') {
    return discardCombos(player.tokens, phase.mustDiscard).map((t) => ({
      type: 'DISCARD',
      tokens: t,
    }))
  }

  if (phase.kind === 'chooseNoble') {
    return phase.options.map((nobleId) => ({ type: 'CHOOSE_NOBLE', nobleId }))
  }

  const actions: Action[] = []

  // 행동 A (§4.1 엄격 해석: 정확히 min(3, 남은 색 수)개)
  const available = GEM_COLORS.filter((g) => state.supply[g] > 0)
  const required = Math.min(3, available.length)
  if (required > 0) {
    for (const combo of chooseK(available, required)) {
      actions.push({ type: 'TAKE_DIFFERENT', colors: combo })
    }
  }

  // 행동 B (§4.2)
  for (const c of GEM_COLORS) {
    if (state.supply[c] >= 4) actions.push({ type: 'TAKE_SAME', color: c })
  }

  // 행동 C (§4.3) — 보드의 HIDDEN_CARD(-1, 탐색 국면)는 제외
  if (player.reserved.length < RESERVE_LIMIT) {
    for (const row of state.board) {
      for (const id of row) {
        if (id !== null && id >= 0) actions.push({ type: 'RESERVE_BOARD', cardId: id })
      }
    }
    for (const tier of [1, 2, 3] as const) {
      if (state.decks[tier - 1]!.length > 0) actions.push({ type: 'RESERVE_DECK', tier })
    }
  }

  // 행동 D (§4.4) — 공개 카드 + 자신의 예약 카드 (마스킹 카드 제외)
  const purchasable: CardId[] = []
  for (const row of state.board) {
    for (const id of row) {
      if (id !== null && id >= 0) purchasable.push(id)
    }
  }
  for (const r of player.reserved) {
    if (r.cardId >= 0) purchasable.push(r.cardId)
  }
  for (const id of purchasable) {
    const card = CARDS[id]!
    if (canAfford(player, card)) {
      actions.push({ type: 'PURCHASE', cardId: id, payment: canonicalPayment(player, card) })
    }
  }

  // §9-G: 합법 행동 공집합이면 PASS가 유일 합법수
  if (actions.length === 0) return [{ type: 'PASS' }]
  return actions
}
