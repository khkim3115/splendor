# ARCHITECTURE.md — 스플랜더 웹 게임 최종 아키텍처

> **기본 골격**: 설계안 0 ("엔진 순수성 · 테스트 우선").
> **접목**: 설계안 1의 `ReservedCard` 구조체·`GameEvent` 스트림·저장/undo/핸드오프 정책, 설계안 2의 정책 일치성(policy-consistency) 테스트·그리디 타임아웃 폴백·벤치마크 스크립트.
> **원칙**: 게임 룰 엔진은 React도, DOM도, `Date.now()`도 모르는 순수 함수형 TypeScript 모듈이다. `상태 + 액션 → { 새 상태, 이벤트[] }`라는 단 하나의 결정론적 전이 함수 위에 모든 것을 쌓는다. 시드와 액션 열이 같으면 최종 상태는 바이트 단위로 같다.

---

## 0. 심사 지적 결함 → 최종 해결 대조표

구현 전 반드시 숙지할 것. 아래 결정은 재론하지 않는다.

| # | 심사 지적 | 최종 해결 |
|---|---|---|
| 1 | `legalActions`가 discard phase에서 미정의 — "절대 빈 배열 아님" 불변식과 자기모순 | **`legalActions`는 모든 phase에서 완전(total) 열거로 통일한다.** discard phase의 반납 조합은 수학적으로 작다: 한 턴에 늘어나는 토큰은 최대 3개이므로 `mustDiscard ∈ {1,2,3}`이고, 6색 중복조합 최대치는 C(8,3)=56. 전수 열거해도 트리비얼하다. 따라서 `legalActions`는 discard에서 반납 조합 전체(≤56), chooseNoble에서 후보 전체(≤5)를 반환하며, 불변식 "phase≠gameOver ⇒ legalActions ≥ 1개, 전부 적용 가능"이 **모든 phase에서 예외 없이** 성립한다. AI의 `normalizedDiscard`는 인터페이스 우회가 아니라 **탐색용 가지치기 휴리스틱**으로 강등되며, "그 출력이 `legalActions` 원소"라는 테스트로 계약을 고정한다. |
| 2 | `reservedFromDeck: boolean[]` 병렬 배열 = 탈동기화 버그 온상 | **설계안 1의 `ReservedCard { cardId, fromDeck }` 구조체 채택.** 병렬 배열 전면 폐기. |
| 3 | 불변 엔진 MCTS 1,000 iter/s 목표가 하한선 — 미달 시 이중 엔진 리스크 | AI_DESIGN.md §5의 **측정 우선 + 4단계 에스컬레이션 사다리**로 해결. 이중 엔진(L3)은 최후 수단으로 명시적 게이트 뒤에 두고, 그 전에 무비용 최적화(L0)·가지치기(L1)·알고리즘 교체(L2: 3-ply max-n)로 흡수한다. phase 중간 노드 비용은 탐색 전용 `applyResolved` 래퍼(공개 API 합성, 엔진 이중화 아님)로 제거하고, 탐색이 가정한 반납/귀족 정책과 실제 응답의 동일성을 **policy-consistency 테스트**(설계안 2 채택)로 고정한다. |
| 4 | 100% 브랜치 커버리지 게이트 + 수동 rules-mapping 문서 + nightly arena = 초기 리드타임 과다, Actions 실행시간 미검토 | (a) 커버리지 게이트는 **M3 완료 후부터** `engine/` 한정 라인 95% / 브랜치 90%로 완화·지연 적용. (b) rules-mapping 문서는 수동 관리하지 않고 **테스트 타이틀의 §태그에서 스크립트로 자동 생성**(`scripts/gen-rules-mapping.ts`). (c) arena는 nightly가 아닌 **주 1회**, 어려움 AI 예산을 1,000ms→150ms로 축소해 실행(상대 강도 서열은 보존됨). 예상 실행시간을 명시: 150ms×평균 60수×인접쌍당 200판×2쌍 ≈ 60~70분 — Actions 6시간 한도 내. PR 게이트에서 제외. |
| 5 | `(config, actions[])` 저장의 버전 마이그레이션 부재 | **버전 태그 세이브 포맷**(§6.3): `schemaVersion` + `rulesVersion` + 카드 데이터 체크섬 + 리플레이 검증 해시. 불일치 시 검증 리플레이 → 실패하면 한국어 안내 후 폐기 선택. 마이그레이터 체인 자리 확보. |
| 6 | 이벤트 스트림이 1급 시민이 아니어서 애니메이션·로그·낭독이 상태 diff 역산 | **설계안 1의 `GameEvent` 스트림을 엔진 1급 시민으로 승격**: `applyAction`이 `{ state, events }`를 반환. 게임 로그·aria-live 낭독·(후순위) 연출이 같은 스트림을 소비한다. |
| — | 로그 예시("Bmoved") 등 디테일 완성도 | 모든 사용자 노출 문자열은 `ui/i18n/ko.ts`에 집중하고 이벤트→한국어 서술 변환기를 단일 함수로 둔다. 예: `"김철수: 사파이어 토큰 2개 획득"`. |

