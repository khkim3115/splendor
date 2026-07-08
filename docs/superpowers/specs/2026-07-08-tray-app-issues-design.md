# 트레이 앱 이슈 수정 설계 (이슈 #16 후속)

작성일: 2026-07-08
브랜치: `claude/tray-app-issues-8bc009`
참조 앱: `D:\project\YachtDice_Helper\desktop`(popup.html / main.js)

## 배경

트레이 앱 실기기 테스트에서 5개 문제가 확인됐다. 조사 결과, **대부분은 메인
프로세스(main.js)·preload에 인프라가 이미 있고 렌더러(React) 배선만 빠진** 것이다.

| # | 이슈 | 메인/preload | 렌더러 | 조치 |
|---|------|--------------|--------|------|
| ① | 인패널 조작 단축키 부재 | 전역 보스키만 있음 | 없음 | 렌더러 keydown 매핑 신규 |
| ② | 투명도 조절 UI 없음 | `tray-set-opacity` IPC + 30~100 클램프 + `onOpacity` 있음 | 슬라이더 UI 없음 | 렌더러 슬라이더 팝오버 신규 |
| ③ | 트레이 앱 드래그 안 됨 | `movable:true` + `moved`→위치저장 있음 | `-webkit-app-region:drag` 없음 | 드래그 영역 CSS 신규 |
| ④ | 좌우 스크롤 발생 | — | `overflow-x` 미차단·보드 행 `nowrap` | overflow 가드 + 래핑 |
| ⑤ | ESC 즉시 닫기 안 됨 | `tray.hide()` 노출 | keydown 핸들러 없음 | ESC→hide 배선 |

추가로, 참조 앱이 가진 **패널 내 테마 토글**을 이식한다(Splendor는 현재 트레이
메뉴로만 테마 전환 가능). preload에 `setTheme`가 없어 이 부분만 신규 IPC가 필요하다.

## 목표 / 비목표

**목표**
- 이슈 ①~⑤ 해결.
- 드래그·투명도·테마·닫기를 담는 **얇은 상단 바** 하나로 ②③⑤+테마를 통합.
- "은밀한 트레이 앱" 성격 유지 — 단축키 힌트는 화면에 노출하지 않는다(버튼 `title`
  속성 + 문서화로만 안내).

**비목표**
- 트레이 메뉴(위치 고정·초기화·보스키 변경·자동실행·업데이트)는 그대로 둔다 —
  중복 컨트롤을 상단 바에 넣지 않는다(핀 버튼 제외 결정됨).
- 전역 보스키 조합 변경/재설계는 하지 않는다(이슈 ①은 인패널 단축키로 확정).
- 설정/결과 화면의 키보드 전체 조작화는 하지 않는다 — 단축키는 게임 화면 중심.

## 아키텍처

### 소유권 / 데이터 흐름
- **투명도·테마**: 메인(`settings.json`) 단일 출처. 렌더러는 IPC로 *적용/저장 요청*을
  보내고, `onOpacity`/`onTheme` 푸시로 초기값을 복원한다. (기존 tray.html 계약 유지)
- **펼침·글자코드 언어**: 렌더러 `localStorage`(기존 `useTraySettings`) 유지.
- **단축키**: 렌더러 로컬 — 스토어 액션(`togglePick`/`undo`/`dispatch` 등) 및
  `useTraySettings.toggleExpand` 호출로 귀결. 순수 매핑 함수로 분리해 단위 테스트.

### 컴포넌트

**`TrayTitleBar` (신규, `src/tray/TrayTitleBar.tsx`)**
- 모든 화면(setup/game/result) 최상단에 렌더되는 높이 ~22px 바.
- 좌측: 앱 이름 "스플랜더"(dim) + 남는 영역 전체가 드래그 핸들(`-webkit-app-region: drag`).
- 우측 컨트롤(모두 `-webkit-app-region: no-drag`, `tabIndex=-1`):
  - `🔅` 투명도 토글 → 아래에 슬라이더 팝오버 열기/닫기
  - `☀️`/`🌙` 테마 토글(현재 테마의 반대 아이콘 표시)
  - `✕` 닫기 → `window.tray?.hide()`
