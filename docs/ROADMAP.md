# ROADMAP.md — 구현 마일스톤

> 각 마일스톤은 독립적으로 커밋·검증 가능한 단위이며, **완료 기준(DoD)** 을 전부 만족해야 다음으로 넘어간다. 순서는 의존성 순이다. 심사 지적(초기 리드타임 과다)을 반영해, 관료적 장치(커버리지 게이트·arena CI)는 뒤로 미루고 "돌아가는 게임"까지의 경로를 최단으로 잡되 엔진-우선 원칙은 유지한다.

---

## M0 — 저장소 골격과 CI 파이프라인

**작업**
- Vite + React 18 + TypeScript(strict, `noUncheckedIndexedAccess`) 프로젝트 생성. `vite.config.ts`에 GitHub Pages base 경로.
- ESLint 경계 규칙: `engine/`·`ai/`에서 `react`/`src/ui`/`src/store` import 금지, 저장소 전체 `Math.random`·`Date.now` 금지(허용 파일 명시).
- Vitest + fast-check 설치. `.github/workflows/ci.yml`: typecheck + lint + test + build.
- 빈 `engine/index.ts`에 더미 함수 1개 + 더미 테스트 1개로 파이프라인 관통 확인.

**DoD**
- [ ] PR 생성 시 CI가 typecheck/lint/test/build를 수행하고 실패 시 머지 차단.
- [ ] `engine/`에 `import React`를 넣으면 lint가 실패한다(실제로 넣어보고 확인 후 되돌림).
- [ ] `npm run build` 산출물이 로컬 프리뷰에서 열린다.

---

## M1 — 게임 데이터 + 타입 + 셋업

**작업**
- `engine/types.ts` 전체 타입(ARCHITECTURE §2 그대로 — `ReservedCard` 구조체 포함, 병렬 배열 금지).
- `engine/data/cards.ts`(90장)·`nobles.ts`(10장): 원작과 동일한 기능 데이터. 입력 후 교차 검수 1회.
- `engine/rng.ts`(splitmix32), `engine/constants.ts`(인원별 토큰/귀족 테이블 §2), `engine/setup.ts`.
- `tests/data/cardData.test.ts`: 90장(40/30/20)·귀족 10장·티어/색별 분포·비용 총합·점수 분포 고정값 + 데이터 스냅샷 해시.
- `tests/engine/setup.test.ts`: §2 — 인원별 토큰 수(4/5/7+황금5), 귀족 인원+1, 티어별 4장 공개, 같은 시드 = 같은 셋업.

**DoD**
- [ ] 데이터 지문 테스트 전체 통과. 카드 데이터의 임의 1장을 수정하면 테스트가 실패한다(변조 검출 확인).
- [ ] `setupGame(같은 config)` 2회 호출 결과가 `hashState` 동일.
- [ ] RNG가 알려진 시드에 대해 고정 수열을 낸다(리그레션 고정).

---## M2 — 엔진 코어: 전이 함수와 룰 전체

**작업**
- `engine/payment.ts`: `canAfford`/`canonicalPayment`/`isValidPayment` (§4.4.1) — 테이블 주도 테스트 먼저 작성.
- `engine/apply.ts`: `applyAction → { state, events }`. 처리 순서 고정: 행동 → 보충(§7) → 10개 검사(§5→discard phase) → 귀족(§6, 단일 자동/복수 chooseNoble) → 15점 트리거 → 라운드 종료(§8, §9-I). dev deep-freeze.
- `engine/events.ts`, `engine/nobles.ts`, `engine/end.ts`(교착 §9-E/G 포함), `engine/legal.ts`의 `validateAction`/`isLegal`(§번호 반환).
- `tests/engine/*`: §4.1/4.2/4.3/4.4/5/6/7/8 + 경계 사례 §9 A~O 각 1개 이상. 테스트 타이틀에 §태그.

