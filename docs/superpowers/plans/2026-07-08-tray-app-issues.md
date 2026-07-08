# 트레이 앱 이슈 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 트레이 앱의 5개 실사용 이슈(인패널 단축키·투명도 UI·드래그·가로 스크롤·ESC 닫기)를 해결하고, 요트다이스 참조 앱의 상단 바(투명도/테마/닫기) 패턴을 이식한다.

**Architecture:** 빠진 것은 대부분 렌더러 배선이다. 이슈 ②③⑤+테마를 얇은 상단 바 컴포넌트(`TrayTitleBar`)로 통합하고, 단축키(①)는 순수 매핑 함수 `resolveShortcut`를 두 리스너(Esc=TrayApp, 게임키=TrayGame)가 공유하며, 가로 스크롤(④)은 CSS `overflow-x` 가드 + 행 래핑으로 막는다. 투명도·테마는 메인(`settings.json`) 단일 출처를 유지하고 렌더러는 기존 IPC를 소비한다(테마 IPC만 신규).

**Tech Stack:** Electron(메인 `desktop/*.cjs`/`main.js`/`preload.js`), React 18 + TypeScript(렌더러 `src/tray/**`), Zustand(`useGameStore`), Vitest + @testing-library/react(jsdom).

## Global Constraints

- 투명도 범위: **30~100 정수(%)**. 클램프 단일 출처는 `desktop/lib/opacity.cjs`(`clampPercent`/`clampOpacity`) — 렌더러는 `<input min=30 max=100 step=1>`로만 제약, 실제 클램프는 메인이 수행.
- 테마 값은 **`'light' | 'dark'`** 두 개. 배경색 공유 계약: dark `#14161a`, light `#f4f4f5`(`desktop/lib/theme.cjs` `BG`).
- 색 순서(토큰 집기 키 매핑): `GEM_COLORS = ['white','blue','green','red','black']` (`src/engine/types.ts`). 숫자키 1→white … 5→black.
- 단축키 힌트는 **화면에 노출하지 않는다**(은밀 앱). 안내는 버튼 `title` 속성 + 문서만.
- 렌더러는 `window.tray`가 없을 수 있다(브라우저 미리보기) → 모든 IPC 호출은 `window.tray?.method?.()` 옵셔널 체이닝으로 감싼다.
- 테스트 위치·환경: 렌더러 테스트는 `tests/tray/*.test.tsx`(파일 상단 `// @vitest-environment jsdom`), 순수 로직은 `tests/**/*.test.ts`(node). vitest include: `tests/**/*.test.ts(x)`.
- 트레이 메뉴(위치 고정·초기화·보스키 변경·자동실행·업데이트)는 변경하지 않는다.

---

### Task 1: `resolveShortcut` 순수 매핑 함수 (이슈 ①⑤ 로직)

**Files:**
- Create: `src/tray/shortcuts.ts`
- Test: `tests/tray/shortcuts.test.ts`

**Interfaces:**
- Consumes: `GEM_COLORS`(`src/engine`).
- Produces:
  - `type TrayScreen = 'setup' | 'game' | 'result'`
  - `type PlayPhaseKind = 'play' | 'discard' | 'chooseNoble' | 'gameOver'`
  - `interface ShortcutInput { key: string; hasModifier: boolean }`
  - `interface ShortcutContext { popoverOpen: boolean; screen: TrayScreen; phase: PlayPhaseKind; myTurn: boolean; passOnly: boolean; undoable: boolean; hasPending: boolean }`
  - `type ShortcutAction = { type: 'none' } | { type: 'closePopover' } | { type: 'hide' } | { type: 'toggleExpand'; panel: 'board' | 'opponents' | 'nobles' } | { type: 'toggleLang' } | { type: 'undo' } | { type: 'confirm' } | { type: 'pass' } | { type: 'pick'; index: number }`
  - `function resolveShortcut(input: ShortcutInput, ctx: ShortcutContext): ShortcutAction`

