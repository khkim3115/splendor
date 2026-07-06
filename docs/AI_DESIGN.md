# AI_DESIGN.md — 스플랜더 AI 설계 (쉬움 / 보통 / 어려움)

> **전제**: AI는 엔진의 또 다른 클라이언트다. `engine/` 공개 API만 사용하고, 항상 `playerView()`로 마스킹된 상태만 받는다(덱·타인 비공개 예약 열람 불가를 구조적으로 보장). 모든 무작위성(softmax, determinize)은 호출 측이 주입한 시드 RNG를 사용한다 — `Math.random` 금지, 같은 입력이면 같은 수.

---

## 1. 공통 인터페이스와 계약

```ts
// ai/types.ts
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface AIAgent {
  /** view = playerView() 결과. phase가 play/discard/chooseNoble 무엇이든
   *  해당 phase의 합법 액션(= legalActions(view)의 원소)을 반환해야 한다. */
  chooseAction(view: GameState, me: number, rng: RngState, budgetMs: number): [Action, RngState];
}
```

**계약 (테스트로 고정)**
- 반환 액션은 반드시 `legalActions(view)`의 원소다. ARCHITECTURE.md 결함 1 해결에 따라 `legalActions`는 discard/chooseNoble phase에서도 완전 열거하므로, **모든 phase에서 표준 API로 후보를 얻을 수 있다** — 인터페이스 우회 없음.
- discard/chooseNoble phase에서는 탐색하지 않고 `ai/policies.ts`의 결정적 정책 함수로 즉답한다(§4.3). 이 함수는 탐색 내부의 자동 해소(autoResolve)와 **동일한 함수**다 — "탐색이 가정한 반납"과 "실제 반납"의 불일치는 곧 강함 손실이므로, policy-consistency 테스트로 동일성을 고정한다(설계안 2 채택).
- 시간 예산 초과 금지: anytime 구조로 예산 내 최선수를 항상 보유한다.

---

## 2. 평가함수 (ai/evaluate.ts)

가중합 선형 모델 2벌. 가중치는 상수 테이블로 분리하고 `scripts/selfplay.ts` 자가대전으로 튜닝한다(초기값 수동 → 지역 탐색). 다인전 스칼라화는 `내 평가치 − max(상대 평가치)` (paranoid-lite).

| 특징 | 방향/비고 | simple (쉬움) | full (보통/어려움) |
|---|---|---|---|
| 명성점 | **지배적 가중치**. 15점 도달 상태는 +무한대 취급 | O | O |
| 승리 임박도 | finalRound에서 내 순번이 남았는지 반영 | — | O |
| 보너스 수 | 색별 체감(같은 색 4개 초과분 가중치 절반) — 엔진 겸용 화폐 | — | O |
| 토큰 자원 | 완만한 +. 황금 ×1.5, 합계 10 근접 시 페널티 | O | O |
| 구매 거리 | 공개+내 예약 카드 각각에 대해 "부족 젬 수"의 점수 가중 최소값. 가까울수록 + | O (공개만, 점수 가중 없음) | O |
| 귀족 진행도 | 최근접 귀족까지 부족 보너스 수. 적을수록 + (3점 가치 반영) | — | O |
| 예약 카드 가치 | 예약 슬롯의 기대 가치 +. 단, 3장 잠금은 소폭 − | — | O |
| 상대 위협 | 상대 최고 평가치, 상대의 귀족/15점 근접에 − | — | **hard만** |

- 쉬움의 simple 프로파일은 의도적으로 **귀족·예약·상대를 보지 못한다** — "일부러 못 두는 AI"가 아니라 "시야가 좁은 초보"를 만든다.
- 구현 규율: 평가함수는 할당 최소화(임시 객체 대신 지역 숫자 변수), `GEM_COLORS` 고정 순회. 프로파일 차이는 가중치 0 처리로 코드 경로를 하나로 유지한다.

---

## 3. 난이도 3단계 — "평가 × 탐색 × 선택" 3축 차별화