**DoD**
- [ ] 룰 문서 모든 §조항과 §9 A~O 각각에 §태그 테스트가 1개 이상 존재하고 전부 통과.
- [ ] `applyAction`이 입력 상태를 변형하지 않음(deep-freeze 하에서 전 테스트 통과).
- [ ] 불법 액션은 §번호가 담긴 `IllegalActionError`를 throw.
- [ ] 모든 `applyAction` 호출이 비어 있지 않은 `events`를 반환하고, 이벤트 순서가 처리 순서와 일치.

---

## M3 — legalActions 완전 열거 + 프로퍼티/골든 테스트 인프라

**작업**
- `engine/legal.ts`의 `legalActions`: **전 phase 완전 열거** — play(PURCHASE는 canonical 1개 대표), discard(반납 조합 전수 ≤56), chooseNoble(≤5), PASS 폴백. [심사 결함 1의 구현 지점]
- `engine/serialize.ts`: `serialize`/`deserialize`/`hashState`/`replay`.
- `engine/helpers.ts`: `paymentBounds`/`excessTokens`/`canReserve`/`eligibleNobles`.
- `tests/properties/invariants.test.ts`: 보존 법칙·파생값 일치·**전 phase 완전성 불변식**·불변성·결정론·종결성(랜덤 1,000판 완주)·토큰≤10·예약≤3.
- 골든 리플레이 인프라(`tests/replays/`) + 랜덤 자가대전에서 첫 리플레이 5개 채집.
- `scripts/gen-rules-mapping.ts`: 테스트 타이틀 §태그 → `docs/rules-mapping.md` 자동 생성, CI stale 검사 추가.
- **이 시점부터** CI에 `engine/` 커버리지 게이트(라인 95%/브랜치 90%) 활성화.

**DoD**
- [ ] 프로퍼티 테스트가 discard/chooseNoble phase를 포함한 전 phase에서 "legalActions ≥ 1개, 전부 적용 가능" 불변식을 통과 (fast-check 실행 수 기본 100회 이상).
- [ ] `replay(config, actions)` 결과가 순차 `applyAction` 결과와 `hashState` 동일.
- [ ] 골든 리플레이 5개가 체크포인트 해시까지 일치.
- [ ] `docs/rules-mapping.md`가 자동 생성되고, 테스트 삭제 시 CI가 stale을 검출.
- [ ] 커버리지 게이트 활성 상태에서 CI 녹색.

---

## M4 — 핫시트 플레이 가능한 UI (첫 번째 "돌아가는 게임")

**작업**
- `store/gameStore.ts`: `dispatch`(검증→적용→log/snapshot/eventFeed) + `actionLog` 단일 진실원.
- `store/persistence.ts`: **버전 태그 세이브 포맷**(schemaVersion/rulesVersion/dataChecksum/finalHash) + 검증 리플레이 로드 + 불일치 시 한국어 안내. [심사 결함 5의 구현 지점]
- SetupScreen(인원/이름/시드 — AI 좌석은 다음 마일스톤에서 활성화), GameScreen 전체 컴포넌트 트리, ResultScreen.
- 인터랙션 흐름: 토큰 집기(pendingPicks + isLegal 실시간), 구매/예약(canonical 즉시 + PaymentModal §9-L), DiscardModal, NobleChoiceModal, HandoffOverlay(**playerView 기준 렌더**).
- GameLog + Announcer: `eventFeed` → `describeEvent()` 한국어 서술.
- `ui/i18n/ko.ts` 문자열 집중, GemIcon 등 CSS/SVG 오리지널 비주얼 최소 버전.
- UI 스모크 테스트 8~10개(Testing Library).

**DoD**
- [ ] 사람 2~4인 핫시트로 셋업→플레이→15점→마지막 라운드→결과 화면까지 마우스만으로 완주 가능.
- [ ] 불법 조작이 UI에서 원천 차단되거나 §번호 사유와 함께 거절된다(토큰 불법 조합, 예약 4장째, 지불 부족 각각 수동 확인).
- [ ] 새로고침 후 "이어하기"로 정확히 같은 상태 복원(hashState 일치). 카드 데이터를 일부러 바꾸면 로드가 거부되고 안내가 뜬다.
- [ ] 핸드오프 오버레이 중 DOM에 타인의 비공개 예약 카드 정보가 존재하지 않는다(DevTools 요소 검사로 확인).
- [ ] 게임 로그가 모든 수를 자연스러운 한국어로 기록.