- [ ] **Step 1: 실패 테스트 작성** — `tests/tray/shortcuts.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { resolveShortcut, type ShortcutContext } from '../../src/tray/shortcuts'

const gameCtx = (over: Partial<ShortcutContext> = {}): ShortcutContext => ({
  popoverOpen: false, screen: 'game', phase: 'play', myTurn: true,
  passOnly: false, undoable: false, hasPending: false, ...over,
})

describe('resolveShortcut', () => {
  it('Esc: 팝오버 열림이면 닫기, 아니면 숨기기', () => {
    expect(resolveShortcut({ key: 'Escape', hasModifier: false }, gameCtx({ popoverOpen: true })))
      .toEqual({ type: 'closePopover' })
    expect(resolveShortcut({ key: 'Escape', hasModifier: false }, gameCtx({ popoverOpen: false })))
      .toEqual({ type: 'hide' })
  })
  it('수식키 조합은 무시(Esc 제외)', () => {
    expect(resolveShortcut({ key: 'b', hasModifier: true }, gameCtx())).toEqual({ type: 'none' })
  })
  it('게임 화면 밖에서는 조작 단축키 없음', () => {
    expect(resolveShortcut({ key: 'b', hasModifier: false }, gameCtx({ screen: 'setup' })))
      .toEqual({ type: 'none' })
  })
  it('B/O/N → 펼침 토글(대소문자 무시)', () => {
    expect(resolveShortcut({ key: 'b', hasModifier: false }, gameCtx())).toEqual({ type: 'toggleExpand', panel: 'board' })
    expect(resolveShortcut({ key: 'O', hasModifier: false }, gameCtx())).toEqual({ type: 'toggleExpand', panel: 'opponents' })
    expect(resolveShortcut({ key: 'n', hasModifier: false }, gameCtx())).toEqual({ type: 'toggleExpand', panel: 'nobles' })
  })
  it('L → 언어 전환', () => {
    expect(resolveShortcut({ key: 'l', hasModifier: false }, gameCtx())).toEqual({ type: 'toggleLang' })
  })
  it('U → 무르기(가능할 때만)', () => {
    expect(resolveShortcut({ key: 'u', hasModifier: false }, gameCtx({ undoable: true }))).toEqual({ type: 'undo' })
    expect(resolveShortcut({ key: 'u', hasModifier: false }, gameCtx({ undoable: false }))).toEqual({ type: 'none' })
  })
  it('Enter → 대기 집기 확정(있을 때만)', () => {
    expect(resolveShortcut({ key: 'Enter', hasModifier: false }, gameCtx({ hasPending: true }))).toEqual({ type: 'confirm' })
    expect(resolveShortcut({ key: 'Enter', hasModifier: false }, gameCtx({ hasPending: false }))).toEqual({ type: 'none' })
  })
  it('P → 패스(내 차례·패스만 가능할 때)', () => {
    expect(resolveShortcut({ key: 'p', hasModifier: false }, gameCtx({ passOnly: true }))).toEqual({ type: 'pass' })
    expect(resolveShortcut({ key: 'p', hasModifier: false }, gameCtx({ passOnly: false }))).toEqual({ type: 'none' })
    expect(resolveShortcut({ key: 'p', hasModifier: false }, gameCtx({ passOnly: true, myTurn: false }))).toEqual({ type: 'none' })
  })
  it('1..5 → 토큰 집기 인덱스(내 차례·play 페이즈)', () => {
    expect(resolveShortcut({ key: '1', hasModifier: false }, gameCtx())).toEqual({ type: 'pick', index: 0 })
    expect(resolveShortcut({ key: '5', hasModifier: false }, gameCtx())).toEqual({ type: 'pick', index: 4 })
    expect(resolveShortcut({ key: '1', hasModifier: false }, gameCtx({ phase: 'discard' }))).toEqual({ type: 'none' })
    expect(resolveShortcut({ key: '1', hasModifier: false }, gameCtx({ myTurn: false }))).toEqual({ type: 'none' })
  })
  it('매핑 없는 키 → none', () => {
    expect(resolveShortcut({ key: 'z', hasModifier: false }, gameCtx())).toEqual({ type: 'none' })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/tray/shortcuts.test.ts`
Expected: FAIL — `Cannot find module '../../src/tray/shortcuts'`.

- [ ] **Step 3: 구현** — `src/tray/shortcuts.ts`

```ts
// 트레이 인패널 단축키 매핑 — 순수 함수(DOM 비의존). TrayApp/TrayGame keydown 리스너가 소비.
// 참조: 요트다이스 popup.html 의 Space/Esc 처리를 스플랜더 조작에 맞게 확장.
import { GEM_COLORS } from '../engine'

export type TrayScreen = 'setup' | 'game' | 'result'
export type PlayPhaseKind = 'play' | 'discard' | 'chooseNoble' | 'gameOver'

export interface ShortcutInput {
  key: string
  hasModifier: boolean // Ctrl/Alt/Meta 중 하나라도 눌렸는지
}

export interface ShortcutContext {
  popoverOpen: boolean
  screen: TrayScreen
  phase: PlayPhaseKind
  myTurn: boolean
  passOnly: boolean
  undoable: boolean
  hasPending: boolean
}

export type ShortcutAction =
  | { type: 'none' }
  | { type: 'closePopover' }
  | { type: 'hide' }
  | { type: 'toggleExpand'; panel: 'board' | 'opponents' | 'nobles' }
  | { type: 'toggleLang' }
  | { type: 'undo' }
  | { type: 'confirm' }
  | { type: 'pass' }
  | { type: 'pick'; index: number } // GEM_COLORS 인덱스 0..4

const NONE: ShortcutAction = { type: 'none' }

/** keydown 을 트레이 조작 액션으로 매핑한다(순수). 대소문자 무시, 수식키 조합은 무시(Esc 제외). */
export function resolveShortcut(input: ShortcutInput, ctx: ShortcutContext): ShortcutAction {
  const { key, hasModifier } = input
  // Esc 는 수식키 무관하게 최우선 처리(팝오버 우선 닫기 → 아니면 숨기기).
  if (key === 'Escape') {
    return ctx.popoverOpen ? { type: 'closePopover' } : { type: 'hide' }
  }
  // 그 외 단축키는 수식키 조합이면 무시(OS·앱 복사/붙여넣기 등 보호).
  if (hasModifier) return NONE
  // 조작 단축키는 게임 화면에서만.
  if (ctx.screen !== 'game') return NONE

  const k = key.toLowerCase()
  switch (k) {
    case 'b': return { type: 'toggleExpand', panel: 'board' }
    case 'o': return { type: 'toggleExpand', panel: 'opponents' }
    case 'n': return { type: 'toggleExpand', panel: 'nobles' }
    case 'l': return { type: 'toggleLang' }
    case 'u': return ctx.undoable ? { type: 'undo' } : NONE
    case 'enter': return ctx.hasPending ? { type: 'confirm' } : NONE
    case 'p': return ctx.myTurn && ctx.passOnly ? { type: 'pass' } : NONE
    default: break
  }
  // 숫자키 1..5 → 토큰 집기(내 차례·play 페이즈에서만).
  if (k >= '1' && k <= '5') {
    if (ctx.myTurn && ctx.phase === 'play') {
      const index = Number(k) - 1
      if (index < GEM_COLORS.length) return { type: 'pick', index }
    }
    return NONE
  }
  return NONE
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/tray/shortcuts.test.ts`
Expected: PASS (모든 it 통과).

