# 은밀 트레이 앱 — 설계 문서

- **이슈**: #16 트레이 앱 추가 — "요트다이스 레포의 트레이 앱처럼 은밀하게 플레이할 수 있는 트레이 앱"
- **날짜**: 2026-07-07
- **참조 구현**: `khkim3115/YachtDice_Helper` 레포의 `desktop/`(Electron 트레이 앱)
- **범위**: Electron 데스크톱 셸(신규) + 무채색 압축 "트레이 뷰"(신규 React 진입). **엔진·AI·스토어·세이브 로직 무변경**(그대로 재사용).

## 목표

회사 등에서 **최대한 눈에 안 띄게** 스플랜더를 vs-AI로 플레이하는, 시스템 트레이 상주 데스크톱 앱.
Windows·macOS 지원. 완전 오프라인(백엔드 없음).

**핵심 철학 — 은밀성 = "위장"이 아니라 "최소 존재감".**
다른 프로그램인 척(코드 에디터·스프레드시트 등 위장)하지 않는다. 애초에 **극소형·무채색·조용함**으로,
그리고 **평소엔 접혀 있고 필요할 때만 펼치는**(progressive disclosure) 방식으로 시선을 끌지 않는다.

## 확정된 설계 결정

| 열린 질문 | 결정 |
|---|---|
| 플랫폼 | Windows + macOS (요트다이스 `desktop/` 이식) |
| 은밀성 방식 | 위장 아님 → 최소 존재감(극소형·무채색·모노스페이스) + 점진적 공개 |
| 색 사용 | 완전 무채색. 보석은 색이 아니라 **글자코드**로 표기 |
| 글자코드 언어 | **한/영 토글** (기본 한글). 렌더러 설정(localStorage), `⋮` 메뉴에서 전환 |
| 게임 범위 | 나(사람 1) + AI 1~3명 = **2~4인**, 난이도(쉬움/보통/어려움) 선택 |
| 화면 노출 | 평소 접힘(최소 정보) → 버튼으로 보드/상대/귀족 **펼침**(창 리사이즈) |
| 조작 | 트레이 클릭 · 바깥클릭/Esc 숨김 · **전역 보스키**(변경 가능) · 투명도(30~100%) · 위치 고정/기억 |
| 세이브 | 기존 localStorage 세이브 재사용 — 다시 열면 이어하기 |
| 게임 UI 재사용 | 컬러 보드(`src/ui/*`)는 **미사용**. 무채색 트레이 뷰를 신규 작성 |
| 자동 업데이트 | Windows만(요트다이스와 동일, electron-updater). macOS는 미서명이라 수동 .dmg 재다운로드 |

### 보석 글자코드 매핑

| 토큰 | 색 | 한글 | 영문 |
|---|---|:---:|:---:|
| 다이아몬드 | 흰 White | 흰 | W |
| 사파이어 | 파랑 Blue | 파 | B |
| 에메랄드 | 초록 Green | 초 | G |
| 루비 | 빨강 Red | 빨 | R |
| 오닉스 | 검정 blacK | 검 | K |
| 골드(조커) | 노랑 Yellow | 노 | Y |

- 색 이름 첫 글자 기준(보석 이름 아님) — 색이 없어도 직관 유지. 파랑/검정 충돌은 검정=`K`(CMYK 관습)로 해소.
- 카드 초압축 표기: `명성·보너스|비용` 예) `3초|흰3빨2검1` = 명성3, 보너스 초록, 비용 흰3 빨2 검1 (명성 0이면 생략).

## 아키텍처

### 큰 그림 — 재사용 vs 신규

```
[재사용 · 무변경]                         [신규]
engine/            ─┐                     tray.html            (신규 진입점)
ai/ (worker 포함)   ├─ 같은 useGameStore ─ src/tray/*          (무채색 압축 뷰)
store/gameStore.ts ─┤    를 그대로 소비    desktop/             (Electron 셸, 요트다이스 이식)
store/persistence.ts┘                     app:// 프로토콜·globalShortcut
```

**판단**: 스플랜더 엔진·AI·스토어가 이미 2~4인·사람/AI 혼합·난이도·세이브·undo·AI 라우팅을 처리한다
([`gameStore.ts`](../../../src/store/gameStore.ts): `newGame`/`loadSaved`/`dispatch`/`undo`/`maybeRunAi`).
트레이 뷰는 이 스토어를 **그대로 소비**하고, 색 없는 UI만 새로 그린다.
요트다이스가 `popup.html`을 바닐라로 통째 재구현한 것과 반대 — 스플랜더는 로직이 무거워 재사용이 정답.

### 신규: 트레이 뷰 (`src/tray/`)

- **진입점**: `tray.html` + `src/tray/main.tsx` — `src/main.tsx`와 평행. `useGameStore`를 공유하되
  컬러 `src/ui/screens/*`·`styles.css`는 import하지 않는다.