| | 탐색 | 평가 | 선택 | 예산 |
|---|---|---|---|---|
| **쉬움** | 그리디 1-ply | simple | softmax T=1.5~2.0, **상위 4수 제한** | <5ms |
| **보통** | 2-ply (내 수 → 상대 그리디 응수 1수 가정) | full | softmax T=0.4~0.5, 상위 3수 | <30ms |
| **어려움** | anytime MCTS (§4) | full | argmax (최다 방문, 무작위성 없음) | 벽시계 1,000ms |

- 상위 k 제한 softmax가 핵심: 쉬움도 **최악수가 아닌 "그럴듯한 차선"**을 둔다. 난이도는 실수의 빈도가 아니라 시야의 깊이·폭으로 갈린다.
- 보통의 2-ply는 연구 결과(계획 길이 2수로 충분) 채택 — 쉬움과 어려움 사이의 자연스러운 간극을 만든다.
- **마스킹 열화 방지**: 마스킹 상태(playerView)에 수를 적용하면 덱 보충·덱 예약이 HIDDEN_CARD(-1)로 유입되어, 탐색 안에서 "덱 예약 → 그 카드 구매" 가지가 소멸하고 보충 카드의 가치가 0으로 평가된다. 따라서 **보통(2-ply) 이상은 탐색 전에 determinize를 1회 적용**한다(§4.2와 동일 — 그리디 1-ply는 수 적용 전 평가라 불필요). 엔진의 legalActions/hasAnyLegalPlayAction은 HIDDEN 유입 국면에서도 크래시 없이 동작하도록 방어되어 있다(회귀: tests/engine/robustness.test.ts).
- **전 난이도 공통 하드가드** (`ai/guards.ts`, 탐색 이전에 적용):
  1. 즉시 15점 이상을 확정하는 구매가 있으면 무조건 수행.
  2. 실지불 0(전액 보너스 커버) 구매 중 평가 손해 없는 최고점 카드는 쉬움도 놓치지 않는다.
  - 목적: "고장난 AI" 인상 방지. 가드 발동 조건과 우선순위는 단위 테스트로 고정.
- **체감 지연**: 실제 계산이 몇 ms여도 클라이언트가 최소 500~800ms "고민" 연출 후 착수(설계안 1 채택). 어려움은 계산 시간 자체가 연출이 된다.

---

## 4. 어려움: anytime MCTS 상세 (ai/mcts.ts)

### 4.1 골격

```ts
export function mctsChoose(view: GameState, me: number, budgetMs: number, rng: RngState): [Action, RngState] {
  const [root, rng2] = determinize(view, rng);   // ① 결정화 1회 (§4.2)
  const deadline = now() + budgetMs;
  let iters = 0;
  while (true) {
    if ((iters & 15) === 0 && now() >= deadline) break;   // 시간 체크는 16회마다 (M6 실측 조정: 원안 128은 sim 단가 ~1ms에서 예산 대비 2~5배 오버슈트 — now() 단가가 무시 가능해 하향)
    let s = root, node = tree.root;
    // ② 선택/확장: 트리 하강은 applyResolved(§4.3) — play 액션만 엣지가 된다
    // ③ 플레이아웃: 그리디 정책(evaluate full의 1-ply)으로 깊이 10 truncate
    // ④ 백업: evaluateFull을 플레이어별로 계산해 max-n 백업 (다인전 자연 확장)
    iters++;
  }
  return [bestByVisits(tree), rng2];   // anytime: 언제 끊겨도 현재 최선수 존재
}
```

- UCB 탐험 상수는 0.1~0.3에서 시작해 자가대전으로 **하향** 탐색(선행 연구에서 0에 가까운 값이 최적).
- 다인전: 각 노드는 해당 차례 플레이어 관점을 최대화(max-n). minimax 분기를 별도로 만들지 않는다.
- 상대 모델링은 플레이아웃의 그리디 정책으로 충분(정교한 모델이 역효과라는 실험 결과 반영).

### 4.2 히든 정보 — determinize 1회