- [ ] **Step 5: 타입체크 + 커밋**

Run: `npx tsc --noEmit` → Expected: 에러 없음
```bash
git add src/tray/shortcuts.ts tests/tray/shortcuts.test.ts
git commit -m "feat(tray): resolveShortcut 순수 단축키 매핑 (이슈 ①⑤)"
```

---

### Task 2: 테마 IPC 배선 + 타입 (참조 앱 이식)

**Files:**
- Modify: `desktop/lib/theme.cjs` (normalizeTheme 추가)
- Test: `tests/desktop/theme.test.ts` (normalizeTheme 케이스 추가)
- Modify: `desktop/preload.js` (setTheme 노출)
- Modify: `desktop/main.js` (applyThemeAndPersist 추출 + `tray-set-theme` 핸들러 + import)
- Modify: `src/tray/tray-window.d.ts` (setTheme 타입 + onOpacity/onTheme 반환형 보정)

**Interfaces:**
- Consumes: `writeSettings`/`bgFor`/`nextTheme`(기존), `settings`/`rebuildTrayMenu`/`applyTheme`(main.js 기존).
- Produces:
  - `theme.cjs`: `normalizeTheme(mode: unknown): 'light' | 'dark'`
  - `preload`: `window.tray.setTheme(mode: 'light' | 'dark'): void` → `ipcRenderer.send('tray-set-theme', mode)`
  - `main.js`: IPC `'tray-set-theme'`; 내부 헬퍼 `applyThemeAndPersist(theme)`
  - `tray-window.d.ts`: `setTheme(mode: 'light' | 'dark'): void`, `onOpacity(cb): () => void`, `onTheme(cb): () => void`

- [ ] **Step 1: 실패 테스트 추가** — `tests/desktop/theme.test.ts` 하단 `describe('theme', ...)` 내부에 추가

```ts
  it('normalizeTheme 는 light 만 light, 그 외 전부 dark', () => {
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme('dark')).toBe('dark')
    expect(normalizeTheme(undefined)).toBe('dark')
    expect(normalizeTheme('bogus')).toBe('dark')
  })
```

같은 파일 상단 require 구조분해에 `normalizeTheme`를 추가하고 타입도 확장:

```ts
const { BG, nextTheme, bgFor, normalizeTheme } = require('../../desktop/lib/theme.cjs') as {
  BG: { dark: string; light: string }
  nextTheme: (t: 'light' | 'dark') => 'light' | 'dark'
  bgFor: (t: 'light' | 'dark') => string
  normalizeTheme: (mode: unknown) => 'light' | 'dark'
}
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/desktop/theme.test.ts`
Expected: FAIL — `normalizeTheme is not a function`.

- [ ] **Step 3: theme.cjs 구현** — `desktop/lib/theme.cjs`

`bgFor` 아래에 추가하고 exports 갱신:

```js
/** IPC 로 들어온 임의 mode 값을 'light'|'dark' 로 정규화한다('light' 만 light, 그 외 dark). */
function normalizeTheme(mode) {
  return mode === 'light' ? 'light' : 'dark'
}

module.exports = { BG, nextTheme, bgFor, normalizeTheme }
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/desktop/theme.test.ts`
Expected: PASS.

- [ ] **Step 5: preload 에 setTheme 노출** — `desktop/preload.js`

`resize(w, h) { ... },` 블록 바로 아래에 추가:

```js
  setTheme(mode) {
    ipcRenderer.send('tray-set-theme', mode)
  },
```

- [ ] **Step 6: main.js — import + applyThemeAndPersist 추출 + IPC**

(a) import 갱신 (기존 `const { bgFor, nextTheme } = require('./lib/theme.cjs')`):

```js
const { bgFor, nextTheme, normalizeTheme } = require('./lib/theme.cjs')
```

(b) 기존 `toggleTheme` 를 다음으로 교체 (공통 적용부를 헬퍼로 추출 — 트레이 메뉴 토글과 IPC 가 공유):

```js
// 테마를 확정 적용·영속화한다 — 트레이 메뉴 토글과 렌더러 IPC 가 공유하는 단일 경로.
function applyThemeAndPersist(theme) {
  settings = writeSettings(app.getPath('userData'), { theme })
  applyTheme(theme)
  rebuildTrayMenu()
}

function toggleTheme() {
  applyThemeAndPersist(nextTheme(settings.theme))
}
```

(c) `registerIpc()` 안, `ipcMain.on('tray-hide', () => hidePanel())` 아래에 추가:

```js
  // 렌더러 상단 바의 테마 토글 — 특정 테마로 확정 적용·영속(토글 아님). 트레이 메뉴와 동일 경로 공유.
  ipcMain.on('tray-set-theme', (_e, mode) => {
    applyThemeAndPersist(normalizeTheme(mode))
  })
```

- [ ] **Step 7: d.ts 타입 확장** — `src/tray/tray-window.d.ts`

`tray?: { ... }` 블록을 다음으로 교체:

```ts
    tray?: {
      hide(): void
      resize(w: number, h: number): void
      setOpacity(v: number, persist?: boolean): void
      setTheme(mode: 'light' | 'dark'): void
      onOpacity(cb: (v: number) => void): () => void
      onTheme(cb: (theme: 'light' | 'dark') => void): () => void
    }
```

