# 턴(라운드) UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `TurnBanner`에 현재 라운드 번호(`N라운드`)를 표시하고, 스크린리더가 라운드 전환을 인지하게 한다.

**Architecture:** 라운드는 `view.turn`·`view.config.players.length`에서 파생하는 순수 UI 표현. 신규 순수 함수 `roundNumber(view)`를 만들고 `TurnBanner`가 이를 렌더한다. 엔진·스토어·세이브 스키마·`playerView`는 무변경.

**Tech Stack:** TypeScript, React, Zustand, Vitest(+jsdom), @testing-library/react, ESLint.

## Global Constraints

- 엔진(`src/engine/**`)·스토어(`src/store/**`)·세이브 포맷 무변경 — 라운드는 UI 파생값.
- 라운드 공식: `Math.floor(view.turn / view.config.players.length) + 1` (verbatim).
- 계층 경계: `roundNumber`는 UI(`src/ui/`)에 위치, 엔진에 UI 개념 유입 금지(ESLint 통과).
- 표기: `N라운드`만(순번 병기 없음). 마지막 라운드엔 숫자 + 기존 `마지막 라운드!` 배지 병기.
- 낭독: 배너 전용 `aria-live`(보이는 라운드 span이 `role="status"`), 기존 `Announcer` 로그 톤 무변경.
- 게이트: `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build` 모두 통과.

---

### Task 1: `roundNumber` 순수 함수

**Files:**
- Create: `src/ui/round.ts`
- Test: `tests/ui/round.test.ts`

**Interfaces:**
- Consumes: `GameState` from `src/engine` (기존 export).
- Produces: `export function roundNumber(view: Pick<GameState, 'turn' | 'config'>): number` — 1-based 라운드 번호. Task 2가 소비.

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/ui/round.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { roundNumber } from '../../src/ui/round'
import { baseState } from '../helpers'