---

## M5 — AI 쉬움/보통 + Web Worker + 혼합 구성

**작업**
- `ai/evaluate.ts`(simple/full), `ai/policies.ts`(discardPolicy/noblePolicy), `ai/guards.ts`, `ai/greedy.ts`(1-ply/2-ply + 상위 k softmax).
- `ai/worker.ts` + `ai/client.ts`: 프로토콜, 요청 id 매칭, **타임아웃 → 메인스레드 그리디 폴백**, UX 최소 지연.
- 스토어 라우팅: 다음 차례가 AI면 `playerView` 전송 → 응답 dispatch. 사람+AI 혼합·AI만 3명 구성 지원.
- vs AI 모드의 undo(내 직전 결정까지 롤백) — `actionLog` pop + snapshot 복원 + 진행 중 AI 요청 폐기.
- 테스트: `guards.test.ts`, `policyConsistency.test.ts`(정책 출력 ∈ legalActions), `legalityFuzz.test.ts`(수천 국면).

**DoD**
- [ ] 사람 1 + AI(쉬움/보통 혼합) 3인 게임이 개입 없이 정상 완주. AI 3명 자동 게임도 완주.
- [ ] AI 사고 중 UI 프레임이 끊기지 않는다(Worker 경유 확인).
- [ ] Worker를 강제로 죽여도(디버그 훅) 그리디 폴백으로 게임이 계속된다.
- [ ] AI legality fuzz·policy-consistency·가드 테스트가 CI 게이트에 포함되어 통과.
- [ ] undo 후 `committed === replay(config, actionLog)` 프로퍼티 테스트 통과.
- [ ] 자가대전 스크립트 초안으로 보통 > 쉬움 승률 65% 이상 확인(로컬 200판).

---

## M6 — AI 어려움 (MCTS) + 성능 측정과 에스컬레이션 판정

**작업**
- `scripts/bench.ts` **먼저**: apply 단가·시뮬레이션/초 측정. 수용 하한(800 sim/s) 판정 → AI_DESIGN §4.4 사다리(L0은 즉시 적용, L1/L2는 필요 시)를 여기서 결정하고 결과를 커밋 메시지에 기록.
- `ai/moveGen.ts`(determinize, compositeMoves), `ai/search.ts`(applyResolved), `ai/mcts.ts`(anytime, 128회 간격 시간 체크, max-n 백업).
- `scripts/selfplay.ts` 완성: 난이도 매트릭스, 승률·평균 턴 수 리포트.
- determinize 마스킹 보존 테스트.