- [ ] **Step 8: 타입체크 + 데스크톱 테스트 + 커밋**

Run: `npx tsc --noEmit` → Expected: 에러 없음
Run: `npx vitest run tests/desktop/` → Expected: 전부 PASS(기존 회귀 없음)
```bash
git add desktop/lib/theme.cjs tests/desktop/theme.test.ts desktop/preload.js desktop/main.js src/tray/tray-window.d.ts
git commit -m "feat(tray): 테마 IPC(tray-set-theme) + setTheme preload/타입 (참조 앱 이식)"
```

---

### Task 3: `TrayTitleBar` 컴포넌트 (이슈 ②③⑤ + 테마 토글)

**Files:**
- Create: `src/tray/TrayTitleBar.tsx`
- Test: `tests/tray/trayTitleBar.test.tsx`

**Interfaces:**
- Consumes: `window.tray.{hide,setOpacity,onOpacity,setTheme}`(Task 2 타입).
- Produces:
  - `interface TrayTitleBarProps { theme: 'light' | 'dark'; popoverOpen: boolean; setPopoverOpen: (open: boolean) => void }`
  - `function TrayTitleBar(props: TrayTitleBarProps): JSX.Element`
  - DOM 계약(다른 태스크·테스트가 참조): 루트 `[data-tray-titlebar]`, 팝오버 `[data-tray-opacity-pop]`, 버튼 `aria-label` = `투명도`/`테마 전환`/`닫기`, 슬라이더 `aria-label="투명도 조절"`.

- [ ] **Step 1: 실패 테스트 작성** — `tests/tray/trayTitleBar.test.tsx`

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrayTitleBar } from '../../src/tray/TrayTitleBar'

function installTray(over: Record<string, unknown> = {}) {
  const tray = {
    hide: vi.fn(),
    setOpacity: vi.fn(),
    setTheme: vi.fn(),
    onOpacity: (cb: (v: number) => void) => { cb(70); return () => {} },
    ...over,
  }
  ;(window as unknown as { tray: unknown }).tray = tray
  return tray
}