// roundNumber는 turn·플레이어 수만 사용 → jsdom 불필요(순수 함수).
describe('roundNumber — turn·플레이어 수 파생', () => {
  for (const n of [2, 3, 4]) {
    it(`${n}인전: turn 0 → 1라운드`, () => {
      expect(roundNumber(baseState(n, 1, { turn: 0 }))).toBe(1)
    })
    it(`${n}인전: turn ${n - 1} → 1라운드 (라운드 마지막 수)`, () => {
      expect(roundNumber(baseState(n, 1, { turn: n - 1 }))).toBe(1)
    })
    it(`${n}인전: turn ${n} → 2라운드 (다음 라운드 첫 수)`, () => {
      expect(roundNumber(baseState(n, 1, { turn: n }))).toBe(2)
    })
    it(`${n}인전: turn ${2 * n} → 3라운드`, () => {
      expect(roundNumber(baseState(n, 1, { turn: 2 * n }))).toBe(3)
    })
  }

  it('finalRound 여부는 라운드 숫자에 영향 없음', () => {
    expect(roundNumber(baseState(2, 1, { turn: 6, finalRound: true }))).toBe(4)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/ui/round.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/ui/round"` (파일 없음).

- [ ] **Step 3: 최소 구현**

Create `src/ui/round.ts`:

```ts
import type { GameState } from '../engine'

/**
 * 1-based 라운드 번호. turn 0은 항상 선 플레이어의 첫 수이고(setup),
 * 매 수(PASS 포함)마다 turn이 1 증가하므로(apply.finishTurn),
 * n=플레이어 수일 때 floor(turn/n)+1이 선 플레이어 기준 라운드를 준다.
 * startPlayer 인덱스와 무관하게 성립한다.
 */
export function roundNumber(view: Pick<GameState, 'turn' | 'config'>): number {
  return Math.floor(view.turn / view.config.players.length) + 1
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/ui/round.test.ts`
Expected: PASS (15개 케이스 모두).

- [ ] **Step 5: 커밋**

```bash
git add src/ui/round.ts tests/ui/round.test.ts
git commit -m "feat(ui): 라운드 번호 파생 함수 roundNumber (이슈 #14)"
```

---

### Task 2: `TurnBanner` 라운드 표시 + aria-live + CSS

**Files:**
- Modify: `src/ui/components/common/TurnBanner.tsx`
- Modify: `src/ui/styles.css:63-71` (`.turn-banner`, 신규 `.turn-round`)
- Test: `tests/ui/turnBanner.test.tsx`

**Interfaces:**
- Consumes: `roundNumber` from `src/ui/round` (Task 1).
- Produces: 배너에 `N라운드` 텍스트 + `role="status"` 라이브 영역. UI만 소비.

- [ ] **Step 1: 실패 테스트 작성**

Create `tests/ui/turnBanner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../../src/App'
import { legalActions } from '../../src/engine/legal'
import { useGameStore } from '../../src/store/gameStore'
import { config } from '../helpers'

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null,
    actionLog: [],
    snapshots: [],
    eventFeed: [],
    eventCounts: [],
    lastEvents: [],
    pendingPicks: [],
    selectedCard: null,
    selectedDeck: null,
    handoffPending: false,
    aiThinking: false,
    lastError: null,
  })
}

/** 현재 committed에 legalActions[0]을 두고, 핫시트 핸드오프가 걸리면 인계한다 */
function playOneMove(): void {
  const s = useGameStore.getState()
  const legal = legalActions(s.committed!)
  act(() => useGameStore.getState().dispatch(legal[0]!))
  if (useGameStore.getState().handoffPending) {
    act(() => useGameStore.getState().acknowledgeHandoff())
  }
}

describe('TurnBanner — 라운드 표시 (이슈 #14)', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('새 게임 직후 1라운드가 표시된다', () => {
    act(() => useGameStore.getState().newGame(config(2, 42)))
    render(<App />)
    expect(screen.getByText('1라운드')).toBeTruthy()
  })

  it('라운드 텍스트는 role="status" 라이브 영역이다 (접근성)', () => {
    act(() => useGameStore.getState().newGame(config(2, 42)))
    render(<App />)
    const round = screen.getByText('1라운드')
    expect(round.getAttribute('role')).toBe('status')
    expect(round.getAttribute('aria-live')).toBe('polite')
  })

  it('2인전에서 각자 1수씩 두면 2라운드로 갱신된다', () => {
    act(() => useGameStore.getState().newGame(config(2, 42)))
    render(<App />)
    expect(screen.getByText('1라운드')).toBeTruthy()
    playOneMove() // P1
    playOneMove() // P2 → turn 2 → 라운드 2
    expect(screen.getByText('2라운드')).toBeTruthy()
    expect(screen.queryByText('1라운드')).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/ui/turnBanner.test.tsx`
Expected: FAIL — `Unable to find an element with the text: 1라운드` (배너에 라운드 미표시).

- [ ] **Step 3: `TurnBanner` 수정**

Replace the entire body of `src/ui/components/common/TurnBanner.tsx`:

```tsx
import type { GameState } from '../../../engine'
import { roundNumber } from '../../round'
import { AiThinkingBadge } from './AiThinkingIndicator'

export function TurnBanner({
  view,
  aiThinking,
  canUndo,
  onUndo,
}: {
  view: GameState
  aiThinking: boolean
  canUndo: boolean
  onUndo: () => void
}) {
  const kind = view.config.players[view.currentPlayer]
  const name = kind?.name ?? ''
  return (
    <div className="turn-banner">
      <span className="turn-round" role="status" aria-live="polite" aria-atomic="true">
        {roundNumber(view)}라운드
      </span>
      <span className="turn-name">{name}님의 차례</span>
      {kind?.type === 'ai' && <AiThinkingBadge thinking={aiThinking} />}
      {view.finalRound && <span className="final-round-badge">마지막 라운드!</span>}
      {canUndo && (
        <button type="button" className="btn btn-undo" onClick={onUndo}>
          ↩ 한 수 무르기
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: CSS 추가 — `src/ui/styles.css`**

`.turn-banner` 규칙(현재 `src/ui/styles.css:63-67`)에 `flex-wrap: wrap;`을 추가하고, 그 아래에 `.turn-round`를 추가한다. 최종 형태:

```css
.turn-banner {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: var(--felt-dark); color: var(--paper);
  border-radius: 10px; padding: 8px 16px; font-size: 1.1rem; font-weight: 600;
}
.turn-round {
  background: var(--paper); color: var(--felt-dark);
  border-radius: 6px; padding: 2px 10px; font-size: 0.95rem; font-weight: 700;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/ui/turnBanner.test.tsx`
Expected: PASS (3개 케이스).

- [ ] **Step 6: 커밋**

```bash
git add src/ui/components/common/TurnBanner.tsx src/ui/styles.css tests/ui/turnBanner.test.tsx
git commit -m "feat(ui): TurnBanner에 라운드 표시·aria-live 낭독 (이슈 #14)"
```

---

### Task 3: 전체 게이트·모바일 검증

**Files:** (변경 없음 — 검증 전용. 회귀 발견 시 해당 파일 수정)

- [ ] **Step 1: 타입체크**

Run: `npm run typecheck`
Expected: 오류 없이 종료(exit 0).

- [ ] **Step 2: 린트(계층 경계 포함)**

Run: `npm run lint`
Expected: 오류 없이 종료. 특히 `src/ui/round.ts`가 엔진에서 UI를 import하지 않음(반대 방향만) 확인.

- [ ] **Step 3: 전체 테스트(회귀 포함)**

Run: `npm run test`
Expected: 전체 PASS. 기존 `tests/ui/m7.test.tsx`·`tests/ui/fullGame.test.tsx`·`tests/ui/smoke.test.tsx`·골든 리플레이(`tests/replays/replay.test.ts`) 무회귀.
회귀 시: 실패 원인 확인. `fullGame.test.tsx`는 스냅샷을 쓰지 않으므로 배너 변경 영향 없음(확인됨). `smoke.test.tsx`가 배너 텍스트를 매칭하면 라운드 span 추가로 깨질 수 있으니 그때만 최소 수정.

- [ ] **Step 4: 빌드**

Run: `npm run build`
Expected: `tsc -b && vite build` 성공.

- [ ] **Step 5: 모바일 세로 가로 스크롤 검증**

`preview_start`로 dev 서버를 띄우고(`.claude/launch.json`의 `dev` 구성이 없으면 `npm run dev`, 포트 5173으로 생성), 새 게임을 시작한 뒤:
- `preview_resize` preset `mobile`(375px) 및 폭 480px.
- `preview_eval`로 `document.documentElement.scrollWidth <= window.innerWidth` 확인(가로 스크롤 없음).
- `preview_inspect '.turn-round'`로 라운드 텍스트가 잘리지 않음 확인.
- `preview_screenshot`로 시각 증빙 확보.

- [ ] **Step 6: 최종 커밋(변경이 있었다면)**

회귀 수정이 있었으면:
```bash
git add -A
git commit -m "test: 이슈 #14 라운드 UI 회귀·모바일 검증 반영"
```
없으면 커밋 생략.

---

## 완료 기준 (DoD) 대응표

| DoD | Task |
|---|---|
| 새 게임 직후 `1라운드` | T2 Step 1(테스트)·Step 3 |
| 전원 1수 후 라운드 +1 (2·3·4인) | T1(공식 2·3·4인 경계)·T2(2인 실플레이) |
| `view.turn`·플레이어 수 파생, 엔진·스토어·세이브 무변경 | T1(순수 함수, UI 배치) |
| 스크린리더 라운드 전환 인지 | T2(role=status aria-live)·Step 1 접근성 테스트 |
| 모바일 세로 가로 스크롤 없음 | T2 Step 4(flex-wrap)·T3 Step 5 |
| M7·골든 리플레이 무회귀 | T3 Step 3 |
| 신규 테스트 추가·통과 | T1·T2 테스트 |
| typecheck/lint/test/build 통과 | T3 |