---

## 1. 폴더/모듈 구조

```
splendor/
├─ index.html
├─ package.json                    # react, react-dom, zustand, vite, vitest, fast-check, typescript
├─ vite.config.ts                  # base: '/splendor/' (GitHub Pages), worker: { format: 'es' }
├─ tsconfig.json                   # strict: true, noUncheckedIndexedAccess: true
├─ eslint.config.js                # 경계 규칙(하단), Math.random 전면 금지
├─ .github/workflows/
│  ├─ ci.yml                       # typecheck + lint + vitest 전체 + build (PR 게이트)
│  ├─ deploy.yml                   # main 머지 시 gh-pages 배포
│  └─ ai-arena.yml                 # 주 1회: 자가대전 매트릭스 (축소 예산, 비차단)
├─ scripts/
│  ├─ run-bench.mjs                # 벤치 러너(npm run bench) — 측정 본체는 tests/bench/bench.test.ts
│  └─ gen-rules-mapping.ts         # 테스트 타이틀 §태그 → docs/rules-mapping.md 자동 생성
│                                  # (난이도 매트릭스 자가대전은 tests/ai/arena.selfplay.test.ts — SELFPLAY=1 가드)
├─ src/
│  ├─ engine/                      # ★ 순수 엔진. react/dom/store import 금지 (ESLint 강제)
│  │  ├─ types.ts                  # 상태/액션/이벤트 전 타입
│  │  ├─ constants.ts              # 토큰 수, 인원별 셋업 테이블 (§2)
│  │  ├─ data/
│  │  │  ├─ cards.ts               # 개발 카드 90장 (원작과 동일한 비용/점수/보너스만)
│  │  │  └─ nobles.ts              # 귀족 10장
│  │  ├─ rng.ts                    # splitmix32 결정론 PRNG + 순수 셔플
│  │  ├─ setup.ts                  # setupGame(config) — 유일한 RNG 소비처
│  │  ├─ legal.ts                  # legalActions / isLegal / validateAction (전 phase 완전 열거)
│  │  ├─ payment.ts                # §4.4.1 지불 판정 독립 순수 함수군
│  │  ├─ apply.ts                  # applyAction — 유일한 전이 함수, {state, events} 반환
│  │  ├─ events.ts                 # GameEvent 타입 + apply 내부 이벤트 조립 헬퍼
│  │  ├─ nobles.ts                 # §6 귀족 판정
│  │  ├─ end.ts                    # §8 종료·승자·동점 판정
│  │  ├─ helpers.ts                # UI 보조 순수 함수: paymentBounds, excessTokens, canReserve 등
│  │  ├─ view.ts                   # playerView — 비공개 정보 마스킹 (§9-O)
│  │  ├─ serialize.ts              # 직렬화/hashState/replay + 세이브 포맷 버전
│  │  └─ index.ts                  # 공개 API만 재수출
│  ├─ ai/                          # engine에만 의존. react 금지
│  │  ├─ types.ts                  # AIAgent, Difficulty
│  │  ├─ evaluate.ts               # 평가함수 simple/full 2벌 (가중치 상수 분리)
│  │  ├─ moveGen.ts                # 탐색용 후보 축약·determinize
│  │  ├─ policies.ts               # ★ discardPolicy/noblePolicy — 탐색·실전 공용 (설계안 2)
│  │  ├─ search.ts                 # applyResolved 래퍼 (phase 자동 해소 합성)
│  │  ├─ greedy.ts                 # 쉬움/보통
│  │  ├─ mcts.ts                   # 어려움
│  │  ├─ guards.ts                 # 명백수 하드가드
│  │  ├─ worker.ts                 # Web Worker 엔트리
│  │  └─ client.ts                 # 메인스레드 프록시 (타임아웃+그리디 폴백)
│  ├─ store/
│  │  ├─ gameStore.ts              # Zustand 단일 스토어
│  │  └─ persistence.ts            # 버전 태그 세이브/로드/마이그레이션
│  ├─ ui/
│  │  ├─ screens/  (SetupScreen, GameScreen, ResultScreen)
│  │  ├─ components/
│  │  │  ├─ board/   (CardBoard, CardView, DeckPile, NobleRow, TokenSupply)
│  │  │  ├─ player/  (PlayerPanel, ReservedHand, BonusRow)
│  │  │  ├─ modals/  (DiscardModal, NobleChoiceModal, PaymentModal, HandoffOverlay)
│  │  │  └─ common/  (GemIcon, TurnBanner, GameLog, Announcer, AiThinkingIndicator)
│  │  └─ i18n/ko.ts                # 한국어 문자열 + describeEvent(GameEvent): string
│  ├─ App.tsx
│  └─ main.tsx
├─ tests/
│  ├─ data/cardData.test.ts        # §1 구성물 검증
│  ├─ engine/                      # §조항별 파일 (setup/takeTokens/reserve/payment/
│  │                               #  tokenLimit/nobles/refill/endgame/deadlock)
│  ├─ properties/invariants.test.ts
│  ├─ replays/ (*.replay.json, replay.test.ts)
│  └─ ai/ (guards.test.ts, policyConsistency.test.ts, legalityFuzz.test.ts, arena.bench.ts)
└─ docs/
   └─ rules-mapping.md             # 자동 생성물 (수동 편집 금지, CI에서 stale 검사)
```