describe('TrayTitleBar', () => {
  afterEach(() => { cleanup(); delete (window as { tray?: unknown }).tray })

  it('드래그 영역 루트가 존재한다', () => {
    installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={false} setPopoverOpen={() => {}} />)
    expect(document.querySelector('[data-tray-titlebar]')).toBeTruthy()
  })

  it('닫기(✕) → window.tray.hide()', () => {
    const tray = installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={false} setPopoverOpen={() => {}} />)
    fireEvent.click(screen.getByLabelText('닫기'))
    expect(tray.hide).toHaveBeenCalledTimes(1)
  })

  it('테마 토글 → 현재의 반대 테마로 setTheme', () => {
    const tray = installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={false} setPopoverOpen={() => {}} />)
    fireEvent.click(screen.getByLabelText('테마 전환'))
    expect(tray.setTheme).toHaveBeenCalledWith('light')
  })

  it('🔅 클릭 → setPopoverOpen(true)', () => {
    installTray()
    const setOpen = vi.fn()
    render(<TrayTitleBar theme="dark" popoverOpen={false} setPopoverOpen={setOpen} />)
    fireEvent.click(screen.getByLabelText('투명도'))
    expect(setOpen).toHaveBeenCalledWith(true)
  })

  it('팝오버 열림 시 저장된 투명도(onOpacity)로 슬라이더 복원', () => {
    installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={true} setPopoverOpen={() => {}} />)
    const range = screen.getByLabelText('투명도 조절') as HTMLInputElement
    expect(range.value).toBe('70')
  })

  it('슬라이더 조작 → 실시간 적용(persist=false)', () => {
    const tray = installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={true} setPopoverOpen={() => {}} />)
    fireEvent.change(screen.getByLabelText('투명도 조절'), { target: { value: '55' } })
    expect(tray.setOpacity).toHaveBeenCalledWith(55, false)
  })

  it('슬라이더 놓을 때 → 저장(persist=true)', () => {
    const tray = installTray()
    render(<TrayTitleBar theme="dark" popoverOpen={true} setPopoverOpen={() => {}} />)
    const range = screen.getByLabelText('투명도 조절')
    fireEvent.change(range, { target: { value: '40' } })
    fireEvent.mouseUp(range, { target: { value: '40' } })
    expect(tray.setOpacity).toHaveBeenCalledWith(40, true)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/tray/trayTitleBar.test.tsx`
Expected: FAIL — `Cannot find module '../../src/tray/TrayTitleBar'`.

- [ ] **Step 3: 구현** — `src/tray/TrayTitleBar.tsx`

```tsx
import { useEffect, useRef, useState } from 'react'

interface TrayTitleBarProps {
  theme: 'light' | 'dark'
  popoverOpen: boolean
  setPopoverOpen: (open: boolean) => void
}

/**
 * 얇은 상단 바 — 좌측 드래그 영역(-webkit-app-region:drag, tray.css) + 우측 투명도/테마/닫기.
 * 이슈 ②(투명도 UI)·③(드래그)·⑤(닫기)를 통합한다. window.tray 부재 시 컨트롤은 no-op.
 */
export function TrayTitleBar({ theme, popoverOpen, setPopoverOpen }: TrayTitleBarProps) {
  const [opacity, setOpacity] = useState(100)
  const popRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // 저장된 투명도 복원 — 메인이 did-finish-load 시 tray-opacity 로 푸시(preload onOpacity).
  useEffect(() => {
    return window.tray?.onOpacity?.((v) => setOpacity(v))
  }, [])

  // 팝오버 바깥 클릭·창 리사이즈 시 닫기.
  useEffect(() => {
    if (!popoverOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t) || toggleRef.current?.contains(t)) return
      setPopoverOpen(false)
    }
    const onResize = () => setPopoverOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onResize)
    }
  }, [popoverOpen, setPopoverOpen])

  // 드래그 중(persist=false)엔 적용만, 놓을 때(persist=true)만 저장 — 디스크 난타 방지.
  const applyOpacity = (v: number, persist: boolean) => {
    setOpacity(v)
    window.tray?.setOpacity?.(v, persist)
  }

  return (
    <header className="tray-titlebar" data-tray-titlebar>
      <span className="tray-titlebar-name">스플랜더</span>
      <div className="tray-titlebar-ctrls">
        <button
          ref={toggleRef}
          type="button"
          className="tray-titlebar-btn"
          aria-label="투명도"
          title="투명도"
          tabIndex={-1}
          onClick={() => setPopoverOpen(!popoverOpen)}
        >
          🔅
        </button>
        <button
          type="button"
          className="tray-titlebar-btn"
          aria-label="테마 전환"
          title="테마 전환"
          tabIndex={-1}
          onClick={() => window.tray?.setTheme?.(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button
          type="button"
          className="tray-titlebar-btn"
          aria-label="닫기"
          title="닫기 (Esc)"
          tabIndex={-1}
          onClick={() => window.tray?.hide?.()}
        >
          ✕
        </button>
      </div>
      {popoverOpen && (
        <div className="tray-opacity-pop" ref={popRef} data-tray-opacity-pop>
          <input
            type="range"
            min={30}
            max={100}
            step={1}
            value={opacity}
            aria-label="투명도 조절"
            tabIndex={-1}
            onChange={(e) => applyOpacity(Number(e.target.value), false)}
            onMouseUp={(e) => applyOpacity(Number((e.target as HTMLInputElement).value), true)}
            onKeyUp={(e) => applyOpacity(Number((e.target as HTMLInputElement).value), true)}
          />
          <span className="tray-opacity-val">{opacity}%</span>
        </div>
      )}
    </header>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/tray/trayTitleBar.test.tsx`
Expected: PASS (7개 it 통과).

- [ ] **Step 5: 타입체크 + 커밋**

Run: `npx tsc --noEmit` → Expected: 에러 없음
```bash
git add src/tray/TrayTitleBar.tsx tests/tray/trayTitleBar.test.tsx
git commit -m "feat(tray): TrayTitleBar — 드래그 바·투명도 팝오버·테마·닫기 (이슈 ②③⑤)"
```

---

### Task 4: `TrayApp` 통합 — 상단 바 마운트 + 테마 상태 + Esc(이슈 ⑤)

**Files:**
- Modify: `src/tray/TrayApp.tsx`
- Test: `tests/tray/trayApp.test.tsx` (Esc 케이스 추가), 기존 `tests/tray/trayTheme.test.tsx` 회귀 확인

**Interfaces:**
- Consumes: `TrayTitleBar`(Task 3), `window.tray.{hide,onTheme}`.
- Produces: TrayApp 이 `<TrayTitleBar>` 를 항상 렌더하고 `popoverOpen` 상태를 소유. Esc→(팝오버 닫기|hide).

- [ ] **Step 1: 실패 테스트 추가** — `tests/tray/trayApp.test.tsx`

상단 import 를 다음으로 교체(추가 심볼 반입):

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```

`describe('TrayApp 라우팅', ...)` 아래에 새 describe 추가:

```tsx
describe('TrayApp 상단 바·Esc', () => {
  beforeEach(resetStore)
  afterEach(() => { cleanup(); delete (window as { tray?: unknown }).tray })

  it('상단 바가 항상 렌더된다', () => {
    render(<TrayApp />)
    expect(document.querySelector('[data-tray-titlebar]')).toBeTruthy()
  })

  it('Esc: 팝오버 닫힘 상태면 window.tray.hide()', () => {
    const hide = vi.fn()
    ;(window as unknown as { tray: unknown }).tray = { hide, onTheme: () => () => {}, onOpacity: () => () => {} }
    render(<TrayApp />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('Esc: 팝오버 열림이면 팝오버만 닫고 hide 안 함', () => {
    const hide = vi.fn()
    ;(window as unknown as { tray: unknown }).tray = { hide, onTheme: () => () => {}, onOpacity: () => () => {} }
    render(<TrayApp />)
    fireEvent.click(screen.getByLabelText('투명도')) // 팝오버 열기
    expect(screen.queryByLabelText('투명도 조절')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByLabelText('투명도 조절')).toBeNull()
    expect(hide).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/tray/trayApp.test.tsx`
Expected: FAIL — `[data-tray-titlebar]` 없음 / Esc 무동작.

- [ ] **Step 3: 구현** — `src/tray/TrayApp.tsx` 전체 교체

```tsx
import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { TrayGame } from './screens/TrayGame'
import { TrayResult } from './screens/TrayResult'
import { TraySetup } from './screens/TraySetup'
import { TrayTitleBar } from './TrayTitleBar'
import './tray.css'

/** 테마를 data-theme 로 반영(라이트/다크 팔레트 전환). */
function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme)
}

/** 초기 테마 — 메인 푸시가 있으면 그전 기본 다크(깜빡임 방지), 없으면 prefers-color-scheme. */
function initialTheme(): 'light' | 'dark' {
  if (window.tray?.onTheme) return 'dark'
  const prefersLight =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  return prefersLight ? 'light' : 'dark'
}

export function TrayApp() {
  const committed = useGameStore((s) => s.committed)
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme)
  const [popoverOpen, setPopoverOpen] = useState(false)

  // 테마: 메인(settings.json) 푸시 구독. 없으면 초기 폴백값 유지.
  useEffect(() => {
    return window.tray?.onTheme?.((t) => setTheme(t))
  }, [])
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Esc(이슈 ⑤): 팝오버 열려 있으면 그것만 닫고, 아니면 패널 숨김. 게임 조작 키는 TrayGame 소유.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (popoverOpen) setPopoverOpen(false)
      else window.tray?.hide?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [popoverOpen])

  const screen = !committed ? (
    <TraySetup />
  ) : committed.phase.kind === 'gameOver' ? (
    <TrayResult committed={committed} result={committed.phase.result} />
  ) : (
    <TrayGame committed={committed} />
  )

  return (
    <>
      <TrayTitleBar theme={theme} popoverOpen={popoverOpen} setPopoverOpen={setPopoverOpen} />
      {screen}
    </>
  )
}
```

- [ ] **Step 4: 통과 + 회귀 확인**

Run: `npx vitest run tests/tray/trayApp.test.tsx tests/tray/trayTheme.test.tsx`
Expected: PASS (라우팅·테마 구독 기존 테스트 + 신규 Esc 테스트 모두 통과).

- [ ] **Step 5: 타입체크 + 커밋**

Run: `npx tsc --noEmit` → Expected: 에러 없음
```bash
git add src/tray/TrayApp.tsx tests/tray/trayApp.test.tsx
git commit -m "feat(tray): TrayApp 상단 바 마운트·테마 상태·Esc 닫기 (이슈 ⑤)"
```

---

### Task 5: `TrayGame` 게임 조작 단축키 (이슈 ①)

**Files:**
- Modify: `src/tray/screens/TrayGame.tsx`
- Test: `tests/tray/trayGame.test.tsx` (키보드 케이스 추가)

**Interfaces:**
- Consumes: `resolveShortcut`(Task 1), 기존 `useGameStore`·`useTraySettings`·`legalActions`·`buildPickAction`·`canUndo`·`GEM_COLORS`.
- Produces: 게임 화면에서 `document` keydown 으로 B/O/N·L·U·Enter·P·1~5 조작. Esc 는 무시(TrayApp 소유).

- [ ] **Step 1: 실패 테스트 추가** — `tests/tray/trayGame.test.tsx`

상단 import 에 `fireEvent` 를 추가(기존 라인 교체):

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
```

`shortcuts`/store 확인용 새 describe 를 파일 하단에 추가(헬퍼 `humanVsAi`·`resetStore` 는 기존 파일 것 재사용):

```tsx
describe('TrayGame 단축키', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('B 키 → 보드 펼침 토글', () => {
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    expect(document.querySelector('[data-tray-panel="board"]')).toBeNull()
    fireEvent.keyDown(document, { key: 'b' })
    expect(document.querySelector('[data-tray-panel="board"]')).toBeTruthy()
  })

  it('1 키 → 토큰 집기(내 차례·play)', () => {
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    fireEvent.keyDown(document, { key: '1' })
    expect(useGameStore.getState().pendingPicks).toEqual(['white'])
  })

  it('Ctrl+B 는 무시(수식키)', () => {
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    fireEvent.keyDown(document, { key: 'b', ctrlKey: true })
    expect(document.querySelector('[data-tray-panel="board"]')).toBeNull()
  })
})
```

> 참고: `humanVsAi()`(기존 헬퍼)는 `currentPlayer: 0`(사람)·기본 play 페이즈 상태를 만든다.
> `resetStore`는 `localStorage.clear()`를 포함하므로 `useTraySettings`의 펼침 기본값(board:false)이 보장된다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/tray/trayGame.test.tsx`
Expected: FAIL — 새 3개 it 에서 키 입력이 무동작(리스너 미구현).

- [ ] **Step 3: 구현** — `src/tray/screens/TrayGame.tsx`

(a) import 에 `resolveShortcut` 추가(기존 `useTraySettings` import 아래 줄):

```tsx
import { resolveShortcut } from '../shortcuts'
```

`legalActions`·`buildPickAction`·`canUndo`·`GEM_COLORS` 는 이미 import 되어 있다(파일 상단 확인).

(b) `TrayGame` 함수 본문에서, 기존 `useEffect(() => { ... window.tray?.resize ... }, [expand])` **위**에 다음을 추가.
필요한 스토어 selector 를 추가로 구독한다:

```tsx
  const togglePick = useGameStore((s) => s.togglePick)
  const dispatch = useGameStore((s) => s.dispatch)
  const undo = useGameStore((s) => s.undo)
  const pendingPicks = useGameStore((s) => s.pendingPicks)
  const undoable = useGameStore((s) => canUndo(s))

  // 게임 조작 단축키(이슈 ①) — Esc 는 TrayApp 소유이므로 여기선 무시. 화면 힌트는 노출 안 함.
  const phaseKind = committed.phase.kind
  const passOnly = (() => {
    const legal = legalActions(committed)
    return legal.length === 1 && legal[0]!.type === 'PASS'
  })()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return // TrayApp 소유
      const action = resolveShortcut(
        { key: e.key, hasModifier: e.ctrlKey || e.altKey || e.metaKey },
        {
          popoverOpen: false, // 이 리스너는 Esc 를 다루지 않으므로 미사용
          screen: 'game',
          phase: phaseKind,
          myTurn,
          passOnly,
          undoable,
          hasPending: pendingPicks.length > 0,
        },
      )
      switch (action.type) {
        case 'toggleExpand':
          e.preventDefault(); toggleExpand(action.panel); break
        case 'toggleLang':
          e.preventDefault(); setGemLang(gemCodeLang === 'ko' ? 'en' : 'ko'); break
        case 'undo':
          e.preventDefault(); undo(); break
        case 'confirm': {
          e.preventDefault()
          const a = buildPickAction(pendingPicks)
          if (a) dispatch(a)
          break
        }
        case 'pass':
          e.preventDefault(); dispatch({ type: 'PASS' }); break
        case 'pick':
          e.preventDefault(); togglePick(GEM_COLORS[action.index]!); break
        default:
          break // 'none' | 'hide' | 'closePopover' 무시
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [
    phaseKind, myTurn, passOnly, undoable, pendingPicks,
    gemCodeLang, toggleExpand, setGemLang, undo, dispatch, togglePick,
  ])
```

> 주의: 기존 코드에 `const phase = committed.phase`(객체)와 `const myTurn = ...` 이
> 이미 있다. 새 변수는 `phaseKind`(문자열)로 이름을 달리해 섀도잉을 피한다.
> `gemCodeLang`/`setGemLang`/`expand`/`toggleExpand` 는 기존 `useTraySettings()` 구조분해에서 온다.

- [ ] **Step 4: 통과 + 회귀 확인**

Run: `npx vitest run tests/tray/trayGame.test.tsx`
Expected: PASS (기존 접힘/펼침 뷰 테스트 + 신규 단축키 3개 모두 통과).

- [ ] **Step 5: 타입체크 + 전체 렌더러 테스트 + 커밋**

Run: `npx tsc --noEmit` → Expected: 에러 없음
Run: `npx vitest run tests/tray/` → Expected: 전부 PASS
```bash
git add src/tray/screens/TrayGame.tsx tests/tray/trayGame.test.tsx
git commit -m "feat(tray): TrayGame 게임 조작 단축키 B/O/N·L·U·Enter·P·1~5 (이슈 ①)"
```

---

### Task 6: `tray.css` — 상단 바·팝오버·드래그·가로 스크롤 차단 (이슈 ③④) + 레이아웃 실측

**Files:**
- Modify: `src/tray/tray.css`
- Modify: `src/tray/screens/TrayGame.tsx` (필요 시 `targetSize` 높이 보정 — 실측 후)
- (검증) `.claude/launch.json` (없으면 dev 서버 등록)

**Interfaces:**
- Consumes: Task 3/4/5 의 DOM 클래스(`.tray-titlebar*`, `.tray-opacity-pop*`, `.tray-tier` 등).
- Produces: 드래그 영역(`-webkit-app-region: drag`), 가로 스크롤 차단(`overflow-x: hidden` + 행 래핑).

- [ ] **Step 1: CSS 추가** — `src/tray/tray.css`

(a) 기존 `html, body { ... }` 블록에 `overflow-x: hidden;` 추가:

```css
html,
body {
  margin: 0;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.4;
  overflow-x: hidden; /* 가로 스크롤바 원천 차단(이슈 ④) */
}
```

(b) 기존 `#root { height: 100%; }` 를 다음으로 교체:

```css
#root {
  height: 100%;
  overflow-x: hidden;
}
```

(c) 파일 하단에 상단 바·팝오버 스타일 추가:

```css
/* ── 상단 바(타이틀바) — 드래그 영역 + 투명도/테마/닫기 (이슈 ②③⑤) ── */
.tray-titlebar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 22px;
  padding: 0 6px;
  border-bottom: 1px solid var(--line);
  -webkit-app-region: drag; /* 빈 영역/이름을 잡고 창 이동(main.js movable:true 와 한 쌍) */
  user-select: none;
}
.tray-titlebar-name {
  color: var(--fg-faint);
  font-size: 10px;
}
.tray-titlebar-ctrls {
  display: flex;
  gap: 2px;
  -webkit-app-region: no-drag; /* 버튼은 클릭 가능해야 하므로 드래그에서 제외 */
}
.tray-titlebar-btn {
  -webkit-app-region: no-drag;
  background: transparent;
  border: none;
  color: var(--fg-dim);
  font-size: 11px;
  line-height: 1;
  padding: 2px 3px;
  cursor: pointer;
}
.tray-titlebar-btn:hover {
  color: var(--fg);
}
/* 투명도 팝오버 — 바 아래에 뜬다 */
.tray-opacity-pop {
  position: absolute;
  top: 24px;
  right: 6px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 4px;
  -webkit-app-region: no-drag;
}
.tray-opacity-pop input[type='range'] {
  width: 100px;
  -webkit-app-region: no-drag;
}
.tray-opacity-val {
  color: var(--fg-dim);
  font-size: 10px;
  min-width: 30px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ── 가로 스크롤 방지: 폭 초과 가능 행은 세로로 래핑(클리핑·가로바 동시 차단, 이슈 ④) ── */
.tray-tier,
.tray-take,
.tray-supply,
.tray-toggles,
.tray-seg {
  flex-wrap: wrap;
}
```

- [ ] **Step 2: dev 서버 준비** — `.claude/launch.json` 이 없으면 생성

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "vite", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

- [ ] **Step 3: 미리보기로 가로 스크롤 실측**

`preview_start`(name: `vite`) → `preview_eval`로 트레이 페이지 로드:
`window.location.href = '/tray.html'` (dev 서버가 tray.html 을 서빙).

시작 화면에서 게임을 띄우고 최대 폭 레이아웃(상대 펼침 = 392px)을 만든다:
1. `preview_click` 시작(`.tray-btn-primary`, 라벨 "시작")
2. `preview_click` 로 상대/보드/귀족 토글(`.tray-toggle`) 모두 펼침
3. 각 목표 폭에서 가로 넘침 확인:

`preview_resize` width=392, height=536 → `preview_eval`:
```js
({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })
```
Expected: `sw <= cw` (가로 스크롤 없음). width=260, 250 에서도 반복.

가로 넘침(`sw > cw`)이 남는 행이 있으면, 그 행 선택자에 `flex-wrap: wrap` 또는
`min-width: 0`(텍스트 셀 부모)을 추가하고 Step 3 를 재실행한다.

- [ ] **Step 4: 세로 클리핑 확인 후 필요 시 `targetSize` 보정**

상단 바 22px 만큼 콘텐츠 영역이 줄었다. 각 펼침 조합에서 세로 내용이 잘리는지 확인:
`preview_eval`:
```js
({ bodyH: document.body.scrollHeight, winH: window.innerHeight })
```
잘림이 크면 `src/tray/screens/TrayGame.tsx` 의 `targetSize` 높이(h)에 22 를 더한다:

```tsx
function targetSize(expand: TrayExpand): { w: number; h: number } {
  const w = expand.opponents ? 392 : expand.board || expand.nobles ? 260 : 250
  let h = 178 + 22 // 상단 바 높이 반영
  if (expand.board || expand.opponents) h = 440 + 22
  if (expand.nobles) h += 96
  return { w, h }
}
```

(세로는 `overflow-y: auto` 로 스크롤 허용되므로 이 보정은 "잘림이 눈에 띌 때만" 적용.
가로 스크롤 부재가 이 태스크의 필수 합격선이다.)

- [ ] **Step 5: 드래그 영역·no-drag 확인**

`preview_inspect` selector `.tray-titlebar` styles `['-webkit-app-region']` → Expected: `drag`.
`preview_inspect` selector `.tray-titlebar-btn` styles `['-webkit-app-region']` → Expected: `no-drag`.
(브라우저에선 실제 창 이동은 불가 — 속성 존재만 확인. 실제 드래그는 Step 7 실기기.)

- [ ] **Step 6: 전체 테스트 + 타입체크 + 린트 + 커밋**

Run: `npx vitest run` → Expected: 전부 PASS
Run: `npx tsc --noEmit` → Expected: 에러 없음
Run: `npm run lint` → Expected: 에러 없음
```bash
git add src/tray/tray.css src/tray/screens/TrayGame.tsx .claude/launch.json
git commit -m "feat(tray): 상단 바·투명도 팝오버 스타일 + 가로 스크롤 차단 (이슈 ③④)"
```

- [ ] **Step 7: 실기기 수동 검증 체크리스트(문서화, 자동화 불가 항목)**

Electron 패키지/개발 실행(`cd desktop && npm start` 또는 빌드)에서 확인:
- [ ] 상단 바 빈 영역을 드래그해 창이 이동, 놓은 위치가 재표시 시 복원(이슈 ③)
- [ ] 🔅 슬라이더로 30~100% 투명도 실시간 변경·재실행 후 유지(이슈 ②)
- [ ] ☀️/🌙 로 테마 전환, 트레이 메뉴 "라이트 모드" 체크와 동기화
- [ ] ESC 로 즉시 숨김, 팝오버 열려 있으면 팝오버만 닫힘(이슈 ⑤)
- [ ] 게임 중 B/O/N·L·U·Enter·P·1~5 조작 동작, 다른 앱 포커스에선 전역 보스키만 반응(이슈 ①)
- [ ] 어떤 펼침 조합에서도 가로 스크롤바가 나타나지 않음(이슈 ④)

---

## Self-Review

**1. Spec coverage:**
- 이슈 ①(인패널 단축키): Task 1(매핑) + Task 5(TrayGame 배선) ✅
- 이슈 ②(투명도 UI): Task 3(슬라이더 팝오버) — 메인 IPC 는 기존 ✅
- 이슈 ③(드래그): Task 3(마크업) + Task 6(`-webkit-app-region: drag`) ✅
- 이슈 ④(가로 스크롤): Task 6(`overflow-x` + 래핑 + 실측) ✅
- 이슈 ⑤(ESC): Task 4(TrayApp Esc) + Task 3(✕ 버튼) ✅
- 테마 이식: Task 2(IPC/preload/타입) + Task 3(토글 버튼) + Task 4(상태) ✅
- 힌트 숨김: Task 3(`title` 만), 화면 표기 없음 ✅
- 트레이 메뉴 불변: 어느 태스크도 `trayMenu.cjs` 미변경 ✅

**2. Placeholder scan:** TBD/TODO/"적절히"류 없음. 모든 코드 스텝에 실제 코드 포함. ✅

**3. Type consistency:**
- `resolveShortcut(input, ctx)` 시그니처가 Task 1 정의 = Task 5 호출부 일치 ✅
- `ShortcutAction` 판별 유니온의 `toggleExpand.panel`·`pick.index` 가 Task 5 switch 와 일치 ✅
- `TrayTitleBarProps { theme, popoverOpen, setPopoverOpen }` 가 Task 3 정의 = Task 4 사용부 일치 ✅
- `window.tray.setTheme/onOpacity/onTheme` 반환형(Task 2 d.ts)이 Task 3/4 소비와 일치(`() => void` cleanup) ✅
- `normalizeTheme`(Task 2) → main.js IPC 소비 일치 ✅
- `GEM_COLORS` 인덱스 0..4 = 흰/파/초/빨/검, Task 5 `togglePick(GEM_COLORS[i])` 일치 ✅
