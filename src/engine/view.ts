// playerView — 비공개 정보 마스킹 (docs/RULES.md §9-O, docs/ARCHITECTURE.md §3)
// AI에는 항상 이것만 전달한다 — "AI가 덱을 훔쳐본다" 버그를 구조적으로 차단.
// 마스킹된 상태는 렌더/탐색용이며 applyAction의 입력으로 쓰면 안 된다.

import { HIDDEN_CARD, type GameState } from './types'

export function playerView(state: GameState, player: number): GameState {
  return {
    ...state,
    // 덱 내용은 길이만 유지 (§9-O)
    decks: state.decks.map((d) => d.map(() => HIDDEN_CARD)) as unknown as GameState['decks'],
    players: state.players.map((p, i) =>
      i === player
        ? p
        : {
            ...p,
            // 타인의 덱 비공개 예약만 가린다 — 공개 카드 예약은 전원이 이미 본 정보 (§4.3)
            reserved: p.reserved.map((r) =>
              r.fromDeck ? { cardId: HIDDEN_CARD, fromDeck: true } : r,
            ),
          },
    ),
  }
}