**의존 방향 강제**: ESLint `import/no-restricted-paths`로 `ui → store → engine ← ai` 단방향. `engine/`·`ai/`에서 `react`, `src/ui`, `src/store` import 시 빌드 실패. `Math.random`·`Date.now`는 저장소 전체 ESLint 금지(예외: `ai/client.ts`의 타임아웃 계측, `store`의 저장 타임스탬프 — 파일 단위 disable 주석으로만 허용).

---

## 2. 엔진 상태/액션/이벤트 타입

```ts
// engine/types.ts
export type GemColor = 'white' | 'blue' | 'green' | 'red' | 'black';
export type TokenColor = GemColor | 'gold';
export const GEM_COLORS: readonly GemColor[] = ['white', 'blue', 'green', 'red', 'black'];

export type GemMap   = Readonly<Record<GemColor, number>>;
export type TokenMap = Readonly<Record<TokenColor, number>>;

export type CardId = number;    // 0..89 (data/cards.ts 인덱스)
export type NobleId = number;   // 0..9

export interface Card {
  readonly id: CardId;
  readonly tier: 1 | 2 | 3;
  readonly points: number;              // 0..5
  readonly bonus: GemColor;
  readonly cost: GemMap;
}

export interface Noble {
  readonly id: NobleId;
  readonly points: 3;
  readonly requirement: GemMap;         // 보너스 요구량 (§6)
}

/** [결함 2 해결] 병렬 배열 폐기 — 예약 카드는 항상 이 구조체로 다닌다 */
export interface ReservedCard {
  readonly cardId: CardId;              // 마스킹 시 HIDDEN_CARD(-1) 센티널
  readonly fromDeck: boolean;           // true = 덱 비공개 예약 (§4.3, §9-O)
}
export const HIDDEN_CARD: CardId = -1;

export interface PlayerState {
  readonly tokens: TokenMap;
  readonly purchased: readonly CardId[];
  readonly reserved: readonly ReservedCard[];    // 최대 3 (§4.3)
  readonly nobles: readonly NobleId[];
  // 파생값 캐시 — 프로퍼티 테스트로 purchased 재계산값과 상시 일치 검증
  readonly bonuses: GemMap;
  readonly prestige: number;
}

export type PlayerKind =
  | { readonly type: 'human'; readonly name: string }
  | { readonly type: 'ai'; readonly name: string; readonly difficulty: 'easy' | 'normal' | 'hard' };

export interface GameConfig {
  readonly players: readonly PlayerKind[];   // 2~4, 사람+AI 혼합 자유
  readonly seed: number;                     // 유일한 무작위 원천
}

/** 턴 내부 미세 단계. 반납·귀족 선택을 별도 결정으로 분리해 액션 조합 폭발 차단 */
export type Phase =
  | { readonly kind: 'play' }                                             // §4 4대 행동 대기
  | { readonly kind: 'discard'; readonly mustDiscard: 1 | 2 | 3 }         // §5 (한 턴 최대 +3이므로 상한 3)
  | { readonly kind: 'chooseNoble'; readonly options: readonly NobleId[] }// §9-J 복수 충족 시에만
  | { readonly kind: 'gameOver'; readonly result: GameResult };

export interface GameState {
  readonly config: GameConfig;
  readonly supply: TokenMap;
  readonly decks: readonly [readonly CardId[], readonly CardId[], readonly CardId[]];
                                       // 셋업 시 셔플 후 고정 — 진행 중 RNG 불필요
  readonly board: readonly (CardId | null)[][];   // [tier][slot 0..3], null = 소진 (§7)
  readonly nobles: readonly NobleId[];            // 감소만 함 (§6)
  readonly players: readonly PlayerState[];
  readonly currentPlayer: number;
  readonly startPlayer: number;        // §8 마지막 라운드 판정 기준
  readonly phase: Phase;
  readonly finalRound: boolean;        // §8-1 트리거
  readonly turn: number;
}

export interface GameResult {
  readonly winners: readonly number[]; // §8-5 공동 승리 허용
  readonly scores: readonly { readonly prestige: number; readonly purchasedCount: number }[];
  readonly reason: 'prestige15' | 'deadlockExhausted';   // §9-E/G
}
```

