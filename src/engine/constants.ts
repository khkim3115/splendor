// 게임 상수 — 인원수별 셋업 테이블 (docs/RULES.md §2)

export type PlayerCount = 2 | 3 | 4

/** 인원수별 각 보석 색 토큰 수 (2인 4개 / 3인 5개 / 4인 7개) */
export const GEM_TOKENS_BY_PLAYERS: Readonly<Record<PlayerCount, number>> = {
  2: 4,
  3: 5,
  4: 7,
}

/** 황금 토큰은 인원수와 무관하게 항상 5개 */
export const GOLD_TOKENS = 5

/** 공개 귀족 타일 수 = 인원 + 1 */
export const NOBLES_BY_PLAYERS: Readonly<Record<PlayerCount, number>> = {
  2: 3,
  3: 4,
  4: 5,
}

/** 티어별 공개 카드 슬롯 수 */
export const BOARD_SLOTS = 4

/** 턴 종료 시 토큰 소지 상한 (RULES §5) */
export const TOKEN_LIMIT = 10

/** 예약 카드 상한 (RULES §4.3) */
export const RESERVE_LIMIT = 3

/** 게임 종료 트리거 점수 (RULES §8) */
export const WINNING_PRESTIGE = 15

/**
 * 룰 해석 버전 — 엔진의 룰 해석([구현 결정] 포함)이 바뀔 때 수동 증가.
 * 세이브 호환성 판정에 쓰인다 (docs/ROADMAP.md 운영 규약 2)
 */
export const RULES_VERSION = '1.0.0'
