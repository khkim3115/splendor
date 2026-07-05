// 엔진 상태/액션 타입 (docs/ARCHITECTURE.md §2)

export type GemColor = 'white' | 'blue' | 'green' | 'red' | 'black'
export type TokenColor = GemColor | 'gold'

export const GEM_COLORS: readonly GemColor[] = ['white', 'blue', 'green', 'red', 'black']
export const TOKEN_COLORS: readonly TokenColor[] = [...GEM_COLORS, 'gold']

export type GemMap = Readonly<Record<GemColor, number>>
export type TokenMap = Readonly<Record<TokenColor, number>>

export type CardId = number // 0..89 (data/cards.ts 인덱스)
export type NobleId = number // 0..9

export interface Card {
  readonly id: CardId
  readonly tier: 1 | 2 | 3
  readonly points: number // 0..5
  readonly bonus: GemColor
  readonly cost: GemMap
}

export interface Noble {
  readonly id: NobleId
  readonly points: 3
  readonly requirement: GemMap // 보너스 요구량 (RULES §6)
}

/** 예약 카드 — 병렬 배열 금지, 항상 이 구조체로 다닌다 */
export interface ReservedCard {
  readonly cardId: CardId // 마스킹 시 HIDDEN_CARD(-1) 센티널
  readonly fromDeck: boolean // true = 덱 비공개 예약 (RULES §4.3, §9-O)
}
export const HIDDEN_CARD: CardId = -1

export interface PlayerState {
  readonly tokens: TokenMap
  readonly purchased: readonly CardId[]
  readonly reserved: readonly ReservedCard[] // 최대 3 (RULES §4.3)
  readonly nobles: readonly NobleId[]
  // 파생값 캐시 — 프로퍼티 테스트로 purchased 재계산값과 상시 일치 검증
  readonly bonuses: GemMap
  readonly prestige: number
}

export type Difficulty = 'easy' | 'normal' | 'hard'

export type PlayerKind =
  | { readonly type: 'human'; readonly name: string }
  | { readonly type: 'ai'; readonly name: string; readonly difficulty: Difficulty }

export interface GameConfig {
  readonly players: readonly PlayerKind[] // 2~4, 사람+AI 혼합 자유
  readonly seed: number // 유일한 무작위 원천
}

export interface GameResult {
  readonly winners: readonly number[] // 공동 승리 허용 (RULES §8-5)
  readonly scores: readonly {
    readonly prestige: number
    readonly purchasedCount: number
  }[]
  readonly reason: 'prestige15' | 'deadlockExhausted' // RULES §8, §9-E/G
}

/** 턴 내부 미세 단계. 반납·귀족 선택을 별도 결정으로 분리해 액션 조합 폭발 차단 */
export type Phase =
  | { readonly kind: 'play' } // RULES §4 4대 행동 대기
  | { readonly kind: 'discard'; readonly mustDiscard: 1 | 2 | 3 } // RULES §5 (한 턴 최대 +3)
  | { readonly kind: 'chooseNoble'; readonly options: readonly NobleId[] } // RULES §9-J 복수 충족 시에만
  | { readonly kind: 'gameOver'; readonly result: GameResult }

export interface GameState {
  readonly config: GameConfig
  readonly supply: TokenMap
  /** 티어별 남은 덱. decks[t][0]이 덱 맨 위(다음에 뽑힐 카드). 셋업 셔플 후 고정 */
  readonly decks: readonly [readonly CardId[], readonly CardId[], readonly CardId[]]
  /** [tier-1][slot 0..3], null = 소진 (RULES §7) */
  readonly board: readonly (readonly (CardId | null)[])[]
  readonly nobles: readonly NobleId[] // 감소만 함 (RULES §6)
  readonly players: readonly PlayerState[]
  readonly currentPlayer: number
  readonly startPlayer: number // RULES §8 마지막 라운드 판정 기준
  readonly phase: Phase
  readonly finalRound: boolean // RULES §8-1 트리거
  readonly turn: number
}

export type Action =
  | { readonly type: 'TAKE_DIFFERENT'; readonly colors: readonly GemColor[] }
  // |colors| = min(3, 공급처의 서로 다른 색 수) 강제 — RULES §4.1 엄격 해석 (§9-A/B)
  | { readonly type: 'TAKE_SAME'; readonly color: GemColor } // RULES §4.2: supply ≥ 4
  | { readonly type: 'RESERVE_BOARD'; readonly cardId: CardId } // RULES §4.3
  | { readonly type: 'RESERVE_DECK'; readonly tier: 1 | 2 | 3 } // RULES §4.3 비공개
  | { readonly type: 'PURCHASE'; readonly cardId: CardId; readonly payment: TokenMap }
  // 황금 배분 자유(RULES §9-L)를 액션 자체로 표현 → 리플레이 완전성
  | { readonly type: 'DISCARD'; readonly tokens: TokenMap } // phase=discard 전용 (RULES §5)
  | { readonly type: 'CHOOSE_NOBLE'; readonly nobleId: NobleId } // phase=chooseNoble 전용
  | { readonly type: 'PASS' } // RULES §9-G: 합법 행동 공집합일 때만