### 2.1 액션

```ts
export type Action =
  | { readonly type: 'TAKE_DIFFERENT'; readonly colors: readonly GemColor[] }
      // |colors| = min(3, 공급처의 서로 다른 색 수) 강제 — §4.1 엄격 해석 (§9-A/B)
  | { readonly type: 'TAKE_SAME'; readonly color: GemColor }               // §4.2: supply ≥ 4
  | { readonly type: 'RESERVE_BOARD'; readonly cardId: CardId }            // §4.3
  | { readonly type: 'RESERVE_DECK'; readonly tier: 1 | 2 | 3 }            // §4.3 비공개
  | { readonly type: 'PURCHASE'; readonly cardId: CardId; readonly payment: TokenMap }
      // 황금 배분 자유(§9-L)를 액션 자체로 표현 → 리플레이 완전성
  | { readonly type: 'DISCARD'; readonly tokens: TokenMap }                // phase=discard 전용 (§5)
  | { readonly type: 'CHOOSE_NOBLE'; readonly nobleId: NobleId }           // phase=chooseNoble 전용
  | { readonly type: 'PASS' };  // §9-G: 합법 행동 공집합일 때 엔진이 생성하는 유일 합법수
```

### 2.2 이벤트 — 1급 시민 [결함 6 해결]

`applyAction`이 상태와 함께 반환한다. **로그 패널·aria-live 낭독·(후순위) 애니메이션**이 전부 이 스트림 하나를 소비하므로 "화면에 보이는 것 = 낭독되는 것 = 기록되는 것"이 구조적으로 보장된다.

```ts
// engine/events.ts
export type GameEvent =
  | { readonly t: 'tokensTaken';    readonly player: number; readonly tokens: TokenMap }
  | { readonly t: 'tokensReturned'; readonly player: number; readonly tokens: TokenMap }
  | { readonly t: 'cardReserved';   readonly player: number; readonly card: ReservedCard;
      readonly from: { readonly tier: 1|2|3; readonly slot: number | 'deck' }; readonly goldGained: boolean }
  | { readonly t: 'cardPurchased';  readonly player: number; readonly cardId: CardId;
      readonly payment: TokenMap; readonly from: 'board' | 'reserve' }
  | { readonly t: 'slotRefilled';   readonly tier: 1|2|3; readonly slot: number;
      readonly cardId: CardId | null }                       // null = 덱 소진 (§7)
  | { readonly t: 'nobleVisited';   readonly player: number; readonly nobleId: NobleId;
      readonly auto: boolean }                               // auto=단일 충족 자동 수여
  | { readonly t: 'discardRequired'; readonly player: number; readonly mustDiscard: number }
  | { readonly t: 'finalRoundTriggered'; readonly byPlayer: number }
  | { readonly t: 'turnEnded';      readonly nextPlayer: number }
  | { readonly t: 'gameEnded';      readonly result: GameResult };
```

---

## 3. 엔진 공개 API