- 투명도 팝오버(`<input type="range" min=30 max=100 step=1>` + `%` 표기):
  - `input` → `tray.setOpacity(v, false)` (실시간 적용만)
  - `change` → `tray.setOpacity(v, true)` (드래그 끝 → 저장)
  - 마운트 시 `tray.onOpacity((v)=>setSlider(v))`로 초기값 복원(정리 함수로 리스너 해제)
  - 바깥 클릭·`Esc`·창 리사이즈 시 팝오버 닫힘
- `window.tray`가 없으면(브라우저 미리보기) 컨트롤은 no-op — 컴포넌트는 항상 렌더되되
  드래그/IPC는 존재할 때만 동작(기존 `window.tray?.` 관례와 동일).

### IPC / preload 확장 (테마)
- `desktop/preload.js`: `window.tray`에 `setTheme(mode)` 추가 →
  `ipcRenderer.send('tray-set-theme', mode)`.
- `desktop/main.js`: `ipcMain.on('tray-set-theme', ...)` 추가 —
  `mode`를 `'light'|'dark'`로 정규화 후 `writeSettings({theme})`,
  `win.setBackgroundColor(bgFor(theme))`, `win.webContents.send('tray-theme', theme)`,
  `rebuildTrayMenu()`. **기존 `toggleTheme()`와 로직이 겹치므로**, 공통 적용부를
  `applyThemeAndPersist(theme)` 헬퍼로 뽑아 트레이 메뉴 토글과 IPC가 공유한다.
- `src/tray/tray-window.d.ts`: `setTheme(mode: 'light' | 'dark'): void` 타입 추가.

### 키보드 (이슈 ①⑤) — `src/tray/shortcuts.ts`(신규 순수 함수) + `TrayApp` keydown

**순수 매핑 함수** `resolveShortcut(e, ctx)` — DOM에 의존하지 않게 필요한 필드만 받는다:
입력 `{ key, hasModifier }` + 컨텍스트 `{ popoverOpen, screen, phase, myTurn, passOnly, undoable, hasPending }`
→ 출력 액션 유니온
(`'closePopover' | 'hide' | 'toggleExpand:board|opponents|nobles' | 'toggleLang' | 'undo' | 'confirm' | 'pass' | 'pick:0..4' | 'none'`).

**규칙**
- 수식키(Ctrl/Alt/Meta) 눌린 조합, 팝오버 밖 텍스트 입력 포커스 → 항상 `'none'`
  (트레이엔 텍스트 입력이 없지만 방어).
- `Esc`: `popoverOpen`이면 `'closePopover'`, 아니면 `'hide'` (이슈 ⑤).
- 게임 화면(`screen==='game'`)에서만 아래 조작 단축키가 유효:
  - `b`/`o`/`n` → `toggleExpand:board|opponents|nobles` (대소문자 무시)
  - `l` → `toggleLang`
  - `u` → `undoable`일 때 `undo`
  - `Enter` → **대기 중인 토큰 집기(`pendingPicks`)가 있을 때만** `confirm`
    (=`확정` 버튼과 동일: `buildPickAction(pendingPicks)` 디스패치).
    카드/덱 선택은 구매·예약 2개 행동이라 Enter로 애매 → Enter 대상에서 제외(버튼으로).
  - `p` → `myTurn && passOnly`일 때 `pass`
  - `1`~`5` → `myTurn && phase==='play'`일 때 `pick:0..4`
    (인덱스는 `GEM_COLORS = [white,blue,green,red,black]`; 1→white … 5→black)

**리스너 배치(2분할 — 순수함수는 공유, 액션은 분리)**: `resolveShortcut`는 모든 키를
매핑하는 단일 순수함수지만, 실제 액션 디스패치는 두 리스너가 각자 담당 범위만 처리한다.
`useTraySettings`(펼침·언어)를 상위로 끌어올려 `TrayGame` 프로프를 바꾸면 기존 테스트
호출부(~10곳)가 대량 변경되므로, 대신 컨텍스트를 이미 쥔 곳에서 처리한다:
- **`TrayApp`**(항상 마운트, 팝오버 상태 소유): `document` keydown에서 `resolveShortcut`
  결과 중 `'closePopover'`·`'hide'`(=Esc, 이슈 ⑤)만 처리. 나머지는 무시.
- **`TrayGame`**(게임 화면에서만 마운트, `useTraySettings`·스토어·페이즈 컨텍스트 보유):
  `document` keydown에서 `resolveShortcut` 결과 중 게임 조작
  (`toggleExpand:*`·`toggleLang`·`undo`·`confirm`·`pass`·`pick:*`)만 처리. `Esc` 결과는 무시.
