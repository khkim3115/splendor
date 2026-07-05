// determinize — 마스킹된 뷰를 시드 셔플로 1회 결정화 (docs/AI_DESIGN.md §4.2)
// 마스킹된 정보(덱 내용, 타인의 덱 비공개 예약) 외에는 아무것도 바꾸지 않는다.

import {
  CARDS,
  HIDDEN_CARD,
  shuffle,
  type CardId,
  type GameState,
  type RngState,
} from '../engine'

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