```ts
// engine/index.ts — 이것만 외부에 노출
export function setupGame(config: GameConfig): GameState;   // §2 셋업. RNG의 유일 소비처

/** [결함 1 해결] 모든 phase에서 완전(total) 열거로 통일.
 *  - play        → 4대 행동 전 조합 (PURCHASE는 canonicalPayment 1개로 대표. 상한 ~60)
 *  - discard     → mustDiscard(≤3)개 반납 조합 전수 (6색 중복조합, 상한 C(8,3)=56)
 *  - chooseNoble → CHOOSE_NOBLE × options (≤5)
 *  - play에서 공집합이면 [{type:'PASS'}] (§9-G)
 *  ★ 불변식(전 phase 예외 없음): phase≠gameOver ⇒ length ≥ 1,
 *    반환된 모든 액션은 applyAction이 throw 없이 적용, isLegal=true. */
export function legalActions(state: GameState): readonly Action[];

export function isLegal(state: GameState, action: Action): boolean;
export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly rule: string /* '§4.2' 등 */; readonly messageKo: string };
export function validateAction(state: GameState, action: Action): ValidationResult;
  // 실패 사유에 룰 문서 §번호 — 테스트·툴팁·디버깅이 룰 문서로 직결

export interface ApplyOutcome {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}
export function applyAction(state: GameState, action: Action): ApplyOutcome;
  // ★ 유일한 전이 함수. 완전 순수·불변(구조적 공유). dev 빌드에서 입력 deep-freeze.
  //   불법 액션은 IllegalActionError(validateAction 결과 포함) throw.
  //   내부 처리 순서(§6 구현 결정 고정):
  //   행동 → 보충(§7) → 10개 검사(→discard phase) → 귀족 판정(단일=자동, 복수=chooseNoble phase)
  //   → 15점 트리거(§8-1) → 라운드 종료 검사(§8-2, §9-I) → gameOver 전이

// ── 지불 판정 (§4.4.1) — 독립 순수 함수, 테이블 주도 테스트 대상 ──
export function canAfford(p: PlayerState, card: Card): boolean;
export function canonicalPayment(p: PlayerState, card: Card): TokenMap;  // 보석 우선, 황금 최후
export function isValidPayment(p: PlayerState, card: Card, pay: TokenMap): boolean;

// ── UI 보조 순수 함수 (engine/helpers.ts — 설계안 1에서 채택, 룰 지식은 엔진에만) ──
export function paymentBounds(s: GameState, player: number, cardId: CardId): {
  affordable: boolean; need: GemMap; minGold: number; goldFlexibleColors: readonly GemColor[];
};                                          // PaymentModal 데이터 소스 (§9-L)
export function excessTokens(p: PlayerState): number;                     // §5
export function canReserve(s: GameState, player: number): boolean;        // §9-D
export function eligibleNobles(bonuses: GemMap, nobleIds: readonly NobleId[]): readonly NobleId[];

// ── 관측·직렬화·리플레이 ──
export function playerView(state: GameState, player: number): GameState;
  // 타인의 fromDeck 예약 카드 → { cardId: HIDDEN_CARD, fromDeck: true }, 덱 내용 → 길이만 유지.
  // AI에는 항상 이것만 전달 — "AI가 덱을 훔쳐본다" 버그를 구조적으로 차단 (§9-O)
export function serialize(state: GameState): string;
export function deserialize(json: string): GameState;
export function hashState(state: GameState): string;        // FNV-1a — 골든 리플레이 비교
export function replay(config: GameConfig, actions: readonly Action[]): GameState;
```

**phase 분리 근거(유지)**: "3개 집기 × 반납 조합"을 원자 액션으로 두면 합법 수가 곱으로 폭발한다. 분리하면 (a) 각 phase의 열거가 작아 완전 열거가 가능해지고(→ 결함 1 해결의 전제), (b) UI 모달과 1:1 대응하고, (c) 독립 단위 테스트가 가능하다. 귀족이 정확히 1장 충족이면 엔진이 자동 수여(결정론적이므로 순수성 무손상), `chooseNoble`은 복수 충족 시에만 발생한다.

### 3.1 RNG

```ts
// engine/rng.ts — splitmix32, 의존성 0
export type RngState = number;
export function createRng(seed: number): RngState;
export function nextInt(rng: RngState, bound: number): readonly [number, RngState];
export function shuffle<T>(rng: RngState, xs: readonly T[]): readonly [readonly T[], RngState];
```

RNG는 `setupGame`에서만 소비된다(덱 3벌·귀족 셔플, 선 추첨). 이후 게임 진행 전체가 `(config, actions[])`만으로 결정적 — undo·이어하기·리플레이·버그 재현의 공통 기반. AI의 softmax·determinize는 **별도 시드**를 받아 게임 시드를 오염시키지 않는다.

---

## 4. UI 상태 관리 — Zustand 단일 스토어

엔진이 이미 리듀서이므로 Redux는 이중 포장이다. Zustand는 셀렉터 구독으로 카드 90장 렌더의 불필요 리렌더를 막고(불변 상태 + 구조적 공유와 시너지), Worker 응답 같은 React 생명주기 밖 합류가 자연스럽다.

```ts
// store/gameStore.ts
interface GameStore {
  // ── 진실: actionLog가 단일 진실원. committed/snapshots는 파생 캐시 ──
  committed: GameState | null;
  actionLog: Action[];               // 불변식: committed === replay(config, actionLog)
  snapshots: GameState[];            // actionLog.length+1개 (구조적 공유라 저렴) — undo O(1)
  eventFeed: GameEvent[];            // 로그·낭독 소비 누적

  // ── UI 전용 임시 상태 (엔진 상태와 절대 혼합 금지) ──
  pendingPicks: GemColor[];          // 토큰 집기 조립 중
  selectedCard: CardId | null;
  handoffPending: boolean;           // 핫시트 기기 전달 대기
  aiThinking: boolean;

  // ── 명령: 상태 변경의 유일한 통로 ──
  dispatch(action: Action): void;    // validateAction → applyAction → log/snapshot/eventFeed 갱신
                                     // → 저장 → 다음 차례 라우팅(AI면 Worker, 사람이면 handoff)
  undo(): void;                      // 정책은 §4.2
  newGame(config: GameConfig): void;
  loadSaved(): boolean;              // persistence.ts 경유
}
```