**이월·대체 기록 (M6 종료 시점)**
- 벤치는 `scripts/bench.ts` 대신 `tests/bench/bench.test.ts` + `scripts/run-bench.mjs`(`npm run bench`)로 구현 — 측정·판정 기록은 AI_DESIGN §4.4.
- `moveGen.compositeMoves`(토큰 스왑 패턴 루트 후보 — AI_DESIGN §4.3 한계 보완책)는 **미구현 이월**: 어려움>보통 승률 밴드 충족으로 불요 판정(이슈 그루밍에서 제외), "마일스톤 이후 (백로그)"에 기록.
- `scripts/selfplay.ts`는 별도 스크립트 대신 `tests/ai/arena.selfplay.test.ts`(SELFPLAY=1 가드)로 **대체 구현**(이슈 #3) — 난이도 매트릭스·승률 리포트 기능 동일.

**DoD**
- [ ] 데스크톱 기준 어려움 AI가 1초 예산 내 착수하고, bench 결과가 수용 하한 이상(미달 시 L1/L2 적용 후 재측정 기록 존재).
- [ ] 어려움 > 보통 승률 65~80% (로컬 200판, 선후공 교대). 미달 시 이 마일스톤은 닫히지 않는다.
- [ ] 즉승 국면 픽스처에서 어려움이 항상 즉승수 선택.
- [ ] MCTS 경로 포함 legality fuzz 통과 — 어떤 phase에서도 불법 수 없음.
- [ ] 3~4인 혼합 난이도 스모크 50판 정상 종료.

---

## M7 — UX 마감: 연출·모바일·접근성 기본기

**작업** (모두 `GameEvent` 소비자 — 엔진·스토어 무변경)
- 이벤트 기반 경량 연출: 토큰 이동/카드 보충/귀족 획득의 CSS transition + WAAPI 최소 구성. `prefers-reduced-motion`이면 큐 즉시 플러시(기존 무연출 경로 = 테스트 경로 유지).
- 모바일 세로 레이아웃 패스: 터치 타깃 ≥44px, 보드 세로 스택, PlayerPanel 축약.
- 접근성 기본기: 보석 색+도형 이중 부호화(GemIcon), 키보드 포커스 순회, Announcer 낭독 문장 다듬기.
- AI 체감 지연·사고 인디케이터 폴리시, ResultScreen에 동점 판정 근거 표기.

**DoD**
- [ ] reduced-motion 설정 시 연출이 전무해도 게임이 완전 동작(기존 UI 테스트 전체 그대로 통과).
- [ ] 연출 재생 중 연타/리사이즈에도 최종 표시 상태가 `committed`와 일치(수동 QA 체크리스트 통과).
- [ ] 모바일 뷰포트(390×844)에서 한 판 완주 가능.
- [ ] 색각 이상 시뮬레이터에서 6색 토큰이 구분 가능.

---

## M8 — 배포와 상시 품질 장치

**작업**
- `deploy.yml`: main 머지 → gh-pages 배포. Pages base 경로에서 Worker 로드 확인(구형 Safari 항목 포함 실기기 스모크).
- `ai-arena.yml`: **주 1회**, 축소 예산(150ms)·인접쌍 200판, 결과를 아티팩트로 저장. 비차단.
- (선택) Playwright 스모크 1본: 시드 고정, 쉬움 AI 상대 자동 완주 — 빌드·Worker·배포 경로 회귀망.
- README(한국어): 플레이 방법, 룰 [구현 결정] 요약, 개발 가이드(버그 → 골든 리플레이 추가 절차).

**DoD**
- [ ] 배포된 GitHub Pages URL에서 데스크톱·모바일 실기기로 AI 대전 1판 완주.
- [ ] 주간 arena가 1회 이상 성공 실행되고 서열(어려움>보통>쉬움)이 리포트로 확인됨.
- [ ] 새 클론에서 `npm i && npm test && npm run build`가 문서만 보고 성공.

---

## 마일스톤 이후 (백로그 — 착수하지 않음, 여지만 기록)

- 애니메이션 고도화(FlyLayer 포털·사운드), AI 복기 패널(`stats.topCandidates`), 색약 패턴 오버레이·완전 키보드 플레이, 저사양 기기 예산 자동 보정, 하우스룰 config 플래그, 온라인 멀티(순수 엔진 + `playerView` + 액션 로그가 그대로 서버 프로토콜이 된다 — 이 설계의 확장 배당금), `moveGen.compositeMoves`(토큰 스왑 전술 루트 후보 — AI_DESIGN §4.3 한계 보완, M6에서 승률 밴드 충족으로 이월).

## 운영 규약 (전 마일스톤 공통)

1. **버그 수정 절차**: 재현 액션 열을 골든 리플레이로 추가 → 실패 확인 → 수정 → 통과. 예외 없음.
2. **룰 해석 변경 절차**: `rulesVersion` 증가 + 해당 § 테스트 갱신 + 세이브 호환성 안내 문자열 확인.
3. **머지 게이트**: M3 이후 — typecheck/lint/전체 테스트/`engine/` 커버리지(라인 95%/브랜치 90%)/build. arena와 자가대전은 게이트가 아니다.