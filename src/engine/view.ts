// playerView — 비공개 정보 마스킹 (docs/RULES.md §9-O, docs/ARCHITECTURE.md §3)
// AI에는 항상 이것만 전달한다 — "AI가 덱을 훔쳐본다" 버그를 구조적으로 차단.
//
// 탐색 계약: 마스킹 상태에 applyAction으로 수를 두는 얕은 탐색은 안전하다
// (legalActions/hasAnyLegalPlayAction이 보드·예약에 유입된 HIDDEN_CARD를 방어).
// 단, 덱 보충·덱 예약이 HIDDEN_CARD(-1)로 나타나 정보가 열화되므로
// 깊은 탐색은 determinize(마스킹 구간을 시드 셔플로 1회 결정화) 후 수행한다
// (docs/AI_DESIGN.md §4.2). 마스킹 상태는 저장·정식 게임 진행의 입력이 아니다.

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