**경계 규약 (설계안 0 유지 + 설계안 1의 규율 채택)**
1. UI는 `GameState`를 읽기만 한다. 버튼 활성화조차 `isLegal`/`legalActions`/`helpers.ts` 호출 결과다. **컴포넌트에 `if (supply[c] >= 4)` 같은 룰 리터럴이 등장하면 코드리뷰 반려.**
2. `dispatch`가 적용 후 `phase`·`currentPlayer`를 보고 라우팅: 다음이 AI면 `playerView`를 Worker로, 사람→사람이면 `handoffPending` 세팅.
3. UI에는 draftMachine 같은 별도 상태기계를 두지 않는다(설계안 1의 최대 리스크 회피). 중간 조립 상태는 `pendingPicks` 등 최소한의 필드 + 매 조작마다 `isLegal` 재검증으로 처리 — 룰의 두 번째 표현을 만들지 않는다.

### 4.1 저장/이어하기 — 버전 태그 포맷 [결함 5 해결]

```ts
// store/persistence.ts
export interface SaveFileV1 {
  schemaVersion: 1;                  // 세이브 포맷 자체의 버전 (마이그레이터 체인 키)
  rulesVersion: string;              // 엔진 룰 해석 개정 시 수동 증가 (예: '1.0.0')
  dataChecksum: string;              // cards.ts + nobles.ts 내용 해시 (빌드 시 산출)
  config: GameConfig;
  actions: Action[];
  finalHash: string;                 // 저장 시점 hashState — 로드 검증용
  savedAt: number;
}
```

로드 절차: ① `schemaVersion` 상이 → 마이그레이터 체인 적용(없으면 폐기 안내). ② `rulesVersion`/`dataChecksum` 상이 → **검증 리플레이**: 매 액션 `validateAction` 통과 + 최종 `hashState === finalHash` 확인. ③ 통과하면 그대로 복원, 실패하면 "이전 버전에서 저장된 게임이라 이어할 수 없습니다" 안내 후 사용자가 폐기/새 게임 선택. 액션 로그 저장 방식의 장점(엔진 버전과 함께 검증됨)을 유지하면서 조용한 깨짐을 차단한다.

### 4.2 되돌리기 정책 (설계안 1 채택, 이중 진실원 문제 해소)

- **vs AI**: 내 직전 결정 시점까지 무제한 undo(중간 AI 턴 포함 롤백). `undo()`는 `actionLog`를 목표 인덱스까지 pop하고 `committed = snapshots[목표]`로 복원 — **log가 단일 진실원이므로 pop은 log에만 일어나고 snapshot은 캐시 무효화**일 뿐이다. 프로퍼티 테스트로 "undo 후에도 `committed === replay(config, actionLog)`" 불변식을 고정한다(설계안 1의 이중 진실원 지적 해소).
- **핫시트**: 자기 턴 내 커밋 전 취소만 무료(pendingPicks 초기화). 커밋 후 undo는 기본 비활성(비공개 예약 정보 노출·분쟁 방지). 설정 토글("전원 합의 자유 undo")은 후순위 옵션.

---

## 5. 컴포넌트 트리와 인터랙션 흐름

```
<App>
 ├─ <SetupScreen>              # 인원 2~4, 좌석별 [사람|AI 쉬움/보통/어려움], 이름, (선택) 시드
 ├─ <GameScreen>
 │   ├─ <TurnBanner>           # "김철수님의 차례" / finalRound 시 "마지막 라운드!" 경고
 │   ├─ <NobleRow>             # 귀족 (인원+1장, 감소만)
 │   ├─ <CardBoard>            # 티어 3→2→1
 │   │   └─ <DeckPile 잔량뱃지> + <CardView>×4    # 빈자리 = 점선 슬롯 (§7)
 │   ├─ <TokenSupply>          # 6색 더미 + 잔량. 클릭 토글, 불가 더미는 반투명+사유 툴팁
 │   ├─ <PlayerPanel>×N        # 점수/토큰/보너스/예약 수/귀족 — 공개 정보 (§9-O)
 │   │   └─ <ReservedHand>     # 현재 사람 차례의 본인 것만 앞면, 타인 fromDeck 카드는 뒷면
 │   ├─ <ActionBar>            # 선택 요약 + [확정]/[취소]. legalActions/isLegal 기반 활성화
 │   ├─ <GameLog>              # eventFeed → describeEvent() 한국어 서술 ("김철수: 사파이어 2개 획득")
 │   ├─ <Announcer>            # aria-live="polite", 같은 eventFeed 소비 (설계안 1 채택, 저비용)
 │   ├─ <AiThinkingIndicator>  # AI 사고 중 표시
 │   └─ 모달 레이어
 │       ├─ <DiscardModal>       # phase=discard 강제 오픈 (닫기 불가)
 │       ├─ <NobleChoiceModal>   # phase=chooseNoble 강제 오픈 (닫기 버튼 없음 — 거부 불가 룰의 표현)
 │       ├─ <PaymentModal>       # 황금 배분 조정 (§9-L) — paymentBounds 데이터 소스
 │       └─ <HandoffOverlay>     # 핫시트 기기 전달
 └─ <ResultScreen>             # 순위·점수·구매 수·동점 판정 근거("구매 카드 수 적음")·공동 승리
```