- 두 리스너의 액션 집합이 서로소라 같은 이벤트를 이중 처리하지 않는다. Esc는 `TrayApp`만,
  게임 키는 `TrayGame`만 반응한다. 팝오버 상태는 `TrayApp`가 소유하고 `TrayTitleBar`에 내려준다.

- 힌트 노출: **숨김** 확정. 각 아이콘 버튼 `title`에만 단축키 안내(예: `title="닫기 (Esc)"`),
  README/커밋 메시지에 표를 문서화.

### 가로 스크롤 차단 (이슈 ④) — `src/tray/tray.css`
- `html, body { overflow-x: hidden; }` 하드 가드(가로 스크롤바 원천 차단).
- `#root { overflow-x: hidden; }` + 세로는 `overflow-y: auto` 유지.
- 넘칠 수 있는 행 처리:
  - `.tray-tier`(보드 행): `flex-wrap: wrap`로 전환 — 폭 초과 시 세로로 흐르게 해
    클리핑과 가로바를 동시에 방지.
  - 긴 이름(`.tray-opp-name`, `.tray-me` 등): 기존 `text-overflow: ellipsis` 유지·보강,
    부모 flex에 `min-width: 0` 보장.
- **검증**: 각 펼침 조합의 `targetSize`(w=250/260/392, h=178~536)에서 preview로 실측 —
  가로 스크롤바가 어느 조합에서도 나타나지 않는지 확인. 넘치면 해당 행 래핑/폭 조정.

### 드래그 (이슈 ③)
- `TrayTitleBar` 좌측이 드래그 핸들. main.js는 이미 `movable:true` + `moved` 저장
  지원 → 메인 변경 불필요. 컨트롤 아이콘은 `no-drag`로 클릭 보장.

## 파일 변경 요약

**신규**
- `src/tray/TrayTitleBar.tsx` — 상단 바 + 투명도 팝오버
- `src/tray/shortcuts.ts` — `resolveShortcut` 순수 매핑

**수정**
- `src/tray/TrayApp.tsx` — `<TrayTitleBar>` 마운트, 팝오버 상태 소유, `keydown`(Esc/hide)
- `src/tray/screens/TrayGame.tsx` — `keydown`(게임 조작 단축키) 리스너 추가
- `src/tray/tray.css` — 상단 바·팝오버·드래그 영역·`overflow-x` 가드·행 래핑
- `src/tray/tray-window.d.ts` — `setTheme` 타입
- `desktop/preload.js` — `setTheme` 노출
- `desktop/main.js` — `tray-set-theme` IPC + `applyThemeAndPersist` 헬퍼 추출

**테스트**
- `tests/tray/shortcuts.test.ts`(신규) — `resolveShortcut` 단위 테스트
  (수식키 무시, Esc 분기, 화면/페이즈 가드, 숫자키 매핑 경계). 렌더러 테스트는
  기존 관례대로 `tests/tray/`에 둔다(vitest include: `tests/**/*.test.ts(x)`).
- 기존 `.cjs` 순수 로직 테스트는 불변. main.js 테마 헬퍼 추출 시 회귀 없는지 확인.

## 테스트 전략
- **단위(vitest)**: `resolveShortcut` 진리표 — 각 키·컨텍스트 조합의 기대 출력.
- **렌더러 E2E-lite(preview)**: 드래그 영역 존재, `overflow-x` 없음(각 펼침 크기),
  슬라이더 적용/복원, ESC 닫기, 단축키 동작을 snapshot/inspect로 확인.
- **수동 실기기**: Electron 패키지에서 실제 드래그·투명도·보스키·ESC·단축키 최종 확인
  (창 레벨 동작은 브라우저로 완전 재현 불가).

## 리스크 / 주의
- 상단 바가 추가되며 각 화면의 세로 공간이 ~22px 줄어든다 → `targetSize` 높이 재확인
  (필요 시 h 소폭 증가). 가로 스크롤 검증과 함께 실측.
- `1~5` 토큰 집기 키가 다른 UI 컨텍스트(설정 인원 선택 등)와 겹치지 않도록 화면 가드
  (`screen==='game' && phase==='play'`)로 한정.
- 테마 로직 이원화 방지: 트레이 메뉴 토글과 IPC가 반드시 같은 헬퍼를 공유.