Worker 수신 즉시 `determinize(view, seed)`: 마스킹된 덱 구간과 타인의 `HIDDEN_CARD` 예약 슬롯을 "아직 관측되지 않은 카드 풀"에서 시드 셔플로 1회 결정화해 완전정보처럼 탐색한다. 찬스 노드(구매/예약 후 덱 보충)는 결정화된 덱 순서를 그대로 쓰므로 자식 1개 샘플로 자연 처리된다.
- 편향 인지: AI가 샘플 카드를 "아는 것처럼" 행동할 수 있으나 스플랜더의 히든 정보량이 작아 실전 영향 미미. 멀티 결정화(4회 샘플 투표)는 예산 1/4 분할 비용 때문에 채택하지 않는다(추후 실험 여지만 남김).
- 테스트: determinize가 마스킹된 정보 **외에는 아무것도** 변경하지 않음을 단위 테스트로 고정.

### 4.3 phase 붕괴 — applyResolved 래퍼 (심사 지적 3의 "중간 노드" 해결)

탐색 트리에 discard/chooseNoble 중간 노드가 끼면 깊이가 낭비된다. `ai/search.ts`의 `applyResolved`가 이를 붕괴시킨다:

```ts
// ai/search.ts — 엔진 이중화가 아니라 공개 API의 "합성"이다
export function applyResolved(s: GameState, a: Action): GameState {
  let cur = applyAction(s, a).state;
  while (cur.phase.kind === 'discard' || cur.phase.kind === 'chooseNoble') {
    const auto = cur.phase.kind === 'discard'
      ? discardPolicy(cur, cur.currentPlayer)     // ai/policies.ts
      : noblePolicy(cur, cur.currentPlayer);
    cur = applyAction(cur, auto).state;
  }
  return cur;
}
```

- `discardPolicy`: 평가함수상 가치 최저 색부터 반납하는 **결정적** 조합 1개 생성. `noblePolicy`: 즉시 가치 최대 귀족.
- **policy-consistency 계약**: AI가 실전에서 discard/chooseNoble phase 요청을 받으면 **같은 정책 함수로 즉답**한다. `tests/ai/policyConsistency.test.ts`가 (a) 정책 출력이 `legalActions` 원소임 (b) 탐색용과 실전용이 동일 함수 참조임을 검증(설계안 2의 핵심 통찰 채택).
- 한계 인지: 정규화된 반납은 "3개 집고 특정 3색 반납" 같은 토큰 스왑 전술의 희귀 최적해를 배제한다. `moveGen.compositeMoves`가 대표적 스왑 패턴 소수를 루트 후보에 추가해 보완하되, 완전하지 않음을 문서화한다. 사람 플레이어는 제약 없음.

### 4.4 탐색 성능 — 측정 우선 + 4단계 에스컬레이션 사다리 (심사 지적 3 해결)

**목표를 상향하고 층계를 명문화한다**: 데스크톱 기준 1초당 시뮬레이션 **목표 2,000회, 수용 하한 800회**. `scripts/bench.ts`가 apply 단가·clone 단가·시뮬레이션/초를 출력하고, ROADMAP M6 초입에 측정한다.

| 단계 | 내용 | 원칙 비용 |
|---|---|---|
| **L0 (처음부터 적용)** | Worker 프로덕션 번들에서 deep-freeze 제거(dev 전용 가드) · 핫패스에서 `hashState` 미호출 · 평가/후보 생성에서 임시 객체 대신 지역 변수 · `TokenMap` 스프레드 대신 필요한 키만 갱신하는 헬퍼 | 0 (스타일 수준) |
| **L1 (하한 미달 시)** | 확장 시 평가함수 상위 k 후보만 자식으로 전개(전수 대신 프루닝) · 플레이아웃 깊이 10→6 축소 · `TAKE_DIFFERENT` 조합을 구매 거리 기여 색 우선으로 절반 프루닝 | 0 (탐색 품질 소폭 교환) |
| **L2 (L1로도 미달 시)** | 어려움 알고리즘을 **3-ply max-n(paranoid) + 무브 오더링 + 얕은 전방 프루닝**으로 교체. 깊이 3 전개는 수만 apply 수준이라 불변 엔진 그대로 성립. `AIAgent` 인터페이스 뒤에 숨어 UI/Worker 무변경 | 0 (알고리즘 교체일 뿐) |
| **L3 (최후 수단, 명시적 게이트)** | Worker 전용 뮤터블 sim 코어 추가. **진입 게이트**: L2 적용 후에도 어려움→보통 자가대전 승률 65% 미만일 때만. 필수 안전망: 무작위 10만 스텝에서 순수 엔진과 상태 해시 일치하는 차등(differential) 테스트를 CI 게이트로 | 있음 (룰 이중 구현 — 그래서 최후) |