**핵심 흐름** — 공통 패턴: *UI가 후보 액션 조립 → `isLegal` 실시간 검증 → 확정 시 `dispatch`*.

- **토큰 집기**: 더미 클릭 → `pendingPicks` 누적. 같은 색 2회 클릭은 `TAKE_SAME` 해석(해당 색 4개 미만이면 두 번째 클릭 자체가 §4.2 사유와 함께 거절 토스트). 매 클릭 후 `isLegal`로 나머지 더미의 활성/비활성 갱신 — 불법 조합은 만들 수 없다. 남은 색이 2색 이하면 확정 버튼이 "2개 가져오기"로 자동 축소(§9-A, §4.1 엄격 해석). 조립 중 토큰 재클릭 = 되돌려놓기(커밋 전 무료 취소).
- **카드 구매/예약**: 카드 클릭 → 팝오버에 [구매]/[예약]. 활성 여부는 `canAfford`/`canReserve`, 비활성 사유는 `validateAction`의 §번호 툴팁("예약 카드가 이미 3장입니다 — §4.3"). 구매는 `canonicalPayment` 기본값 즉시 진행, `paymentBounds().minGold < 보유 황금`이며 대체 가능 색이 있을 때만 [지불 조정] 버튼 노출 → PaymentModal(§9-L). 무료 구매(실지불 0)는 모달 생략. 덱 더미 클릭 = 비공개 예약(덱 소진 시 비활성 §9-E, 황금 없으면 "황금 없이 예약" 안내 §9-F).
- **반납**: `phase.kind==='discard'` 진입 즉시 DiscardModal 강제 오픈. 보유 토큰 클릭으로 `mustDiscard`개 채우면 확정 활성화. 방금 받은 황금 반납도 그대로 가능(§9-H — 엔진이 출처를 구분하지 않으므로 자동 충족).
- **귀족**: 단일 충족은 자동 수여(`nobleVisited{auto:true}` 이벤트 → 배너+로그), 복수 충족만 NobleChoiceModal(각 타일에 충족 내역 표시).
- **핫시트 핸드오프**: 사람→사람 전환 시 HandoffOverlay. **오버레이 표시 중 화면은 `playerView(state, 다음 플레이어)` 기준으로 렌더** — 이전 플레이어의 비공개 예약 정보가 DOM에서 제거된다(설계안 1 채택). 단, 설계안 1의 "샘플 카드로 채워 렌더"는 가짜 정보 노출 리스크가 있으므로 쓰지 않고 **뒷면 표시**로 통일한다. 사람↔AI 전환에는 오버레이 없음.
- **AI 턴**: 입력 전체 잠금 → 인디케이터 → 수 도착 시 이벤트 스트림을 사람 턴과 동일 경로로 로그·낭독·(후순위) 연출 재생.

**애니메이션(후순위, M8)**: `GameEvent`가 1급 시민이므로 diff 역산이 불필요하다. 이벤트→연출 매핑(토큰 비행, 카드 보충 뒤집기)을 얇은 소비자로 추가하며, `prefers-reduced-motion`이면 연출 큐를 즉시 플러시(= 연출 없는 현재 경로가 곧 테스트 경로). 수제 FLIP 대신 CSS transition + WAAPI 최소 구성.

---

## 6. 테스트 전략 (Vitest + fast-check)

**원칙**: 룰 문서의 모든 §조항과 경계 사례 A~O에 1개 이상의 테스트가 대응하고, 테스트 타이틀에 §태그를 넣는다. 예: `it('§9-C: 3개 남은 더미에서 같은 색 2개 집기는 거부된다', ...)`.

