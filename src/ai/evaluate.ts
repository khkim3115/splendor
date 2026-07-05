// 평가함수 (docs/AI_DESIGN.md §2) — 가중합 선형 모델 2벌 (simple/full)
// 가중치는 상수 테이블로 분리 — scripts 자가대전으로 튜닝한다.
// 규율: 할당 최소화(지역 숫자 변수), GEM_COLORS 고정 순회, HIDDEN_CARD(-1) 방어.

import {
  CARDS,
  GEM_COLORS,
  NOBLES,
  paymentNeed,
  tokenTotal,
  type GameState,
} from '../engine'

export type EvalProfile = 'simple' | 'full'

/** 초기값은 수동 튜닝 — 자가대전 결과에 따라 조정 */
export const WEIGHTS = {
  prestige: 120, // 지배적 가중치
  win: 1_000_000,
  bonus: 12, // 색별 4개까지
  bonusDiminished: 6, // 4개 초과분 (체감)
  token: 2,
  gold: 3, // 황금 ×1.5
  overStockPenalty: 3, // 토큰 합 8 초과분당 (10 제한 근접 페널티)
  cardValueBase: 8,
  cardPoint: 10, // 점수 가중 (full)
  nobleBase: 26, // 3점 가치 반영
  reservedCard: 3,
  reservedFullPenalty: 8, // 3장 잠금
  opponent: 1, // paranoid-lite: 내 평가 − max(상대 평가)
} as const

/**
 * 승리 임박도 (§2 full): 마지막 라운드에서 해당 플레이어의 턴이 남아 있는가.
 * 남은 턴이 없으면 토큰·구매 거리·귀족 진행 같은 미래 가치는 전부 무의미하다.
 */
function hasRemainingTurn(state: GameState, index: number): boolean {
  if (!state.finalRound) return true
  const n = state.players.length
  const fromCurrent = (index - state.currentPlayer + n) % n
  const seatsLeft = (state.startPlayer - 1 - state.currentPlayer + n) % n // 현재 포함 잔여 좌석 수 - 1
  return fromCurrent <= seatsLeft
}

function playerValue(state: GameState, index: number, profile: EvalProfile): number {
  const p = state.players[index]!
  const prestigeValue = p.prestige * WEIGHTS.prestige

  // 승리 임박도: 남은 턴이 없으면 명성점만 남는다 (full 전용 — simple은 시야 밖)
  if (profile === 'full' && !hasRemainingTurn(state, index)) {
    return prestigeValue
  }

  let v = prestigeValue

  // 토큰 자원 — 완만한 +, 황금 가중, 10 근접 페널티
  const total = tokenTotal(p.tokens)
  v += (total - p.tokens.gold) * WEIGHTS.token + p.tokens.gold * WEIGHTS.gold
  if (total > 8) v -= (total - 8) * WEIGHTS.overStockPenalty

  // 구매 거리: 후보 카드의 (가치 / (1 + 부족 젬 수)) 최대값
  let bestCard = 0
  const consider = (cardId: number, withPoints: boolean): void => {
    const card = CARDS[cardId]!
    const need = paymentNeed(p, card)
    let dist = 0
    for (const g of GEM_COLORS) {
      const shortage = need[g] - p.tokens[g]
      if (shortage > 0) dist += shortage
    }
    dist = Math.max(0, dist - p.tokens.gold)
    const value =
      (WEIGHTS.cardValueBase + (withPoints ? card.points * WEIGHTS.cardPoint : 0)) / (1 + dist)
    if (value > bestCard) bestCard = value
  }
  for (const row of state.board) {
    for (const id of row) {
      if (id !== null && id >= 0) consider(id, profile === 'full')
    }
  }

  if (profile === 'full') {
    for (const r of p.reserved) {
      if (r.cardId >= 0) consider(r.cardId, true)
    }
    // 보너스 — 색별 체감 (엔진 겸용 화폐)
    for (const g of GEM_COLORS) {
      const b = p.bonuses[g]
      v += Math.min(b, 4) * WEIGHTS.bonus + Math.max(0, b - 4) * WEIGHTS.bonusDiminished
    }
    // 귀족 진행도 — 최근접 귀족
    let nobleBest = 0
    for (const nid of state.nobles) {
      const req = NOBLES[nid]!.requirement
      let missing = 0
      for (const g of GEM_COLORS) {
        const gap = req[g] - p.bonuses[g]
        if (gap > 0) missing += gap
      }
      const nv = WEIGHTS.nobleBase / (1 + missing)
      if (nv > nobleBest) nobleBest = nv
    }
    v += nobleBest
    // 예약 카드 가치 — 3장 잠금은 소폭 감점
    v += p.reserved.length * WEIGHTS.reservedCard
    if (p.reserved.length >= 3) v -= WEIGHTS.reservedFullPenalty
  }

  return v + bestCard
}

/**
 * 시점 평가: me 관점의 스칼라. simple은 의도적으로 상대·귀족·예약을 보지 못한다
 * ("일부러 못 두는 AI"가 아니라 "시야가 좁은 초보").
 */
export function evaluate(state: GameState, me: number, profile: EvalProfile): number {
  if (state.phase.kind === 'gameOver') {
    return state.phase.result.winners.includes(me) ? WEIGHTS.win : -WEIGHTS.win
  }
  const mine = playerValue(state, me, profile)
  if (profile === 'simple') return mine

  let bestOther = -Infinity
  for (let i = 0; i < state.players.length; i++) {
    if (i === me) continue
    const other = playerValue(state, i, 'full')
    if (other > bestOther) bestOther = other
  }
  return mine - WEIGHTS.opponent * bestOther
}