**중요**: L2까지는 단일 엔진 원칙이 전혀 훼손되지 않는다. "어려움은 실제로 잘 둬야 함" 요구는 L2의 3-ply 탐색만으로도 그리디 대비 확실한 우위가 성립하므로(선행 연구: 계획 길이 2~3이면 강함), L3에 도달할 확률 자체가 낮다. 이 사다리의 존재가 "미달 시 설계 원칙 붕괴"라는 단일 실패점을 제거한다.

**M6 측정 기록 (2026-07, `scripts/bench.ts`, 데스크톱)**: 단가 — applyAction 1.1µs · applyResolved(phase 붕괴 포함) 33µs · legalActions 4.2µs · evaluate(full) 5.4µs. 시뮬레이션/초 — **L0(깊이 10, 프루닝 없음) 655 → 하한 미달**, **L1(깊이 6 + TAKE 프루닝) 1,215 → 수용**(목표 2,000에는 미달). **판정: L1 채택** — `ai/mcts.ts`의 `MCTS_TUNING` 기본값(playoutDepth 6, prunePlayoutTakes true)으로 고정. L2 불필요. 시간 체크 간격은 원안 128회 → 16회로 하향(§4.1 — sim 단가 ~1ms에서 128 간격은 예산 대비 2~5배 오버슈트).

---

## 5. Web Worker 통합

### 5.1 구조

- **Worker 1개** (턴제라 동시 요청 없음). `engine/`·`ai/`가 DOM 무의존 순수 모듈이므로 **코드 수정 0줄로** Worker에서 import — 엔진 순수성의 직접 배당금. Worker 번들에는 React가 포함되지 않는다.
- Vite: `new Worker(new URL('../ai/worker.ts', import.meta.url), { type: 'module' })`. GitHub Pages base 경로와의 조합은 M5에서 배포 스모크로 검증(구형 Safari 대응은 빌드 타깃 확인 항목).
- **쉬움/보통도 동일 Worker 경로** — 코드 경로 1개 = 테스트 표면 1개.

### 5.2 프로토콜

```ts
// 메인 → Worker
export type AiRequest = {
  id: number;
  stateJson: string;          // serialize(playerView(state, me)) — 마스킹 완료본만 전달
  me: number;
  difficulty: Difficulty;
  budgetMs: number;
  aiSeed: number;             // softmax/determinize 전용 시드 (게임 시드와 분리)
};
// Worker → 메인
export type AiResponse = {
  id: number;
  actionJson: string;
  stats: { elapsedMs: number; algo: 'greedy1' | 'greedy2' | 'mcts' | 'fallback'; iters?: number };
  // iters는 mcts 전용. 'maxn3'은 §4.4 L2 채택 시에만 추가(M6 판정: L1로 충분해 미도입).
};
```

- 요청 `id` 매칭으로 늦게 도착한 응답(undo 후 등)은 폐기.
- 상태 전달은 JSON 직렬화로 시작한다(상태가 작아 ~ms). 계측상 병목이면 structured clone 직접 전달로 전환(직렬화 함수는 이미 분리돼 있음).

### 5.3 견고성 — 그리디 타임아웃 폴백 (설계안 2 채택)

`ai/client.ts`가 `budgetMs + 500ms` 하드 타임아웃을 건다. 초과(Worker 크래시·로드 실패 포함) 시 **메인 스레드에서 동일 코드의 그리디 1-ply를 즉시 실행**해 수를 확정한다(<5ms) — 게임이 어떤 상황에서도 멈추지 않는다. 폴백 발생은 콘솔 경고 + `stats.algo`로 기록해 회귀를 추적한다.

### 5.4 시간 예산 요약