1. **데이터 검증** (`tests/data/`): 카드 90장(40/30/20), 티어·색별 분포, 비용 총합, 귀족 10장 전원 3점 — 원작 데이터의 통계적 지문을 고정값+스냅샷 해시로. 데이터 오타는 룰 버그와 동급.
2. **룰 단위 테스트** (`tests/engine/`): 조항별 예제 기반. `payment.test.ts`는 §4.4.1을 (보너스×보유 보석×황금×비용) 테이블 주도 수십 케이스로. `endgame.test.ts`는 §9-I 세 시나리오(선/중간/막차가 트리거)를 액션 열로 재현. §9 A~O 각 1개 이상.
3. **프로퍼티 테스트** (fast-check): 무작위 시드 + `legalActions`에서 무작위 선택으로 완주하며 매 스텝 검증 —
   - 보존: 색별 (공급처+전원) 토큰 = 초기 총량 / 카드 90장 분할 보존(덱+보드+구매+예약) / 음수 없음
   - 파생값: `bonuses`·`prestige` 캐시 = `purchased` 재계산값
   - **완전성(전 phase)**: `phase≠gameOver ⇒ legalActions ≥ 1` / 반환 액션 전부 throw 없이 적용 / `isLegal=false`는 반드시 throw — **discard·chooseNoble phase 포함** [결함 1 검증]
   - 불변성: 적용 전 상태 해시가 적용 후에도 불변 (dev deep-freeze와 이중 방어)
   - 결정론: 같은 (seed, actions) → `hashState` 동일
   - 종결성: 랜덤 에이전트 1,000판 전부 정상 종료
   - 턴 종료 시 전원 토큰 ≤ 10, 예약 ≤ 3, 귀족은 감소만
   - undo 정합: 임의 시점 undo 후 `committed === replay(config, actionLog)` (store 계층 테스트)
4. **골든 리플레이**: `(config, actions[], 중간 체크포인트 해시, 최종 해시)` JSON. **버그 발견 시 재현 액션 열을 리플레이로 추가하는 것이 픽스의 필수 절차.**
5. **AI 테스트**: 하드가드(즉승 수 항상 선택) / determinize가 마스킹 외 정보를 변경하지 않음 / **policy-consistency**: `discardPolicy`·`noblePolicy` 출력이 `legalActions` 원소이고, 탐색 내 autoResolve와 실전 phase 응답이 동일 함수임을 검증(설계안 2 채택) / legality fuzz: 난이도×극단 상태 수천 국면에서 항상 합법 수 반환.
6. **UI 테스트 최소화** (Testing Library 스모크 8~10개): 반납 모달 확정 조건, 귀족 모달 강제, 토큰 불법 조합 거절 등. 룰이 UI에 없으므로 UI 테스트가 룰을 짊어지지 않는다.
7. **커버리지 게이트** [결함 4 해결]: M1~M3 동안은 게이트 없음(속도 우선). **M3 완료 후부터** `engine/` 한정 라인 95% / 브랜치 90%를 PR 게이트로. `docs/rules-mapping.md`는 `scripts/gen-rules-mapping.ts`가 테스트 타이틀 §태그를 수집해 자동 생성하고 CI가 stale 여부만 검사한다 — 수동 문서 유지비 0.
8. **arena** [결함 4 해결]: `tests/ai/arena.selfplay.test.ts`(SELFPLAY=1 가드, Node)로 로컬 실행이 기본 — 별도 `scripts/selfplay.ts` 대신 아레나 테스트로 구현(이슈 #3). CI는 **주 1회**(`ai-arena.yml`), 어려움 예산 500ms 축소·인접쌍 200판, 비차단. (당초 150ms 계획은 M6 실측으로 폐기 — 150ms에서는 어려움>보통 58%로 서열 검증이 안 된다. AI_DESIGN §6.1 M6 기록.)

---

## 7. 잔존 트레이드오프 (인지하고 수용하는 것)

1. **핫시트 치팅 한계**: 백엔드가 없으므로 전체 상태가 메모리·localStorage에 존재. DevTools 치팅 가능 — 로컬 플레이 전제에서 수용. `playerView`는 렌더/AI 경계이지 보안 경계가 아니다.
2. **[구현 결정]의 엔진 고착**: 단일 귀족 자동 수여, 집기 강제 축소 등이 하드코딩. 변형 룰이 필요해지면 `GameConfig`에 플래그를 추가하는 리팩토링 여지를 남긴다(현재는 YAGNI).
3. **PaymentModal의 자유도 비용**: §9-L 충실도의 대가. canonical 기본값 즉시 진행으로 대부분의 사용자는 모달을 보지 않는다.
4. **AI 탐색 성능**: 최종 방어선까지 포함한 계획은 AI_DESIGN.md §5. 이중 엔진은 측정 게이트를 통과한 뒤에만 진입한다.