- **`src/tray/TrayApp.tsx`** — 라우팅(App.tsx 미러): `committed==null`→`TraySetup` / `gameOver`→`TrayResult` / 그 외→`TrayGame`.
- **`src/tray/screens/TraySetup.tsx`** — 인원(2·3·4)·난이도 세그먼트 + [시작] + [이어하기](`hasSave()`일 때).
  `GameConfig`(사람1 + AI n-1, 선택 난이도)를 만들어 `newGame(config)`. 설정 구성 로직은 `SetupScreen`과 공유(단일 진실원).
- **`src/tray/screens/TrayGame.tsx`** — 접힘 기본 뷰 + 펼침 패널. 스토어 액션으로 플레이:
  토큰 집기(`togglePick`/`buildPickAction`/`dispatch`), 카드 선택·구매·예약(`selectCard`/`selectDeck`/`dispatch`), `undo`.
  트레이는 항상 사람 1명 → `handoffPending` 절대 발생 안 함(핸드오프 오버레이 불필요).
- **`src/tray/screens/TrayResult.tsx`** — 승자·최종 점수 + [새 게임].
- **`src/tray/format.ts`** (순수 함수, jsdom 불필요) — 글자코드 맵(ko/en), 압축 카드 표기, 플레이어 요약 포매터.
- **`src/tray/useTraySettings.ts`** — `gemCodeLang: 'ko'|'en'` + 펼침 상태. localStorage(`splendor:tray`)에 영속.
- **`src/tray/tray.css`** — 무채색 토큰·모노스페이스·초압축 레이아웃. (배경 #14161a, 글자 #d7dbe0/#868f9b/#5b636e, 실선 #2b3138)

### 화면 상태 (점진적 공개)

| 상태 | 대략 크기 | 내용 |
|---|---|---|
| 설정 | 250×200 | 인원·난이도·시작·이어하기 |
| 접힘(평소) | 250×178 | ▸내 차례 · 점수 N/15 · 내 보너스/토큰/예약 · [보드][상대][귀족] 버튼 |
| +보드 | ~260×440 | 3티어 카드 텍스트 격자 + 토큰 공급 |
| +상대 | ~392×440 | 위 + 우측 2~4인 점수판(요트다이스 백틱식 가로 확장) |
| +귀족 | 소폭 증가 | 귀족 3~5장 요구조건 |

- 펼침은 **누적/토글** — 렌더러가 현재 펼침 조합에 맞는 목표 크기를 계산해 메인에 리사이즈 요청.

### 변경: `vite.config.ts`

- 멀티페이지 빌드: `build.rollupOptions.input = { main: 'index.html', tray: 'tray.html' }`.
  Electron은 트레이 번들만 로드 → 컬러 보드 코드는 데스크톱에 실리지 않는다.
- `base`: 데스크톱은 `app://` 프로토콜 루트에서 서빙하므로 상대경로로 동작(웹 배포 `'/splendor/'`와 분리 — 데스크톱 빌드만 `--base=./` 또는 프로토콜 기준 절대).

### 신규: Electron 셸 (`desktop/`, 요트다이스 이식)

- **`main.js`** — 트레이 상주, 네이티브 메뉴, 프레임리스·`skipTaskbar`·`alwaysOnTop` 창, 바깥클릭 숨김,
  위치 고정(핀)·위치 기억, 투명도(30~100 클램프), 자동 실행, 자동 업데이트(win). 요트다이스 로직 거의 그대로.
  - **로드 대상**: `popup.html` → 스플랜더 `app://…/tray.html`.
  - **펼침 리사이즈**: 렌더러가 IPC로 목표 `{w,h}` 요청 → 메인이 작업영역 클램프 + 우하단 앵커 유지(요트다이스 `positionPanel` 재사용).
- **`preload.js`** — contextBridge: `hide`, `setOpacity`/`onOpacity`, `resize(w,h)`, `onBossKey`(표시/숨김), `setGemLang`(선택 — 메뉴에서 토글 시).
- **전역 보스키**: `globalShortcut.register`(기본 예: `Ctrl+Alt+Space`) → 표시/숨김 토글. 트레이 메뉴에서 변경, 등록 충돌 시 안내. `will-quit`에서 `unregisterAll`.
- **`app://` 커스텀 프로토콜**: `protocol.handle`로 `dist/` 서빙 → `tray.html` + **ESM AI 워커**가 `file://` 제약 없이 로드. (워커 로드 실패해도 greedy 폴백 내장 — [`client.ts`](../../../src/ai/client.ts) `workerBroken`)
- **`desktop/package.json`** — `build`(nsis + dmg + electron-updater), `scripts/adhoc-sign.cjs`(mac ad-hoc 서명), 요트다이스 이식.
- **`.github/workflows/desktop-release.yml`** — 릴리스 publish 시 Win `.exe`(+`latest.yml`) · Mac `.dmg` 빌드·첨부. 이식(이름만 스플랜더로).

## 데이터 흐름

- 트레이 뷰 ↔ `useGameStore`: 웹앱과 동일. `newGame`/`dispatch`/`undo`가 자동으로 `saveGame`(localStorage) 호출.
- AI: `maybeRunAi`가 다음 차례가 AI면 `aiClient.requestMove`로 워커에 위임. 트레이 뷰는 `aiThinking`만 구독해 "AI 생각 중" 표시.
- 표시 설정(`gemCodeLang`·투명도): 투명도는 Electron `settings.json`(메인 소유, 요트다이스식), 글자코드 언어는 렌더러 localStorage. 창 크기(펼침)는 렌더러 계산 → 메인 리사이즈.
- 보스키/숨김: 메인 `globalShortcut`·`blur`·트레이 클릭 → 창 show/hide. 창은 파괴하지 않고 hide만 → 스토어 상태·워커 구독 유지.

## 에러 처리 / 견고성

- **워커 로드 실패**: greedy 폴백으로 게임 계속(하드 AI만 품질 저하). 빌드 검증에서 `window.__splendorAi.workerCreated`로 관측.
- **세이브 손상/구버전**: 기존 `loadGame` 검증 리플레이가 걸러 `이어하기`가 실패 사유 반환 → 새 게임 유도.
- **보스키 등록 충돌**: 실패 시 트레이 메뉴에 안내, 사용자가 다른 조합 지정.
- **미서명 배포**: Windows SmartScreen·macOS Gatekeeper 경고 — 요트다이스와 동일하게 첫 실행 안내로 수용(코드서명 없음).

## 테스트

- **단위 (jsdom 불필요)** `tests/tray/format.test.ts`
  - 글자코드 맵 ko/en: 6색 각각 `흰파초빨검노` ↔ `WBGRKY`.
  - 압축 카드 표기: 명성·보너스·비용 조합, 명성0 생략.
  - 플레이어 요약 포매터(점수·보너스·토큰·예약).
- **UI (jsdom)** `tests/tray/traySetup.test.tsx` · `trayGame.test.tsx`
  - TraySetup: 인원×난이도 선택 → `newGame`에 올바른 `GameConfig`(사람1 + AI n-1, 난이도) 전달.
  - TrayGame 접힘: `내 차례`·점수·내 자원 표시. 펼침 토글로 보드/상대/귀족 등장·소멸.
  - 글자코드 토글: 흰↔W 스왑.
  - 이어하기: `hasSave()` 있을 때만 노출, 클릭 시 `loadSaved`.
- **Electron 스모크** (`YD_SMOKE`식 헤드리스) — 트레이 생성, 보스키로 show/hide, 투명도 클램프(30 바닥), 펼침 리사이즈(작업영역 클램프·앵커), 바깥클릭 숨김, hide 후 재표시 시 게임 상태 보존.
- **워커 로드 검증** — 데스크톱 빌드를 `app://`로 로드해 `window.__splendorAi.workerCreated===true`, 하드 AI `lastAlgo==='mcts'`(폴백 아님) 확인.
- **회귀** — engine/ai/store 기존 테스트 무변경·무회귀(트레이는 스토어 재사용이라 게임 로직 커버리지 그대로).

## 완료 기준 (DoD)

- [ ] 트레이 상주 → 아이콘/보스키로 초소형 창 표시. 바깥클릭·Esc·보스키로 숨김(종료 아님).
- [ ] 설정에서 인원 2~4·난이도 선택 → vs-AI 게임 시작. `이어하기`로 저장 게임 복원.
- [ ] 접힘 기본 뷰가 최소 정보만 표시, [보드]/[상대]/[귀족]로 펼침·접기(창 리사이즈, 우하단 앵커).
- [ ] 완전 무채색·모노스페이스. 보석은 글자코드로, 한/영 토글 동작(기본 한글).
- [ ] 투명도 30~100% 조절·복원. 전역 보스키 동작·변경 가능.
- [ ] 엔진·AI·스토어·세이브 스키마 무변경 — 트레이 뷰는 `useGameStore`만 소비.
- [ ] 데스크톱 빌드에서 AI 워커가 `app://`로 정상 로드(하드=mcts, 폴백 아님).
- [ ] Windows `.exe`(자동 업데이트) + macOS `.dmg`(ad-hoc) 빌드·릴리스 첨부(CI).
- [ ] 신규 트레이 테스트 추가·통과. typecheck/lint/전체 테스트/build(웹+데스크톱) 통과.

## YAGNI / 범위 밖

- 온라인 멀티플레이·리더보드(요트다이스엔 있으나 스플랜더 트레이는 오프라인 vs-AI 전용).
- 핫시트(사람 2+) — 은밀 1인 플레이라 불필요(핸드오프 오버레이 미사용).
- 컬러 보드·연출(FlyLayer)·기존 `src/ui` 재사용.
- macOS 자동 업데이트(미서명 — 수동 .dmg).
- 하우스룰·AI 복기 패널 등 백로그(#10) 항목.

## 리스크 / 후속 확인

- **한글 글자 가독성** — 11px 모노스페이스에서 `흰파초빨검노` 단자 가독성 preview로 확인(필요 시 최소 폰트 상향).
- **보스키 기본 조합** — OS/타 앱과 충돌 가능 → 변경 가능하게, 기본값 신중히.
- **`app://` + 워커** — 구현 초기에 스모크로 최우선 검증(가장 큰 기술 리스크).
- **미서명 배포 UX** — SmartScreen/Gatekeeper 첫 실행 안내 문구 필요.