| 난이도 | 계산 예산 | UX 최소 지연 | 하드 타임아웃 |
|---|---|---|---|
| 쉬움 | <5ms | 500ms | 예산+500ms → 그리디 폴백 |
| 보통 | <30ms | 600ms | 동일 |
| 어려움 | 1,000ms (anytime) | 없음 (계산 자체가 연출) | 1,500ms → 그리디 폴백 |

- 저사양 기기 옵션(후순위): 첫 로드 시 마이크로 벤치 1회로 어려움 예산을 1.5~2초 자동 상향.

---

## 6. 난이도 차별화 검증

### 6.1 자가대전 매트릭스

- 도구: `scripts/selfplay.ts` (Node, 브라우저 불필요 — 엔진·AI가 순수 모듈이라 그대로 구동).
- 기준: 인접 난이도 간 상위 승률 **65~80%** (2인전 200판, 선후공 교대). 65% 미만이면 차별화 실패 → 온도/깊이/예산 조정. 80% 초과면 간극 과대 → 하위 난이도 상향.
- **M5 측정 기록 (2026-07, 200판)**: 보통 > 쉬움 **86.4%** (T=1.8; T=1.2에서도 88.9%로 온도는 지배 변수가 아님 — 격차는 simple/full 시야 차이가 지배). 리뷰 확정 결함 수정(가드 평가 손해 검사, 반납/귀족 정책 평가 argmax 전환, 승리 임박도 구현) 후 재측정 **88.0%**. DoD(≥65%)는 통과, 밴드 상한(80%)은 소폭 초과. 쉬움을 밴드 안으로 올리려면 simple 프로파일 조정(보너스 소량 반영 등)이 필요한데 이는 "시야가 좁은 초보" 콘셉트와 상충하므로, **M6에서 어려움 추가 시 3단계 서열을 함께 재측정·재조정**하기로 결정.
- **M6 측정 기록 (2026-07, `scripts/selfplay.ts`, 200판·선후공 교대·hard 예산 150ms·시드 9000)**: 어려움 > 보통 **70.2%** (139/198, 무승부 2, 평균 60.1턴, hard 평균 1,951 sim/수) — **밴드(65~80%) 내, DoD 통과**. 보통 > 쉬움 재측정 **89.0%** — M5와 동일 수준의 상한 초과. 쉬움 상향은 콘셉트 상충(M5 기록 참조)이므로 **조정하지 않고 유지**한다 — 3단계 서열(어려움>보통>쉬움)은 성립. 3~4인 혼합 스모크 **50/50판 정상 종료**, 난이도별 승수(공동 승리 포함) hard 26 / normal 23 / easy 1 — 다인전에서도 서열 유지.
- 3~4인전 스모크(혼합 난이도 50판)로 다인전 붕괴 여부만 확인.
- **CI 정책** (심사 지적 4 반영): PR 게이트 아님. `ai-arena.yml` **주 1회**, 어려움 예산 150ms로 축소 실행(절대 강도는 낮아지지만 서열 검증에는 충분). 추정 실행시간 60~70분 — Actions 한도 내. 정밀 측정(1,000ms 예산)은 로컬 실행이 기본.

### 6.2 체감 차별화 요약

- **쉬움**: 좁은 시야(simple 평가) + 높은 온도 → 귀족을 무시하고 눈앞의 카드를 산다. 초보가 이긴다.
- **보통**: 전체 시야 + 2수 계획 → 귀족 경주와 예약 견제를 한다. 캐주얼 플레이어와 백중.
- **어려움**: 1초 탐색 + 상대 위협 특징 → 상대 키 카드 선점 예약, 마지막 라운드 계산이 정확. 하드가드 + argmax로 명백수를 절대 놓치지 않는다.

### 6.3 AI 품질 테스트 (PR 게이트에 포함되는 것)

1. `guards.test.ts`: 즉승 구매가 존재하는 국면 픽스처에서 전 난이도가 그 수를 선택.
2. `policyConsistency.test.ts`: §4.3의 계약.
3. `legalityFuzz.test.ts`: 난이도×극단 상태(공급 고갈, 덱 소진, 교착 직전, discard/chooseNoble phase) 수천 국면에서 항상 `legalActions` 원소를 반환하고 예산을 넘지 않음.
4. determinize 마스킹 보존 테스트.