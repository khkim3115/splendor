// determinize — 마스킹된 뷰를 시드 셔플로 1회 결정화 (docs/AI_DESIGN.md §4.2)
// 마스킹된 정보(덱 내용, 타인의 덱 비공개 예약) 외에는 아무것도 바꾸지 않는다.
// compositeMoves — 정규화 반납이 배제하는 토큰 스왑 전술의 대표 패턴 (§4.3)

import {
  CARDS,
  HIDDEN_CARD,
  applyAction,
  legalActions,
  shuffle,
  type Action,
  type CardId,
  type GameState,
  type RngState,
} from '../engine'
import { evaluate } from './evaluate'
import { discardPolicy } from './policies'
import type { ResolvedMove } from './search'

export function determinize(view: GameState, rng: RngState): [GameState, RngState] {
  const seen = new Set<CardId>()
  for (const row of view.board) {
    for (const id of row) {
      if (id !== null && id >= 0) seen.add(id)
    }
  }
  for (const p of view.players) {
    for (const id of p.purchased) seen.add(id)
    for (const r of p.reserved) {
      if (r.cardId >= 0) seen.add(r.cardId)
    }
  }

  // 티어별 미관측 카드 풀. 숨은 예약의 티어별 분포는 보존 법칙으로 유일하게 결정된다:
  // (티어 t 미관측 수) = (덱 t 길이) + (티어 t 출신 숨은 예약 수)
  const unseenByTier: CardId[][] = [[], [], []]
  for (const card of CARDS) {
    if (!seen.has(card.id)) unseenByTier[card.tier - 1]!.push(card.id)
  }

  let state = rng
  const reservePool: CardId[] = []
  const decks: CardId[][] = []
  for (const t of [0, 1, 2] as const) {
    const [shuffled, next] = shuffle(state, unseenByTier[t]!)
    state = next
    const extra = shuffled.length - view.decks[t]!.length
    reservePool.push(...shuffled.slice(0, extra))
    decks.push([...shuffled.slice(extra)])
  }

  const [pool, next] = shuffle(state, reservePool)
  state = next
  let k = 0
  const players = view.players.map((p) => ({
    ...p,
    reserved: p.reserved.map((r) =>
      r.cardId === HIDDEN_CARD ? { cardId: pool[k++]!, fromDeck: true } : r,
    ),
  }))

  return [
    {
      ...view,
      decks: decks as unknown as GameState['decks'],
      players,
    },
    state,
  ]
}

/** 루트 후보 총량 폭발 방지 — composite는 "대표 패턴 소수"다 (§4.3) */
const MAX_COMPOSITE = 8

/**
 * 토큰 스왑 composite 후보 (docs/AI_DESIGN.md §4.3) — MCTS 루트 전용.
 * 10개 초과를 유발하는 TAKE에 대해, 정책 반납(1-ply argmax) 다음으로 좋은
 * 대안 반납 1개를 명시적 엣지로 추가한다. 깊은 탐색이 정책과 다른 반납이
 * 유리한 희귀 국면을 재평가할 여지를 주되, 완전한 열거는 아니다(문서화된 한계).
 */
export function compositeMoves(state: GameState, legal: readonly Action[]): ResolvedMove[] {
  if (state.phase.kind !== 'play') return []
  const me = state.currentPlayer
  const out: ResolvedMove[] = []
  for (const action of legal) {
    if (out.length >= MAX_COMPOSITE) break
    if (action.type !== 'TAKE_DIFFERENT' && action.type !== 'TAKE_SAME') continue
    const mid = applyAction(state, action).state
    if (mid.phase.kind !== 'discard') continue

    const policyKey = JSON.stringify(discardPolicy(mid, me))
    let best: Action | null = null
    let bestScore = -Infinity
    for (const discard of legalActions(mid)) {
      // 반납 조합 전수 ≤56 (RULES §5)
      if (JSON.stringify(discard) === policyKey) continue
      const score = evaluate(applyAction(mid, discard).state, me, 'full')
      if (score > bestScore) {
        bestScore = score
        best = discard
      }
    }
    if (best) out.push({ action, forcedDiscard: best })
  }
  return out
}
