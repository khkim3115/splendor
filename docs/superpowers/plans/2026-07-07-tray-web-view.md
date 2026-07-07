# 트레이 웹 뷰 (src/tray/) Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Execute one Task at a time in a fresh subagent context. Follow the bite-sized steps in order; each step is a single 2–5 minute action. Check off each step (`- [ ]` → `- [x]`) as you complete it. TDD is mandatory: write the failing test, confirm it fails with the exact command shown, write the minimal implementation, confirm it passes, then commit. Do not batch steps. Do not skip the "confirm it fails" step.

## Goal

Electron 없이 **브라우저에서 완결·테스트 가능한** 무채색 압축 React 트레이 뷰(`src/tray/`)를 구현한다. 기존 `useGameStore`(엔진·AI·스토어·세이브)를 **그대로 소비**하고, 색 없는(글자코드) 초압축 UI만 신규 작성한다. Electron 셸(Plan 2)이 붙기 전에도 `tray.html`을 브라우저로 열어 완전한 vs-AI 게임을 플레이할 수 있어야 한다. `window.tray?.*` 접합면은 셸이 없으면 조용히 no-op이 된다.

## Architecture

- **진입점**: 저장소 루트 `tray.html`(스크립트 `src/tray/main.tsx`) → `#root`에 `<TrayApp/>` 마운트. 기존 `index.html`/`src/main.tsx`와 평행.
- **라우팅**: `TrayApp`이 `useGameStore((s)=>s.committed)`를 구독해 `App.tsx`를 미러 — `committed==null` → `TraySetup` / `phase.kind==='gameOver'` → `TrayResult` / 그 외 → `TrayGame`. 트레이는 항상 사람 1명이므로 `handoffPending`은 발생하지 않고, 핸드오프 오버레이·비공개 마스킹 UI가 불필요하다.
- **순수 포매팅**: `src/tray/format.ts` — 보석 글자코드 맵(ko/en), 압축 카드 표기, 플레이어 요약 한 줄. jsdom 불필요 순수 함수.
- **설정 영속**: `src/tray/useTraySettings.ts` — 글자코드 언어(ko/en)·펼침 상태를 `localStorage('splendor:tray')`에 저장.
- **테마**: `tray.css`가 루트 `[data-theme="light|dark"]`로 라이트/다크 2종 무채색 팔레트를 분기. `TrayApp`이 `window.tray?.onTheme(cb)`로 메인이 푸시한 테마를 받아 루트 `data-theme` 갱신(기본 다크; 브라우저 단독 실행은 `prefers-color-scheme` 폴백).
- **창 리사이즈 접합면**: 펼침 상태가 바뀌면 뷰가 목표 크기를 계산해 `window.tray?.resize(w, h)` 호출(존재할 때만 — 브라우저에선 no-op).
- **멀티페이지 빌드**: `vite.config.ts`의 `build.rollupOptions.input = { main: 'index.html', tray: 'tray.html' }`.

## Tech Stack

- **React 19** + **Zustand 5**(기존 `useGameStore` 재사용, 스토어 무변경).
- **Vite 8**(멀티페이지 input), **TypeScript 5.9**(`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`). `verbatimModuleSyntax` 때문에 **타입 전용 심볼은 반드시 인라인 `type` 한정자 또는 `import type`으로** 가져온다.
- **Vitest 4** — 설정 기본 env는 `node`(`vite.config.ts`의 `test.environment: 'node'`). 순수함수 테스트(`tests/tray/format.test.ts`)는 그대로 node, React 컴포넌트 테스트(`tests/tray/*.tsx`)는 **파일 첫 줄** `// @vitest-environment jsdom` + `@testing-library/react` + `@testing-library/user-event`.
- 빌드는 `npm run build` = `tsc -b && vite build`. `tsc -b`가 `tsconfig.app.json`(include `src`)·`tsconfig.test.json`(include `tests`,`src`)를 모두 타입체크하므로, **트레이 소스·테스트·`.d.ts`가 전부 통과해야 빌드가 성공**한다.
- 엔진 공개 API는 `src/engine`(barrel `src/engine/index.ts`), 스토어는 `src/store/gameStore`(`useGameStore`, `canUndo`, `buildPickAction`, `viewerIndexFor`), 세이브는 `src/store/persistence`(`hasSave`).

## Global Constraints

- 엔진·AI·스토어·세이브 로직 무변경(그대로 재사용). — 스펙 §범위
- 은밀성 = "위장"이 아니라 "최소 존재감"(극소형·무채색·모노스페이스) + 점진적 공개. — 스펙 핵심 철학
- 색 사용: 무채색(채도 없음) — 라이트/다크 2종 팔레트. 보석은 색이 아니라 **글자코드**로 표기. — 스펙 확정 결정
- 글자코드 언어: 한/영 토글(기본 한글). 렌더러 설정(localStorage). — 스펙 확정 결정
- 게임 범위: 나(사람 1) + AI 1~3명 = 2~4인, 난이도(쉬움/보통/어려움) 선택. — 스펙 확정 결정
- 화면 노출: 평소 접힘(최소 정보) → 버튼으로 보드/상대/귀족 펼침(창 리사이즈). — 스펙 확정 결정
- 세이브: 기존 localStorage 세이브 재사용 — 다시 열면 이어하기. — 스펙 확정 결정
- 컬러 보드(`src/ui/*`)는 미사용. 무채색 트레이 뷰를 신규 작성(`src/ui/screens/*`·`src/ui/**`·`styles.css`를 import하지 않는다). — 스펙 확정 결정
- 설정 화면의 `GameConfig` 구성은 기존 `SetupScreen`의 좌석 어휘(`human`/`easy`/`normal`/`hard`)·구성 규칙(사람1 + AI n-1)을 따른다(중복 룰 금지). — 공유 계약
- 룰 판정은 엔진으로만 — 룰의 두 번째 표현을 만들지 않는다. 액션은 `dispatch`/`togglePick`/`buildPickAction`을 거쳐 엔진 `validateAction`이 판정한다. — ARCHITECTURE §4 경계 규약

## 공유 계약 조정 노트 (실행 전 반드시 읽을 것)

- **format.ts `GEM_CODE`/`gemCode` 시그니처**: 공유 계약 초안은 `GEM_CODE: Record<GemLang, Record<GemColor, string>>`·`gemCode(color: GemColor, lang)`로 적었으나, **황금(gold, 조커) 토큰까지 코드가 필요**하다(공급 표시·토큰 요약에서 `노`/`Y` 사용). 따라서 이 계획은 도메인 타입을 `TokenColor`(= `GemColor | 'gold'`)로 **확장**한다. `TokenColor`는 `GemColor`의 상위집합이므로 `GemColor`를 넘기는 모든 호출부와 호환된다(계약 위반 아님, 계약의 표기 정밀화). `cardCode(card, lang)`·`playerLine(view, playerIndex, lang)` 시그니처는 계약과 동일하다.
- **`window.tray` API 형태**는 Plan 2 계약과 정확히 일치: `{ hide(), resize(w,h), setOpacity(v, persist?), onOpacity(cb), onTheme(cb) }`. Plan 1은 `resize`·`onTheme`만 호출하며 항상 `window.tray?.` 옵셔널 체이닝을 쓴다.
- **`.claude/launch.json`은 이미 존재**한다(`splendor-dev`, `npm run dev`, port 5173). Task 11은 이 기존 설정을 **재사용**하고 `/tray.html` 경로만 연다(신규 config 추가 금지).
- **`vite.config.ts`의 `base: '/splendor/'`는 유지**한다(웹 배포용). 데스크톱 `--base=./` 빌드는 Plan 2 범위. Plan 1은 `base`를 건드리지 않고 `build.rollupOptions.input`만 추가한다.

---

## Task 1 — format.ts: 보석 글자코드 맵 (GEM_CODE / gemCode)

보석 색을 무채색 글자코드로 매핑하는 순수 함수. ko = `흰파초빨검노`, en = `W B G R K Y`. `TokenColor`(gold 포함 6색)를 다룬다(위 조정 노트 참조).

**Files**
- Create: `src/tray/format.ts`
- Create: `tests/tray/format.test.ts`

**Interfaces**
- Consumes: `import type { TokenColor } from '../engine'`
- Produces:
  - `export type GemLang = 'ko' | 'en'`
  - `export const GEM_CODE: Record<GemLang, Record<TokenColor, string>>`
  - `export function gemCode(color: TokenColor, lang: GemLang): string`

**Steps**

- [ ] 실패 테스트 작성. `tests/tray/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { GEM_CODE, gemCode } from '../../src/tray/format'
import { GEM_COLORS, TOKEN_COLORS } from '../../src/engine'

describe('gemCode / GEM_CODE', () => {
  it('한글 5색 코드 = 흰파초빨검', () => {
    expect(GEM_COLORS.map((c) => gemCode(c, 'ko')).join('')).toBe('흰파초빨검')
  })

  it('영문 5색 코드 = WBGRK (검정=K)', () => {
    expect(GEM_COLORS.map((c) => gemCode(c, 'en')).join('')).toBe('WBGRK')
  })

  it('황금(조커)은 ko 노 / en Y', () => {
    expect(gemCode('gold', 'ko')).toBe('노')
    expect(gemCode('gold', 'en')).toBe('Y')
  })

  it('GEM_CODE는 6색(gold 포함) 전부를 두 언어로 정의한다', () => {
    for (const lang of ['ko', 'en'] as const) {
      for (const c of TOKEN_COLORS) {
        expect(typeof GEM_CODE[lang][c]).toBe('string')
        expect(GEM_CODE[lang][c].length).toBeGreaterThan(0)
      }
    }
  })
})
```

- [ ] 실패 확인. 명령: `npm test -- tests/tray/format.test.ts`
  기대: `Failed to resolve import "../../src/tray/format"` 로 테스트 파일 수집 실패(4개 전부 실패/미실행).

- [ ] 최소 구현. `src/tray/format.ts`:
```ts
// 무채색 압축 표기 — 보석을 색이 아니라 글자코드로 나타낸다 (스펙 §보석 글자코드 매핑)
// ko: 색 이름 첫 글자(흰/파/초/빨/검/노), en: 색 첫 글자(파랑/검정 충돌은 검정=K, CMYK 관습)

import type { TokenColor } from '../engine'

export type GemLang = 'ko' | 'en'

export const GEM_CODE: Record<GemLang, Record<TokenColor, string>> = {
  ko: { white: '흰', blue: '파', green: '초', red: '빨', black: '검', gold: '노' },
  en: { white: 'W', blue: 'B', green: 'G', red: 'R', black: 'K', gold: 'Y' },
}

export function gemCode(color: TokenColor, lang: GemLang): string {
  return GEM_CODE[lang][color]
}
```

- [ ] 통과 확인. 명령: `npm test -- tests/tray/format.test.ts`
  기대: `4 passed`.

- [ ] 커밋. `git add src/tray/format.ts tests/tray/format.test.ts && git commit -m "feat(tray): 보석 글자코드 맵 GEM_CODE/gemCode (이슈 #16)"`

---

## Task 2 — format.ts: 압축 카드 표기 (cardCode) + 플레이어 요약 (playerLine)

카드를 `명성보너스|비용`으로 초압축(`3초|흰3빨2검1`, 명성 0이면 앞의 명성 숫자 생략 → `초|흰3빨2검1`). 플레이어를 한 줄 요약(점수·보너스·토큰·예약 수)한다.

**Files**
- Modify: `src/tray/format.ts`
- Modify: `tests/tray/format.test.ts`

**도메인 사실(검증됨)**
- `Card`(engine): `{ id, tier: 1|2|3, points: number, bonus: GemColor, cost: GemMap }`. `cost`는 5색 `GemMap`.
- `PlayerState`: `{ tokens: TokenMap, purchased, reserved: readonly ReservedCard[], nobles, bonuses: GemMap, prestige }`.
- `GEM_COLORS`(5색, white→black), `TOKEN_COLORS`(gold 포함 6색)로 색 순서를 잡고, 값이 0인 색은 생략한다.

**Interfaces**
- Consumes: `import { GEM_COLORS, TOKEN_COLORS, type Card, type GameState, type GemMap, type TokenColor, type TokenMap } from '../engine'`
- Produces:
  - `export function cardCode(card: Card, lang: GemLang): string`
  - `export function playerLine(view: GameState, playerIndex: number, lang: GemLang): string`

**Steps**

- [ ] 실패 테스트 추가. `tests/tray/format.test.ts` 하단에 append(import는 파일 상단 기존 import 블록에 합쳐도 되고, 아래처럼 하단에 추가해도 된다):
```ts
import { cardCode, playerLine } from '../../src/tray/format'
import { baseState, patchPlayer, gems, tokens } from '../helpers'
import type { Card } from '../../src/engine'

describe('cardCode', () => {
  it('명성보너스|비용 — 명성 있으면 앞에 숫자가 붙는다', () => {
    const card: Card = { id: 99, tier: 3, points: 3, bonus: 'green', cost: gems({ white: 3, red: 2, black: 1 }) }
    expect(cardCode(card, 'ko')).toBe('3초|흰3빨2검1')
    expect(cardCode(card, 'en')).toBe('3G|W3R2K1')
  })

  it('명성 0이면 명성 숫자 생략, 보너스|비용만', () => {
    const card: Card = { id: 98, tier: 1, points: 0, bonus: 'white', cost: gems({ red: 2, black: 1 }) }
    expect(cardCode(card, 'ko')).toBe('흰|빨2검1')
  })
})

describe('playerLine', () => {
  it('점수·보너스·토큰·예약 수를 한 줄로 요약한다', () => {
    const base = baseState(2, 42)
    const s = patchPlayer(base, 1, {
      prestige: 5,
      bonuses: gems({ white: 2, green: 1 }),
      tokens: tokens({ red: 3, gold: 1 }),
      reserved: [{ cardId: base.decks[0]![0]!, fromDeck: true }],
    })
    const line = playerLine(s, 1, 'ko')
    expect(line).toContain('5점')
    expect(line).toContain('흰2')
    expect(line).toContain('초1')
    expect(line).toContain('빨3')
    expect(line).toContain('노1')
    expect(line).toContain('예약1')
  })

  it('보너스·토큰이 없으면 자리표시 -, 점수/예약0도 항상 표기(en)', () => {
    const s = baseState(2, 42)
    const line = playerLine(s, 0, 'en')
    expect(line).toContain('0pt')
    expect(line).toContain('예약0')
  })
})
```

- [ ] 실패 확인. 명령: `npm test -- tests/tray/format.test.ts`
  기대: Task 1의 4개는 통과, `cardCode`/`playerLine` 관련 4개가 `cardCode`/`playerLine`이 export되지 않아 실패(총 `4 passed / 4 failed` 또는 수집 단계 실패).

- [ ] 구현. `src/tray/format.ts` 상단 import를 아래로 교체(기존 `import type { TokenColor } from '../engine'` 한 줄 대체):
```ts
import { GEM_COLORS, TOKEN_COLORS, type Card, type GameState, type GemMap, type TokenColor, type TokenMap } from '../engine'
```
`GemLang`/`GEM_CODE`/`gemCode`는 그대로 유지. 파일 하단에 추가:
```ts
/** GemMap을 "흰3빨2검1"처럼 0 아닌 색만 코드+수량으로 잇는다 (색 순서 = GEM_COLORS) */
function gemMapCode(map: GemMap, lang: GemLang): string {
  return GEM_COLORS.filter((c) => map[c] > 0)
    .map((c) => `${gemCode(c, lang)}${map[c]}`)
    .join('')
}

/** TokenMap을 "빨3노1"처럼 0 아닌 색만 잇는다 (gold 포함, 순서 = TOKEN_COLORS) */
function tokenMapCode(map: TokenMap, lang: GemLang): string {
  return TOKEN_COLORS.filter((c: TokenColor) => map[c] > 0)
    .map((c) => `${gemCode(c, lang)}${map[c]}`)
    .join('')
}

/** 카드 초압축: "명성보너스|비용" — 명성 0이면 명성 숫자 생략 (스펙 §보석 글자코드 매핑) */
export function cardCode(card: Card, lang: GemLang): string {
  const head = card.points > 0 ? `${card.points}${gemCode(card.bonus, lang)}` : gemCode(card.bonus, lang)
  return `${head}|${gemMapCode(card.cost, lang)}`
}

/** 상대(또는 나) 요약 한 줄: "5점 흰2초1 · 빨3노1 · 예약1" (en은 "5pt …") */
export function playerLine(view: GameState, playerIndex: number, lang: GemLang): string {
  const p = view.players[playerIndex]!
  const score = lang === 'ko' ? `${p.prestige}점` : `${p.prestige}pt`
  const bonuses = gemMapCode(p.bonuses, lang) || '-'
  const toks = tokenMapCode(p.tokens, lang) || '-'
  return `${score} ${bonuses} · ${toks} · 예약${p.reserved.length}`
}
```
주의: `cardCode`는 `points>0`일 때만 head에 명성 숫자를 붙인다. `playerLine`은 점수를 항상 표기하므로 `prestige===0`이면 `0점`/`0pt`가 된다.

- [ ] 통과 확인. 명령: `npm test -- tests/tray/format.test.ts`
  기대: `8 passed`.

- [ ] 커밋. `git add src/tray/format.ts tests/tray/format.test.ts && git commit -m "feat(tray): 압축 카드 표기 cardCode·플레이어 요약 playerLine (이슈 #16)"`

---

## Task 3 — useTraySettings: 글자코드 언어 + 펼침 상태 localStorage 영속

렌더러 소유 설정을 `localStorage('splendor:tray')`에 저장하는 React 훅. 값 형태 `{ gemCodeLang: GemLang, expand: { board, opponents, nobles } }`.

**Files**
- Create: `src/tray/useTraySettings.ts`
- Create: `tests/tray/useTraySettings.test.tsx`

**Interfaces**
- Consumes: `import type { GemLang } from './format'`
- Produces:
  - `export interface TrayExpand { board: boolean; opponents: boolean; nobles: boolean }`
  - `export interface TraySettings { gemCodeLang: GemLang; setGemLang(l: GemLang): void; expand: TrayExpand; toggleExpand(k: keyof TrayExpand): void }`
  - `export const TRAY_SETTINGS_KEY = 'splendor:tray'`
  - `export function useTraySettings(): TraySettings`

**Steps**

- [ ] 실패 테스트 작성. `tests/tray/useTraySettings.test.tsx`:
```tsx
// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TRAY_SETTINGS_KEY, useTraySettings } from '../../src/tray/useTraySettings'

describe('useTraySettings', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('기본값: 한글 코드, 전부 접힘', () => {
    const { result } = renderHook(() => useTraySettings())
    expect(result.current.gemCodeLang).toBe('ko')
    expect(result.current.expand).toEqual({ board: false, opponents: false, nobles: false })
  })

  it('setGemLang이 상태와 localStorage를 갱신한다', () => {
    const { result } = renderHook(() => useTraySettings())
    act(() => result.current.setGemLang('en'))
    expect(result.current.gemCodeLang).toBe('en')
    expect(JSON.parse(localStorage.getItem(TRAY_SETTINGS_KEY)!).gemCodeLang).toBe('en')
  })

  it('toggleExpand이 해당 키만 뒤집는다', () => {
    const { result } = renderHook(() => useTraySettings())
    act(() => result.current.toggleExpand('board'))
    expect(result.current.expand.board).toBe(true)
    expect(result.current.expand.opponents).toBe(false)
    act(() => result.current.toggleExpand('board'))
    expect(result.current.expand.board).toBe(false)
  })

  it('초기 마운트가 저장된 값을 읽어온다', () => {
    localStorage.setItem(
      TRAY_SETTINGS_KEY,
      JSON.stringify({ gemCodeLang: 'en', expand: { board: true, opponents: false, nobles: true } }),
    )
    const { result } = renderHook(() => useTraySettings())
    expect(result.current.gemCodeLang).toBe('en')
    expect(result.current.expand).toEqual({ board: true, opponents: false, nobles: true })
  })

  it('손상된 저장값은 기본값으로 폴백한다', () => {
    localStorage.setItem(TRAY_SETTINGS_KEY, '{not json')
    const { result } = renderHook(() => useTraySettings())
    expect(result.current.gemCodeLang).toBe('ko')
  })
})
```

- [ ] 실패 확인. 명령: `npm test -- tests/tray/useTraySettings.test.tsx`
  기대: `Failed to resolve import "../../src/tray/useTraySettings"` 로 전부 실패.

- [ ] 최소 구현. `src/tray/useTraySettings.ts`:
```ts
// 렌더러 소유 설정 영속 (스펙 §데이터 흐름: 글자코드 언어는 렌더러 localStorage)
// 테마·투명도는 Electron 메인 소유 — 여기서 다루지 않는다.

import { useCallback, useState } from 'react'
import type { GemLang } from './format'

export const TRAY_SETTINGS_KEY = 'splendor:tray'

export interface TrayExpand {
  board: boolean
  opponents: boolean
  nobles: boolean
}

interface Persisted {
  gemCodeLang: GemLang
  expand: TrayExpand
}

export interface TraySettings {
  gemCodeLang: GemLang
  setGemLang: (l: GemLang) => void
  expand: TrayExpand
  toggleExpand: (k: keyof TrayExpand) => void
}

const DEFAULTS: Persisted = {
  gemCodeLang: 'ko',
  expand: { board: false, opponents: false, nobles: false },
}

function read(): Persisted {
  try {
    const raw = localStorage.getItem(TRAY_SETTINGS_KEY)
    if (raw === null) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Persisted>
    const lang: GemLang = parsed.gemCodeLang === 'en' ? 'en' : 'ko'
    const e = parsed.expand ?? {}
    return {
      gemCodeLang: lang,
      expand: {
        board: e.board === true,
        opponents: e.opponents === true,
        nobles: e.nobles === true,
      },
    }
  } catch {
    return DEFAULTS
  }
}

function write(next: Persisted): void {
  try {
    localStorage.setItem(TRAY_SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // 저장 실패는 무시 (게임 진행을 막지 않는다)
  }
}

export function useTraySettings(): TraySettings {
  const [state, setState] = useState<Persisted>(read)

  const setGemLang = useCallback((l: GemLang) => {
    setState((prev) => {
      const next = { ...prev, gemCodeLang: l }
      write(next)
      return next
    })
  }, [])

  const toggleExpand = useCallback((k: keyof TrayExpand) => {
    setState((prev) => {
      const next = { ...prev, expand: { ...prev.expand, [k]: !prev.expand[k] } }
      write(next)
      return next
    })
  }, [])

  return { gemCodeLang: state.gemCodeLang, setGemLang, expand: state.expand, toggleExpand }
}
```

- [ ] 통과 확인. 명령: `npm test -- tests/tray/useTraySettings.test.tsx`
  기대: `5 passed`.

- [ ] 커밋. `git add src/tray/useTraySettings.ts tests/tray/useTraySettings.test.tsx && git commit -m "feat(tray): useTraySettings — 글자코드 언어·펼침 상태 localStorage 영속 (이슈 #16)"`

---

## Task 4 — window.tray 타입 선언 + tray.html + vite input + TrayApp 라우팅 (RED 먼저)

트레이 진입점과 멀티페이지 input을 만들고, `TrayApp`이 `committed`를 구독해 세 화면 중 하나를 렌더하도록 배선한다. 이 Task는 세 화면을 **최소 스텁**으로 두고 라우팅만 검증한다. **TDD 준수를 위해, 스텁을 만들기 전에 먼저 테스트를 작성해 RED를 확인**한다(진입점·타입 선언만 먼저, 화면 스텁은 GREEN 단계에서 생성).

**Files**
- Create: `src/tray/tray-window.d.ts`
- Create: `tray.html`
- Create: `src/tray/main.tsx`
- Create: `src/tray/TrayApp.tsx`
- Create: `src/tray/screens/TraySetup.tsx` (스텁)
- Create: `src/tray/screens/TrayGame.tsx` (스텁)
- Create: `src/tray/screens/TrayResult.tsx` (스텁)
- Create: `src/tray/tray.css` (빈 스텁 — Task 11에서 채움)
- Modify: `vite.config.ts`
- Create: `tests/tray/trayApp.test.tsx`

**Interfaces**
- Consumes: `useGameStore` from `../store/gameStore`
- Produces: `export function TrayApp()`, `export function TraySetup()`, `export function TrayGame({ committed })`, `export function TrayResult({ committed, result })`

**Steps**

- [ ] `window.tray` 전역 타입 선언 먼저 생성. `src/tray/tray-window.d.ts`(Plan 2 preload 계약과 정확히 일치):
```ts
// Electron preload가 노출하는 window.tray API (Plan 2 소유 — Plan 1은 존재할 때만 호출)
export {}

declare global {
  interface Window {
    tray?: {
      hide(): void
      resize(w: number, h: number): void
      setOpacity(v: number, persist?: boolean): void
      onOpacity(cb: (v: number) => void): void
      onTheme(cb: (theme: 'light' | 'dark') => void): void
    }
  }
}
```

- [ ] 실패 테스트 작성. `tests/tray/trayApp.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TrayApp } from '../../src/tray/TrayApp'
import { useGameStore } from '../../src/store/gameStore'
import { baseState } from '../helpers'

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    lastEvents: [], pendingPicks: [], selectedCard: null, selectedDeck: null,
    handoffPending: false, aiThinking: false, aiSeq: 0, lastError: null,
  })
}

describe('TrayApp 라우팅', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('committed==null → 설정 화면', () => {
    render(<TrayApp />)
    expect(document.querySelector('[data-tray-screen="setup"]')).toBeTruthy()
  })

  it('진행 중 → 게임 화면', () => {
    useGameStore.setState({ committed: baseState(2, 42) })
    render(<TrayApp />)
    expect(document.querySelector('[data-tray-screen="game"]')).toBeTruthy()
  })

  it('gameOver → 결과 화면', () => {
    const s = baseState(2, 42, {
      phase: {
        kind: 'gameOver',
        result: {
          winners: [0],
          scores: [
            { prestige: 15, purchasedCount: 8 },
            { prestige: 10, purchasedCount: 6 },
          ],
          reason: 'prestige15',
        },
      },
    })
    useGameStore.setState({ committed: s })
    render(<TrayApp />)
    expect(document.querySelector('[data-tray-screen="result"]')).toBeTruthy()
  })
})
```

- [ ] 실패 확인. 명령: `npm test -- tests/tray/trayApp.test.tsx`
  기대: `Failed to resolve import "../../src/tray/TrayApp"` 로 3개 전부 실패(스텁·TrayApp 미존재).

- [ ] `vite.config.ts` 수정 — `plugins` 아래에 `build.rollupOptions.input` 블록을 삽입한다(기존 `base: '/splendor/'`·`worker`·`test`는 유지):
```ts
  base: '/splendor/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        tray: 'tray.html',
      },
    },
  },
  worker: {
    format: 'es',
  },
```

- [ ] `tray.html` 생성(저장소 루트):
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>스플랜더 트레이</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/tray/main.tsx"></script>
  </body>
</html>
```

- [ ] 스텁 화면 3개 생성.
  `src/tray/screens/TraySetup.tsx`:
```tsx
export function TraySetup() {
  return <div data-tray-screen="setup">설정</div>
}
```
  `src/tray/screens/TrayGame.tsx`:
```tsx
import type { GameState } from '../../engine'

export function TrayGame({ committed }: { committed: GameState }) {
  return <div data-tray-screen="game">게임 (턴 {committed.turn})</div>
}
```
  `src/tray/screens/TrayResult.tsx`:
```tsx
import type { GameResult, GameState } from '../../engine'

export function TrayResult({ committed, result }: { committed: GameState; result: GameResult }) {
  const winner = committed.config.players[result.winners[0]!]?.name ?? '?'
  return <div data-tray-screen="result">결과 · 승자 {winner}</div>
}
```

- [ ] `src/tray/tray.css` 빈 파일 생성:
```css
/* 트레이 무채색 스타일 — Task 11에서 채운다 */
```

- [ ] `TrayApp.tsx` 생성. `src/tray/TrayApp.tsx`:
```tsx
import { useGameStore } from '../store/gameStore'
import { TrayGame } from './screens/TrayGame'
import { TrayResult } from './screens/TrayResult'
import { TraySetup } from './screens/TraySetup'
import './tray.css'

export function TrayApp() {
  const committed = useGameStore((s) => s.committed)

  if (!committed) return <TraySetup />
  if (committed.phase.kind === 'gameOver') {
    return <TrayResult committed={committed} result={committed.phase.result} />
  }
  return <TrayGame committed={committed} />
}
```

- [ ] `main.tsx` 생성. `src/tray/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TrayApp } from './TrayApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrayApp />
  </StrictMode>,
)
```

- [ ] 통과 확인. 명령: `npm test -- tests/tray/trayApp.test.tsx`
  기대: `3 passed`.

- [ ] 타입 확인(전역 `window.tray` 선언 + 트레이 소스가 `tsc -b`에 포함되는지). 명령: `npm run typecheck`
  기대: 종료코드 0.

- [ ] 빌드 스모크 — 멀티페이지 input 검증. 명령: `npm run build`
  기대: 종료코드 0. `dist/index.html`과 `dist/tray.html`이 함께 생성된다. 확인: `ls dist/*.html` → 두 파일 출력.

- [ ] 커밋. `git add tray.html vite.config.ts src/tray tests/tray/trayApp.test.tsx && git commit -m "feat(tray): tray.html 진입점·TrayApp 라우팅·vite 멀티페이지 input·window.tray 타입 (이슈 #16)"`

---

## Task 5 — TraySetup: 인원·난이도·시작·이어하기 (SetupScreen 규칙 공유)

설정 화면을 실제 구현으로 채운다. 인원(2·3·4) 세그먼트, 난이도(쉬움/보통/어려움) 세그먼트, [시작], `hasSave()`일 때만 [이어하기]. `GameConfig`는 **사람 1 + AI n-1**(전원 선택 난이도)로 구성하고 `newGame`에 넘긴다 — `SetupScreen`의 좌석 어휘(`human`/`easy`/`normal`/`hard`)·시드 생성(`crypto.getRandomValues`)을 그대로 따른다.

**검증된 사실**
- `useGameStore.newGame(config)`는 동기 함수: `setupGame` → 즉시 `saveGame` → `set({committed:…})` → `maybeRunAi()`. 사람(0)이 선이면 AI 라우팅 no-op이라 `committed`가 즉시 채워진다.
- `loadSaved(): string | null` — 실패 사유 문자열 반환, 성공 시 `null`.
- `PlayerKind` = `{type:'human',name}` | `{type:'ai',name,difficulty}`. `GameConfig = { players, seed:number }`.

**Files**
- Modify: `src/tray/screens/TraySetup.tsx`
- Create: `tests/tray/traySetup.test.tsx`

**Interfaces**
- Consumes: `useGameStore` (`newGame`, `loadSaved`), `hasSave` from `../../store/persistence`, `import type { Difficulty, GameConfig, PlayerKind } from '../../engine'`

**Steps**

- [ ] 실패 테스트 작성. `tests/tray/traySetup.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TraySetup } from '../../src/tray/screens/TraySetup'
import { setAiDelayScale } from '../../src/ai/client'
import { useGameStore } from '../../src/store/gameStore'

setAiDelayScale(0)

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    lastEvents: [], pendingPicks: [], selectedCard: null, selectedDeck: null,
    handoffPending: false, aiThinking: false, aiSeq: 0, lastError: null,
  })
}

describe('TraySetup', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('3인 + 어려움 선택 → 사람1 + AI2(hard) config로 newGame', async () => {
    const user = userEvent.setup()
    render(<TraySetup />)
    await user.click(screen.getByRole('button', { name: '3인' }))
    await user.click(screen.getByRole('button', { name: '어려움' }))
    await user.click(screen.getByRole('button', { name: '시작' }))

    const players = useGameStore.getState().committed!.config.players
    expect(players).toHaveLength(3)
    expect(players[0]!.type).toBe('human')
    expect(players[1]).toMatchObject({ type: 'ai', difficulty: 'hard' })
    expect(players[2]).toMatchObject({ type: 'ai', difficulty: 'hard' })
  })

  it('기본값: 2인·보통', async () => {
    const user = userEvent.setup()
    render(<TraySetup />)
    await user.click(screen.getByRole('button', { name: '시작' }))
    const players = useGameStore.getState().committed!.config.players
    expect(players).toHaveLength(2)
    expect(players[1]).toMatchObject({ type: 'ai', difficulty: 'normal' })
  })

  it('세이브 없으면 이어하기 버튼이 없다', () => {
    render(<TraySetup />)
    expect(screen.queryByRole('button', { name: '이어하기' })).toBeNull()
  })

  it('세이브 있으면 이어하기 노출, 클릭 시 loadSaved로 복원', async () => {
    const user = userEvent.setup()
    // 세이브를 하나 만든다: 새 게임(액션 0개짜리 세이브가 즉시 기록됨) 후 스토어만 비운다
    useGameStore.getState().newGame({
      players: [
        { type: 'human', name: '나' },
        { type: 'ai', name: 'AI', difficulty: 'easy' },
      ],
      seed: 42,
    })
    // 스토어를 설정 화면 상태로 되돌리되 localStorage 세이브는 남긴다
    useGameStore.setState({
      committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    })

    render(<TraySetup />)
    await user.click(screen.getByRole('button', { name: '이어하기' }))
    expect(useGameStore.getState().committed).not.toBeNull()
  })
})
```

- [ ] 실패 확인. 명령: `npm test -- tests/tray/traySetup.test.tsx`
  기대: `Unable to find an accessible element with the role "button" and name "3인"` 등으로 실패(스텁이 "설정" 텍스트만 렌더).

- [ ] 구현. `src/tray/screens/TraySetup.tsx` 전체 교체:
```tsx
import { useState } from 'react'
import type { Difficulty, GameConfig, PlayerKind } from '../../engine'
import { useGameStore } from '../../store/gameStore'
import { hasSave } from '../../store/persistence'

type Count = 2 | 3 | 4
const COUNTS: readonly Count[] = [2, 3, 4]
const DIFFS: readonly { key: Difficulty; label: string }[] = [
  { key: 'easy', label: '쉬움' },
  { key: 'normal', label: '보통' },
  { key: 'hard', label: '어려움' },
]

/** 트레이는 항상 사람 1명 + AI n-1명 (스펙 §게임 범위). 좌석 어휘·시드 생성은 SetupScreen과 동일. */
function buildConfig(count: Count, difficulty: Difficulty): GameConfig {
  const players: PlayerKind[] = Array.from({ length: count }, (_, i): PlayerKind =>
    i === 0
      ? { type: 'human', name: '나' }
      : { type: 'ai', name: `AI ${i}`, difficulty },
  )
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!
  return { players, seed }
}

export function TraySetup() {
  const newGame = useGameStore((s) => s.newGame)
  const loadSaved = useGameStore((s) => s.loadSaved)
  const [count, setCount] = useState<Count>(2)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [loadError, setLoadError] = useState<string | null>(null)

  return (
    <main className="tray-setup" data-tray-screen="setup">
      <div className="tray-seg" role="group" aria-label="인원">
        {COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            className={`tray-seg-btn ${count === n ? 'is-active' : ''}`}
            aria-pressed={count === n}
            onClick={() => setCount(n)}
          >
            {n}인
          </button>
        ))}
      </div>

      <div className="tray-seg" role="group" aria-label="난이도">
        {DIFFS.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`tray-seg-btn ${difficulty === d.key ? 'is-active' : ''}`}
            aria-pressed={difficulty === d.key}
            onClick={() => setDifficulty(d.key)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="tray-btn tray-btn-primary"
        onClick={() => newGame(buildConfig(count, difficulty))}
      >
        시작
      </button>

      {hasSave() && (
        <button type="button" className="tray-btn" onClick={() => setLoadError(loadSaved())}>
          이어하기
        </button>
      )}
      {loadError && <p className="tray-error">⚠ {loadError}</p>}
    </main>
  )
}
```

- [ ] 통과 확인. 명령: `npm test -- tests/tray/traySetup.test.tsx`
  기대: `4 passed`.

- [ ] 라우팅 회귀 확인. 명령: `npm test -- tests/tray/trayApp.test.tsx`
  기대: `3 passed`.

- [ ] 커밋. `git add src/tray/screens/TraySetup.tsx tests/tray/traySetup.test.tsx && git commit -m "feat(tray): TraySetup — 인원·난이도·시작·이어하기 (이슈 #16)"`

---

## Task 6 — TrayGame 접힘 뷰 (▸내 차례·점수·내 자원 + 펼침 버튼)

평소(접힘) 뷰. 내 차례/AI 생각중 표시, 내 점수 `N/15`, 내 자원 한 줄(`playerLine`), `[보드][상대][귀족]` 토글 버튼. 뷰어(=사람)는 `viewerIndexFor(committed)`로 구한다. 이 Task에서 `TrayGame`이 `useTraySettings`를 소비하기 시작한다. 펼침 패널 내용은 Task 7·8에서 채우되, 버튼의 `aria-pressed`와 패널 컨테이너 존재만 지금 검증한다.

**Files**
- Modify: `src/tray/screens/TrayGame.tsx`
- Create: `tests/tray/trayGame.test.tsx`

**Interfaces**
- Consumes: `useGameStore` (`aiThinking`), `viewerIndexFor` from `../../store/gameStore`, `useTraySettings`·`type TrayExpand` from `../useTraySettings`, `playerLine`·`gemCode` from `../format`, `import { WINNING_PRESTIGE, type GameState } from '../../engine'`
- Produces: 접힘 뷰 DOM(`data-tray-screen="game"`), 언어 토글 버튼, 토글 버튼 3개, `data-tray-panel="board|opponents|nobles"` 컨테이너(펼침 시).

**Steps**

- [ ] 실패 테스트 작성. `tests/tray/trayGame.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TrayGame } from '../../src/tray/screens/TrayGame'
import { useGameStore } from '../../src/store/gameStore'
import { baseState, patchPlayer, gems } from '../helpers'
import type { GameState } from '../../src/engine'

function humanVsAi(overrides: Partial<GameState> = {}): GameState {
  const s = baseState(2, 42, { currentPlayer: 0, ...overrides })
  return {
    ...s,
    config: {
      ...s.config,
      players: [
        { type: 'human', name: '나' },
        { type: 'ai', name: 'AI', difficulty: 'easy' },
      ],
    },
  }
}

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    lastEvents: [], pendingPicks: [], selectedCard: null, selectedDeck: null,
    handoffPending: false, aiThinking: false, aiSeq: 0, lastError: null,
  })
}

describe('TrayGame 접힘 뷰', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('내 차례 표시 + 점수 N/15', () => {
    const s = humanVsAi()
    const withScore = patchPlayer(s, 0, { prestige: 4, bonuses: gems({ white: 1 }) })
    useGameStore.setState({ committed: withScore })
    render(<TrayGame committed={withScore} />)
    expect(screen.getByText(/내 차례/)).toBeTruthy()
    expect(screen.getByText(/4\s*\/\s*15/)).toBeTruthy()
  })

  it('AI 차례 + aiThinking이면 "생각 중" 표시', () => {
    const s = humanVsAi({ currentPlayer: 1 })
    useGameStore.setState({ committed: s, aiThinking: true })
    render(<TrayGame committed={s} />)
    expect(screen.getByText(/생각 중/)).toBeTruthy()
  })

  it('[보드] 토글 → aria-pressed 반전 + 패널 컨테이너 등장/소멸', async () => {
    const user = userEvent.setup()
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)

    const boardBtn = screen.getByRole('button', { name: '보드' })
    expect(boardBtn.getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('[data-tray-panel="board"]')).toBeNull()

    await user.click(boardBtn)
    expect(boardBtn.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('[data-tray-panel="board"]')).toBeTruthy()

    await user.click(boardBtn)
    expect(document.querySelector('[data-tray-panel="board"]')).toBeNull()
  })

  it('[상대]/[귀족] 버튼도 존재한다', () => {
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    expect(screen.getByRole('button', { name: '상대' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '귀족' })).toBeTruthy()
  })
})
```

- [ ] 실패 확인. 명령: `npm test -- tests/tray/trayGame.test.tsx`
  기대: `Unable to find an element with the text: /내 차례/` 등으로 실패(스텁은 "게임 (턴 N)"만 렌더).

- [ ] 구현. `src/tray/screens/TrayGame.tsx` 전체 교체(접힘 뷰 + 펼침 패널 컨테이너 골격; 패널 내부는 Task 7·8에서 채움):
```tsx
import { useEffect } from 'react'
import { WINNING_PRESTIGE, type GameState } from '../../engine'
import { useGameStore, viewerIndexFor } from '../../store/gameStore'
import { playerLine } from '../format'
import { useTraySettings, type TrayExpand } from '../useTraySettings'

const PANEL_LABEL: Record<keyof TrayExpand, string> = {
  board: '보드',
  opponents: '상대',
  nobles: '귀족',
}

/** 펼침 조합에 맞는 목표 창 크기(px). 스펙 §화면 상태 표를 근사한다. */
function targetSize(expand: TrayExpand): { w: number; h: number } {
  const w = expand.opponents ? 392 : expand.board || expand.nobles ? 260 : 250
  let h = 178
  if (expand.board || expand.opponents) h = 440
  if (expand.nobles) h += 96
  return { w, h }
}

export function TrayGame({ committed }: { committed: GameState }) {
  const aiThinking = useGameStore((s) => s.aiThinking)
  const { gemCodeLang, setGemLang, expand, toggleExpand } = useTraySettings()

  const me = viewerIndexFor(committed)
  const myTurn = committed.config.players[committed.currentPlayer]?.type === 'human'
  const myScore = committed.players[me]!.prestige

  // 펼침 조합이 바뀌면 셸에 리사이즈 요청 (브라우저에선 window.tray가 없어 no-op)
  useEffect(() => {
    const { w, h } = targetSize(expand)
    window.tray?.resize(w, h)
  }, [expand])

  return (
    <main className="tray-game" data-tray-screen="game">
      <header className="tray-status">
        <span className="tray-turn">
          {myTurn ? '▸ 내 차례' : aiThinking ? 'AI 생각 중…' : 'AI 차례'}
        </span>
        <span className="tray-score">
          {myScore} / {WINNING_PRESTIGE}
        </span>
        <button
          type="button"
          className="tray-lang"
          aria-label="글자코드 언어 전환"
          onClick={() => setGemLang(gemCodeLang === 'ko' ? 'en' : 'ko')}
        >
          {gemCodeLang === 'ko' ? '한' : 'EN'}
        </button>
      </header>

      <div className="tray-me">{playerLine(committed, me, gemCodeLang)}</div>

      <nav className="tray-toggles" aria-label="펼침">
        {(Object.keys(PANEL_LABEL) as (keyof TrayExpand)[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`tray-toggle ${expand[k] ? 'is-open' : ''}`}
            aria-pressed={expand[k]}
            onClick={() => toggleExpand(k)}
          >
            {PANEL_LABEL[k]}
          </button>
        ))}
      </nav>

      {expand.board && (
        <section className="tray-panel" data-tray-panel="board" aria-label="보드">
          {/* Task 7에서 채운다 */}
        </section>
      )}
      {expand.opponents && (
        <section className="tray-panel" data-tray-panel="opponents" aria-label="상대">
          {/* Task 8에서 채운다 */}
        </section>
      )}
      {expand.nobles && (
        <section className="tray-panel" data-tray-panel="nobles" aria-label="귀족">
          {/* Task 8에서 채운다 */}
        </section>
      )}
    </main>
  )
}
```

- [ ] 통과 확인. 명령: `npm test -- tests/tray/trayGame.test.tsx`
  기대: `4 passed`.

- [ ] 타입 확인(미사용 import 없음 — `noUnusedLocals`). 명령: `npm run typecheck`
  기대: 종료코드 0.

- [ ] 커밋. `git add src/tray/screens/TrayGame.tsx tests/tray/trayGame.test.tsx && git commit -m "feat(tray): TrayGame 접힘 뷰·펼침 토글·리사이즈 접합면 (이슈 #16)"`

---

## Task 7 — TrayGame 보드 펼침 (3티어 텍스트 격자 + 토큰 공급)

`[보드]` 펼침 패널을 채운다. 3티어 각각 공개 카드 4장을 `cardCode`로 텍스트 나열(빈 슬롯은 `·`), 티어별 덱 남은 장수, 하단에 토큰 공급을 `색코드N` 나열. 카드/덱 클릭 배선은 Task 9에서 하므로 여기서는 표시만.

**검증된 사실**
- `GameState.board`는 `readonly (readonly (CardId | null)[])[]`, `board[tier-1][slot]`. `decks`는 `[CardId[], CardId[], CardId[]]`. `supply: TokenMap`(gold 포함).
- `CARDS`는 `readonly Card[]`(id 인덱스). `noUncheckedIndexedAccess` 때문에 `CARDS[id]!`가 필요.

**Files**
- Modify: `src/tray/screens/TrayGame.tsx`
- Modify: `tests/tray/trayGame.test.tsx`

**Interfaces**
- Consumes: `import { CARDS, TOKEN_COLORS, WINNING_PRESTIGE, type GameState } from '../../engine'`(기존 import 확장), `import { cardCode, gemCode, playerLine } from '../format'`

**Steps**

- [ ] 실패 테스트 추가. `tests/tray/trayGame.test.tsx`의 `describe` 안에 추가:
```tsx
  it('보드 펼침: 3티어 격자 + 공개 카드 코드 + 공급 토큰이 표시된다', async () => {
    const user = userEvent.setup()
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    await user.click(screen.getByRole('button', { name: '보드' }))

    const panel = document.querySelector('[data-tray-panel="board"]')!
    // 3티어 행이 있다
    expect(panel.querySelectorAll('[data-tray-tier]')).toHaveLength(3)
    // 첫 공개 카드의 코드가 어딘가 렌더된다
    const firstCard = s.board[0]!.find((id) => id !== null)!
    const { cardCode } = await import('../../src/tray/format')
    const { CARDS } = await import('../../src/engine')
    expect(panel.textContent).toContain(cardCode(CARDS[firstCard]!, 'ko'))
    // 공급 영역 존재
    expect(panel.querySelector('[data-tray-supply]')).toBeTruthy()
  })
```

- [ ] 실패 확인. 명령: `npm test -- tests/tray/trayGame.test.tsx`
  기대: `[data-tray-tier]` 0개 → `expected length 0 to be 3` 실패.

- [ ] 구현. `src/tray/screens/TrayGame.tsx`의 상단 import 두 줄을 아래로 교체(기존 `import { WINNING_PRESTIGE, type GameState } …`·`import { playerLine } …`를 대체):
```tsx
import { CARDS, TOKEN_COLORS, WINNING_PRESTIGE, type GameState } from '../../engine'
import { cardCode, gemCode, playerLine } from '../format'
```
컴포넌트 함수 위에 헬퍼 컴포넌트 추가:
```tsx
function BoardPanel({ committed, lang }: { committed: GameState; lang: 'ko' | 'en' }) {
  return (
    <section className="tray-panel" data-tray-panel="board" aria-label="보드">
      {([3, 2, 1] as const).map((tier) => {
        const row = committed.board[tier - 1]!
        const deckLeft = committed.decks[tier - 1]!.length
        return (
          <div className="tray-tier" data-tray-tier={tier} key={tier}>
            <span className="tray-tier-label">T{tier}</span>
            {row.map((id, slot) => (
              <span className="tray-cardcell" data-card-id={id ?? ''} key={slot}>
                {id !== null ? cardCode(CARDS[id]!, lang) : '·'}
              </span>
            ))}
            <span className="tray-deckleft">덱{deckLeft}</span>
          </div>
        )
      })}
      <div className="tray-supply" data-tray-supply aria-label="토큰 공급">
        {TOKEN_COLORS.filter((c) => committed.supply[c] > 0).map((c) => (
          <span className="tray-supplycell" key={c}>
            {gemCode(c, lang)}
            {committed.supply[c]}
          </span>
        ))}
      </div>
    </section>
  )
}
```
`TrayGame`의 board 패널 렌더 부분(`{expand.board && ( … )}` 블록 전체)을 교체:
```tsx
      {expand.board && <BoardPanel committed={committed} lang={gemCodeLang} />}
```

- [ ] 통과 확인. 명령: `npm test -- tests/tray/trayGame.test.tsx`
  기대: 이전 4개 + 보드 1개 = `5 passed`.

- [ ] 타입 확인(미사용 import 방지). 명령: `npm run typecheck`
  기대: 종료코드 0.

- [ ] 커밋. `git add src/tray/screens/TrayGame.tsx tests/tray/trayGame.test.tsx && git commit -m "feat(tray): 보드 펼침 — 3티어 카드 격자·덱·토큰 공급 (이슈 #16)"`

---

## Task 8 — TrayGame 상대·귀족 펼침 패널

`[상대]` 패널 = 나를 제외한 각 상대의 `playerLine` 한 줄씩. `[귀족]` 패널 = 남은 귀족 요구조건을 `색코드N`으로. `state.nobles`는 `readonly NobleId[]`(id 배열), `NOBLES[id].requirement: GemMap`(id===인덱스, 검증됨).

**Files**
- Modify: `src/tray/screens/TrayGame.tsx`
- Modify: `tests/tray/trayGame.test.tsx`

**Interfaces**
- Consumes: `import { CARDS, GEM_COLORS, NOBLES, TOKEN_COLORS, WINNING_PRESTIGE, type GameState } from '../../engine'`(기존 import 확장), `gemCode`·`playerLine`(이미 import됨)

**Steps**

- [ ] 실패 테스트 추가. `tests/tray/trayGame.test.tsx`의 `describe` 안에:
```tsx
  it('상대 펼침: 나를 제외한 상대 요약이 표시된다', async () => {
    const user = userEvent.setup()
    const s = humanVsAi()
    const withAi = patchPlayer(s, 1, { prestige: 7 })
    useGameStore.setState({ committed: withAi })
    render(<TrayGame committed={withAi} />)
    await user.click(screen.getByRole('button', { name: '상대' }))

    const panel = document.querySelector('[data-tray-panel="opponents"]')!
    const rows = panel.querySelectorAll('[data-opp-index]')
    expect(rows).toHaveLength(1) // 2인전 → 상대 1명
    expect(panel.textContent).toContain('AI')
    expect(panel.textContent).toContain('7점')
  })

  it('귀족 펼침: 남은 귀족 요구조건이 코드로 표시된다', async () => {
    const user = userEvent.setup()
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    await user.click(screen.getByRole('button', { name: '귀족' }))

    const panel = document.querySelector('[data-tray-panel="nobles"]')!
    const { NOBLES } = await import('../../src/engine')
    const items = panel.querySelectorAll('[data-noble-id]')
    expect(items.length).toBe(s.nobles.length)
    expect(items.length).toBeGreaterThan(0)
    // 첫 귀족의 요구 색 중 하나의 코드가 텍스트에 있다
    const req = NOBLES[s.nobles[0]!]!.requirement
    const someColor = (['white','blue','green','red','black'] as const).find((c) => req[c] > 0)!
    const code = { white:'흰', blue:'파', green:'초', red:'빨', black:'검' }[someColor]
    expect(panel.textContent).toContain(code)
  })
```

- [ ] 실패 확인. 명령: `npm test -- tests/tray/trayGame.test.tsx`
  기대: `[data-tray-panel="opponents"]`이 빈 컨테이너라 `[data-opp-index]` 0개 → `expected length 0 to be 1` 실패.

- [ ] 구현. `src/tray/screens/TrayGame.tsx` 상단 import에 `GEM_COLORS`·`NOBLES` 추가:
```tsx
import { CARDS, GEM_COLORS, NOBLES, TOKEN_COLORS, WINNING_PRESTIGE, type GameState } from '../../engine'
```
헬퍼 컴포넌트 2개 추가:
```tsx
function OpponentsPanel({ committed, me, lang }: { committed: GameState; me: number; lang: 'ko' | 'en' }) {
  return (
    <section className="tray-panel" data-tray-panel="opponents" aria-label="상대">
      {committed.players.map((_, i) =>
        i === me ? null : (
          <div className="tray-opp" data-opp-index={i} key={i}>
            <span className="tray-opp-name">{committed.config.players[i]!.name}</span>
            <span className="tray-opp-line">{playerLine(committed, i, lang)}</span>
          </div>
        ),
      )}
    </section>
  )
}

function NoblesPanel({ committed, lang }: { committed: GameState; lang: 'ko' | 'en' }) {
  return (
    <section className="tray-panel" data-tray-panel="nobles" aria-label="귀족">
      {committed.nobles.map((id) => {
        const req = NOBLES[id]!.requirement
        return (
          <div className="tray-noble" data-noble-id={id} key={id}>
            👑{' '}
            {GEM_COLORS.filter((c) => req[c] > 0)
              .map((c) => `${gemCode(c, lang)}${req[c]}`)
              .join(' ')}
          </div>
        )
      })}
    </section>
  )
}
```
`TrayGame`의 opponents/nobles 렌더 블록(`{expand.opponents && ( … )}`·`{expand.nobles && ( … )}`)을 교체:
```tsx
      {expand.opponents && <OpponentsPanel committed={committed} me={me} lang={gemCodeLang} />}
      {expand.nobles && <NoblesPanel committed={committed} lang={gemCodeLang} />}
```

- [ ] 통과 확인. 명령: `npm test -- tests/tray/trayGame.test.tsx`
  기대: `7 passed`.

- [ ] 타입 확인. 명령: `npm run typecheck`
  기대: 종료코드 0.

- [ ] 커밋. `git add src/tray/screens/TrayGame.tsx tests/tray/trayGame.test.tsx && git commit -m "feat(tray): 상대·귀족 펼침 패널 (이슈 #16)"`

---

## Task 9 — TrayGame 플레이 배선 (토큰 집기·구매·예약·무르기)

접힘 뷰에 행동 컨트롤을 붙인다. 규칙 판정은 전부 엔진으로: 토큰은 `togglePick`으로 조립 후 `buildPickAction`→`dispatch`, 카드/덱은 `selectCard`/`selectDeck` 후 `dispatch(PURCHASE|RESERVE_BOARD|RESERVE_DECK)`, `undo`는 `canUndo`일 때만. 불법 사유는 스토어 `lastError`(형식 `"메시지 (§규칙)"`)를 표시한다. `ActionBar.tsx`의 조립 패턴을 무채색·초압축으로 따르되, **지불 조정 UI는 범위 밖 — `canonicalPayment` 표준 지불만** 쓴다.

**검증된 사실**
- `togglePick(color)` 자체가 부분 조립 유효성을 엔진(`validateAction`/`legalActions`)으로 검사하고 불법이면 `lastError`를 세팅한다. 즉 **UI는 색 버튼만 붙이면 되고 룰 리터럴을 만들지 않는다.** 같은 색 두 번째 클릭 = `[c,c]`(TAKE_SAME 의도).
- `buildPickAction(picks)`: `[c,c]`→`TAKE_SAME`, 그 외→`TAKE_DIFFERENT`, 빈 배열→`null`.
- `dispatch`가 `validateAction` 실패 시 `set({lastError})` 후 반환.
- `canUndo(s)`는 `{committed, actionLog, snapshots}`만 받는다 → `useGameStore((s)=>canUndo(s))`.
- `RESERVE_BOARD` 액션 = `{ type:'RESERVE_BOARD', cardId }`, `RESERVE_DECK` = `{ type:'RESERVE_DECK', tier }`. 캐스트 불필요.

**Files**
- Modify: `src/tray/screens/TrayGame.tsx`
- Modify: `tests/tray/trayGame.test.tsx`

**Interfaces**
- Consumes: `useGameStore` (`togglePick`, `dispatch`, `selectCard`, `selectDeck`, `clearSelection`, `undo`, `pendingPicks`, `selectedCard`, `selectedDeck`, `lastError`, `dismissError`), `buildPickAction`·`canUndo`·`viewerIndexFor` from `../../store/gameStore`, `import { CARDS, GEM_COLORS, NOBLES, TOKEN_COLORS, WINNING_PRESTIGE, canonicalPayment, type GameState } from '../../engine'`

**Steps**

- [ ] 실패 테스트 추가. `tests/tray/trayGame.test.tsx` **파일 상단**(import 직후)에 `setAiDelayScale(0)`를 두고, `describe` 안에 추가. (상단에 `import { setAiDelayScale } from '../../src/ai/client'` 추가 후 `setAiDelayScale(0)` 호출.)
```tsx
  it('토큰 3색 집기 → 확정 → actionLog 기록', async () => {
    const user = userEvent.setup()
    // 사람(0)이 선이 되는 시드를 찾는다
    const { setupGame } = await import('../../src/engine')
    const players = [
      { type: 'human', name: '나' },
      { type: 'ai', name: 'AI', difficulty: 'easy' },
    ] as const
    let seed = 42
    while (setupGame({ players: [...players], seed }).startPlayer !== 0) seed++

    useGameStore.getState().newGame({ players: [...players], seed })
    const committed = useGameStore.getState().committed!
    render(<TrayGame committed={committed} />)

    // 서로 다른 3색 집기 (글자코드 라벨)
    await user.click(screen.getByRole('button', { name: '흰 집기' }))
    await user.click(screen.getByRole('button', { name: '파 집기' }))
    await user.click(screen.getByRole('button', { name: '초 집기' }))
    await user.click(screen.getByRole('button', { name: '확정' }))

    expect(useGameStore.getState().actionLog.length).toBeGreaterThanOrEqual(1)
  })

  it('불법 조합(같은 색 3번째)이면 lastError가 표시된다', async () => {
    const user = userEvent.setup()
    const s = humanVsAi()
    useGameStore.setState({ committed: s })
    render(<TrayGame committed={s} />)
    // 빨 두 번(=TAKE_SAME 조립) 후 세 번째 빨 → 어떤 합법 조합에도 포함 불가 → lastError
    await user.click(screen.getByRole('button', { name: '빨 집기' }))
    await user.click(screen.getByRole('button', { name: '빨 집기' }))
    await user.click(screen.getByRole('button', { name: '빨 집기' }))
    expect(screen.getByText(/§/)).toBeTruthy()
  })
```

- [ ] 실패 확인. 명령: `npm test -- tests/tray/trayGame.test.tsx`
  기대: `Unable to find … "흰 집기"` 로 실패(행동 바 미구현).

- [ ] 구현. `src/tray/screens/TrayGame.tsx` 상단 import를 확장(`canonicalPayment` 추가)하고, store import에 `buildPickAction`·`canUndo` 추가:
```tsx
import { CARDS, GEM_COLORS, NOBLES, TOKEN_COLORS, WINNING_PRESTIGE, canonicalPayment, type GameState } from '../../engine'
import { buildPickAction, canUndo, useGameStore, viewerIndexFor } from '../../store/gameStore'
```
`TrayGame` 본문 상단(기존 셀렉터 아래)에 스토어 셀렉터 추가:
```tsx
  const togglePick = useGameStore((s) => s.togglePick)
  const dispatch = useGameStore((s) => s.dispatch)
  const selectCard = useGameStore((s) => s.selectCard)
  const selectDeck = useGameStore((s) => s.selectDeck)
  const clearSelection = useGameStore((s) => s.clearSelection)
  const undo = useGameStore((s) => s.undo)
  const pendingPicks = useGameStore((s) => s.pendingPicks)
  const selectedCard = useGameStore((s) => s.selectedCard)
  const selectedDeck = useGameStore((s) => s.selectedDeck)
  const lastError = useGameStore((s) => s.lastError)
  const dismissError = useGameStore((s) => s.dismissError)
  const undoable = useGameStore((s) => canUndo(s))
```
접힘 뷰의 `<nav className="tray-toggles">` **아래**(펼침 패널들 앞)에 행동 바를 삽입. `myTurn && committed.phase.kind === 'play'`일 때만 노출:
```tsx
      {myTurn && committed.phase.kind === 'play' && (
        <div className="tray-actions" aria-label="행동">
          <div className="tray-take">
            {GEM_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="tray-take-btn"
                aria-label={`${gemCode(c, gemCodeLang)} 집기`}
                onClick={() => togglePick(c)}
              >
                {gemCode(c, gemCodeLang)}
              </button>
            ))}
          </div>
          {pendingPicks.length > 0 && (
            <div className="tray-pending">
              <span className="tray-pending-list">
                {pendingPicks.map((c) => gemCode(c, gemCodeLang)).join('')}
              </span>
              <button
                type="button"
                className="tray-btn tray-btn-primary"
                onClick={() => {
                  const a = buildPickAction(pendingPicks)
                  if (a) dispatch(a)
                }}
              >
                확정
              </button>
              <button type="button" className="tray-btn" onClick={clearSelection}>
                취소
              </button>
            </div>
          )}
          {selectedCard !== null && CARDS[selectedCard] && (
            <div className="tray-cardaction">
              <button
                type="button"
                className="tray-btn tray-btn-primary"
                onClick={() =>
                  dispatch({
                    type: 'PURCHASE',
                    cardId: selectedCard,
                    payment: canonicalPayment(committed.players[me]!, CARDS[selectedCard]!),
                  })
                }
              >
                구매
              </button>
              <button
                type="button"
                className="tray-btn"
                onClick={() => dispatch({ type: 'RESERVE_BOARD', cardId: selectedCard })}
              >
                예약
              </button>
              <button type="button" className="tray-btn" onClick={clearSelection}>
                취소
              </button>
            </div>
          )}
          {selectedDeck !== null && (
            <div className="tray-cardaction">
              <button
                type="button"
                className="tray-btn tray-btn-primary"
                onClick={() => dispatch({ type: 'RESERVE_DECK', tier: selectedDeck })}
              >
                비공개 예약
              </button>
              <button type="button" className="tray-btn" onClick={clearSelection}>
                취소
              </button>
            </div>
          )}
          {undoable && (
            <button type="button" className="tray-btn tray-undo" onClick={undo}>
              무르기
            </button>
          )}
        </div>
      )}
      {lastError && (
        <button type="button" className="tray-error" onClick={dismissError} aria-live="assertive">
          ⚠ {lastError}
        </button>
      )}
```
보드 카드/덱 클릭 배선을 위해 `BoardPanel` 시그니처를 콜백 2개로 확장:
```tsx
function BoardPanel({
  committed, lang, onSelectCard, onSelectDeck,
}: {
  committed: GameState
  lang: 'ko' | 'en'
  onSelectCard: (id: number) => void
  onSelectDeck: (tier: 1 | 2 | 3) => void
}) {
```
카드 셀을 버튼으로(빈 슬롯은 비버튼 유지 — `key`는 바깥에서 부여):
```tsx
            {row.map((id, slot) =>
              id !== null ? (
                <button
                  key={slot}
                  type="button"
                  className="tray-cardcell"
                  data-card-id={id}
                  onClick={() => onSelectCard(id)}
                >
                  {cardCode(CARDS[id]!, lang)}
                </button>
              ) : (
                <span key={slot} className="tray-cardcell" data-card-id="">
                  ·
                </span>
              ),
            )}
```
덱 남은 표시를 버튼으로:
```tsx
            <button
              type="button"
              className="tray-deckleft"
              disabled={deckLeft === 0}
              onClick={() => onSelectDeck(tier)}
            >
              덱{deckLeft}
            </button>
```
그리고 `TrayGame`의 board 렌더를 콜백 연결로 교체:
```tsx
      {expand.board && (
        <BoardPanel
          committed={committed}
          lang={gemCodeLang}
          onSelectCard={selectCard}
          onSelectDeck={selectDeck}
        />
      )}
```

- [ ] 통과 확인. 명령: `npm test -- tests/tray/trayGame.test.tsx`
  기대: `9 passed`(이전 7 + 배선 2).

- [ ] 타입 확인. 명령: `npm run typecheck`
  기대: 종료코드 0.

- [ ] 커밋. `git add src/tray/screens/TrayGame.tsx tests/tray/trayGame.test.tsx && git commit -m "feat(tray): 플레이 배선 — 토큰 집기·구매·예약·무르기 (이슈 #16)"`

---

## Task 10 — TrayResult: 승자·최종 점수 + 새 게임

결과 화면을 실제 구현으로. 승자(공동 승리 표기), 순위표(명성·구매 카드 수·귀족 수), `deadlockExhausted` 사유 노트, [새 게임] → `abandonGame`. `ResultScreen.tsx`의 정렬(명성 내림차순, 동점 시 구매 카드 적은 쪽 우선 = §8 타이브레이크)을 무채색으로 축약.

**검증된 사실**
- `GameResult` = `{ winners: readonly number[], scores: {prestige, purchasedCount}[], reason: 'prestige15'|'deadlockExhausted' }`.
- `abandonGame()`: `clearSave` + `set({committed:null, …})`.
- 귀족 수는 `committed.players[i].nobles.length`.

**Files**
- Modify: `src/tray/screens/TrayResult.tsx`
- Create: `tests/tray/trayResult.test.tsx`

**Interfaces**
- Consumes: `useGameStore` (`abandonGame`), `import type { GameResult, GameState } from '../../engine'`

**Steps**

- [ ] 실패 테스트 작성. `tests/tray/trayResult.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TrayResult } from '../../src/tray/screens/TrayResult'
import { useGameStore } from '../../src/store/gameStore'
import { baseState } from '../helpers'
import type { GameResult } from '../../src/engine'

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    lastEvents: [], pendingPicks: [], selectedCard: null, selectedDeck: null,
    handoffPending: false, aiThinking: false, aiSeq: 0, lastError: null,
  })
}

describe('TrayResult', () => {
  beforeEach(resetStore)
  afterEach(cleanup)

  it('단독 승자와 점수를 표시한다', () => {
    const committed = baseState(2, 42)
    const result: GameResult = {
      winners: [0],
      scores: [
        { prestige: 15, purchasedCount: 8 },
        { prestige: 11, purchasedCount: 7 },
      ],
      reason: 'prestige15',
    }
    render(<TrayResult committed={committed} result={result} />)
    expect(screen.getByText(/승자/)).toBeTruthy()
    expect(screen.getByText(/15/)).toBeTruthy()
  })

  it('공동 승리를 표기한다', () => {
    const committed = baseState(2, 42)
    const result: GameResult = {
      winners: [0, 1],
      scores: [
        { prestige: 15, purchasedCount: 7 },
        { prestige: 15, purchasedCount: 7 },
      ],
      reason: 'prestige15',
    }
    render(<TrayResult committed={committed} result={result} />)
    expect(screen.getByText(/공동/)).toBeTruthy()
  })

  it('교착 종료 사유를 표기한다', () => {
    const committed = baseState(2, 42)
    const result: GameResult = {
      winners: [0],
      scores: [
        { prestige: 9, purchasedCount: 12 },
        { prestige: 8, purchasedCount: 11 },
      ],
      reason: 'deadlockExhausted',
    }
    render(<TrayResult committed={committed} result={result} />)
    expect(screen.getByText(/교착/)).toBeTruthy()
  })

  it('새 게임 버튼이 abandonGame을 호출한다', async () => {
    const user = userEvent.setup()
    const committed = baseState(2, 42)
    useGameStore.setState({ committed })
    const result: GameResult = {
      winners: [0],
      scores: [
        { prestige: 15, purchasedCount: 8 },
        { prestige: 11, purchasedCount: 7 },
      ],
      reason: 'prestige15',
    }
    render(<TrayResult committed={committed} result={result} />)
    await user.click(screen.getByRole('button', { name: '새 게임' }))
    expect(useGameStore.getState().committed).toBeNull()
  })
})
```

- [ ] 실패 확인. 명령: `npm test -- tests/tray/trayResult.test.tsx`
  기대: 스텁이 "결과 · 승자 …"만 렌더 → `/공동/`·`/교착/`·`새 게임` 버튼이 없어 4개 중 최소 3개 실패.

- [ ] 구현. `src/tray/screens/TrayResult.tsx` 전체 교체:
```tsx
import type { GameResult, GameState } from '../../engine'
import { useGameStore } from '../../store/gameStore'

/** 무채색 결과 — 승자·순위·동점 근거 (스펙 §8/§9-E) */
export function TrayResult({ committed, result }: { committed: GameState; result: GameResult }) {
  const abandonGame = useGameStore((s) => s.abandonGame)
  const name = (i: number) => committed.config.players[i]?.name ?? `P${i + 1}`

  // 명성 내림차순, 동점 시 구매 카드 적은 쪽 우선 (§8 타이브레이크)
  const ranked = result.scores
    .map((s, i) => ({ ...s, i, winner: result.winners.includes(i) }))
    .sort((a, b) => b.prestige - a.prestige || a.purchasedCount - b.purchasedCount)

  return (
    <main className="tray-result" data-tray-screen="result">
      <h1 className="tray-result-title">게임 종료</h1>
      {result.reason === 'deadlockExhausted' && (
        <p className="tray-result-note">교착 종료 (§9-E)</p>
      )}
      <p className="tray-result-winner">
        {result.winners.length > 1
          ? `공동 승리: ${result.winners.map(name).join(', ')}`
          : `승자: ${name(result.winners[0]!)}`}
      </p>

      <ol className="tray-result-list">
        {ranked.map((r) => (
          <li className={`tray-result-row ${r.winner ? 'is-winner' : ''}`} key={r.i} data-rank-index={r.i}>
            <span className="tray-result-name">{name(r.i)}</span>
            <span className="tray-result-score">
              {r.prestige}점 · 카드{r.purchasedCount} · 귀족{committed.players[r.i]!.nobles.length}
            </span>
          </li>
        ))}
      </ol>

      <button type="button" className="tray-btn tray-btn-primary" onClick={abandonGame}>
        새 게임
      </button>
    </main>
  )
}
```

- [ ] 통과 확인. 명령: `npm test -- tests/tray/trayResult.test.tsx`
  기대: `4 passed`.

- [ ] 라우팅 회귀. 명령: `npm test -- tests/tray/trayApp.test.tsx`
  기대: `3 passed`.

- [ ] 커밋. `git add src/tray/screens/TrayResult.tsx tests/tray/trayResult.test.tsx && git commit -m "feat(tray): TrayResult — 승자·순위·새 게임 (이슈 #16)"`

---

## Task 11 — tray.css: 무채색 스타일 + 라이트/다크 2종 팔레트 (preview 양 테마 확인)

무채색·모노스페이스·초압축 스타일을 작성한다. 팔레트는 루트 `[data-theme="light|dark"]`로 분기하고 CSS 변수로 참조. 다크: bg #14161a, 글자 #d7dbe0/#868f9b/#5b636e, 실선 #2b3138. 라이트: bg #f4f4f5, 글자 #1a1d22/#5b636e/#8b93a0, 실선 #d4d7dd. **채도 있는 색 절대 금지.** (`.claude/launch.json`은 이미 `splendor-dev`가 있으므로 신규 생성하지 않고 재사용한다.)

**Files**
- Modify: `src/tray/tray.css`

**Interfaces**
- Produces: `[data-theme]` 분기 CSS 변수(`--bg`, `--fg`, `--fg-dim`, `--fg-faint`, `--line`), 클래스 스타일.

**Steps**

- [ ] `src/tray/tray.css` 작성(빈 스텁을 아래로 교체):
```css
/* 트레이 무채색 스타일 — 라이트/다크 2종 팔레트 (스펙 §tray.css 접합면) */

:root,
[data-theme='dark'] {
  --bg: #14161a;
  --fg: #d7dbe0;
  --fg-dim: #868f9b;
  --fg-faint: #5b636e;
  --line: #2b3138;
}

[data-theme='light'] {
  --bg: #f4f4f5;
  --fg: #1a1d22;
  --fg-dim: #5b636e;
  --fg-faint: #8b93a0;
  --line: #d4d7dd;
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    --bg: #f4f4f5;
    --fg: #1a1d22;
    --fg-dim: #5b636e;
    --fg-faint: #8b93a0;
    --line: #d4d7dd;
  }
}

html,
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.4;
}

.tray-setup,
.tray-game,
.tray-result {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
}

/* 세그먼트 (인원·난이도) */
.tray-seg {
  display: flex;
  gap: 4px;
}
.tray-seg-btn,
.tray-btn,
.tray-toggle,
.tray-take-btn,
.tray-lang {
  background: transparent;
  color: var(--fg-dim);
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 3px 7px;
  font: inherit;
  cursor: pointer;
}
.tray-seg-btn.is-active,
.tray-toggle.is-open,
.tray-btn-primary {
  color: var(--fg);
  border-color: var(--fg-dim);
}
.tray-btn-primary {
  background: var(--line);
}

/* 상태 헤더 */
.tray-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.tray-turn {
  color: var(--fg);
}
.tray-score {
  color: var(--fg-dim);
}
.tray-me {
  color: var(--fg-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tray-toggles {
  display: flex;
  gap: 4px;
}

/* 펼침 패널 */
.tray-panel {
  border-top: 1px solid var(--line);
  padding-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tray-tier {
  display: flex;
  gap: 4px;
  align-items: baseline;
  white-space: nowrap;
}
.tray-tier-label,
.tray-deckleft {
  color: var(--fg-faint);
  background: transparent;
  border: none;
  font: inherit;
  cursor: pointer;
}
.tray-deckleft:disabled {
  cursor: default;
}
.tray-cardcell {
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 3px;
  color: var(--fg);
  font: inherit;
  padding: 1px 4px;
  cursor: pointer;
}
.tray-supply {
  display: flex;
  gap: 6px;
  color: var(--fg-dim);
}

/* 상대·귀족 */
.tray-opp,
.tray-noble {
  display: flex;
  gap: 6px;
  color: var(--fg-dim);
}
.tray-opp-name {
  color: var(--fg);
}

/* 행동 */
.tray-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tray-take {
  display: flex;
  gap: 4px;
}
.tray-pending,
.tray-cardaction {
  display: flex;
  gap: 4px;
  align-items: center;
}
.tray-undo {
  align-self: flex-start;
  color: var(--fg-faint);
}

/* 오류 */
.tray-error {
  background: transparent;
  border: 1px solid var(--fg-faint);
  color: var(--fg);
  border-radius: 3px;
  padding: 3px 6px;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

/* 결과 */
.tray-result-title {
  font-size: 13px;
  margin: 0;
  color: var(--fg);
}
.tray-result-note {
  color: var(--fg-faint);
  margin: 0;
}
.tray-result-winner {
  color: var(--fg);
  margin: 0;
}
.tray-result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tray-result-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--fg-dim);
}
.tray-result-row.is-winner .tray-result-name {
  color: var(--fg);
}
```

- [ ] preview 확인(다크). `preview_start`로 기존 `splendor-dev` 서버(`npm run dev`, port 5173)를 기동한다(신규 launch.json 생성 금지). 브라우저에서 `/splendor/tray.html`(dev 서버 base가 `/splendor/`)로 이동한 뒤, `preview_eval`로 `document.documentElement.setAttribute('data-theme','dark')` 적용. `preview_inspect`로 `body`의 `background-color`가 `rgb(20, 22, 26)`(#14161a)인지 확인. 스크린샷으로 무채색·모노스페이스·11px 한글 `흰파초빨검노` 가독성 육안 확인.
  기대: 채도 있는 색 0, 배경 #14161a, 글자 #d7dbe0 계열.

- [ ] preview 확인(라이트). `preview_eval`로 `document.documentElement.setAttribute('data-theme','light')`. `preview_inspect`로 `body` 배경이 `rgb(244, 244, 245)`(#f4f4f5)인지 확인. 스크린샷 육안 확인.
  기대: 배경 #f4f4f5, 글자 #1a1d22 계열, 실선 #d4d7dd.

- [ ] 전체 테스트 회귀. 명령: `npm test`
  기대: 기존 + 트레이 테스트 전부 통과.

- [ ] 커밋. `git add src/tray/tray.css && git commit -m "feat(tray): 무채색 스타일·라이트/다크 2종 팔레트 (이슈 #16)"`

---

## Task 12 — 테마 구독: TrayApp이 window.tray?.onTheme(cb)로 data-theme 갱신

`TrayApp`이 마운트 시 테마를 확정한다: `window.tray?.onTheme(cb)`가 있으면 메인 푸시 테마를 루트 `data-theme`에 반영(초기 프레임 최소 다크), 없으면(브라우저 단독) `prefers-color-scheme` 폴백. 값 변경 시 `document.documentElement.setAttribute('data-theme', theme)`.

**Files**
- Modify: `src/tray/TrayApp.tsx`
- Create: `tests/tray/trayTheme.test.tsx`

**Interfaces**
- Consumes: `window.tray?.onTheme((theme: 'light'|'dark') => void)`(Task 4의 `tray-window.d.ts` 선언)
- Produces: `document.documentElement[data-theme]` = `'light' | 'dark'`.

**Steps**

- [ ] 실패 테스트 작성. `tests/tray/trayTheme.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TrayApp } from '../../src/tray/TrayApp'
import { useGameStore } from '../../src/store/gameStore'

function resetStore(): void {
  localStorage.clear()
  useGameStore.setState({
    committed: null, actionLog: [], snapshots: [], eventFeed: [], eventCounts: [],
    lastEvents: [], pendingPicks: [], selectedCard: null, selectedDeck: null,
    handoffPending: false, aiThinking: false, aiSeq: 0, lastError: null,
  })
}

describe('TrayApp 테마 구독', () => {
  beforeEach(() => {
    resetStore()
    document.documentElement.removeAttribute('data-theme')
    delete (window as { tray?: unknown }).tray
  })
  afterEach(cleanup)

  it('window.tray 없으면 기본 다크로 설정된다', () => {
    render(<TrayApp />)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('window.tray.onTheme이 푸시한 테마를 data-theme에 반영한다', () => {
    let pushed: ((t: 'light' | 'dark') => void) | null = null
    ;(window as unknown as { tray: { onTheme: (cb: (t: 'light' | 'dark') => void) => void } }).tray = {
      onTheme: (cb) => {
        pushed = cb
      },
    }
    render(<TrayApp />)
    expect(pushed).not.toBeNull()
    pushed!('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    pushed!('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
```

- [ ] 실패 확인. 명령: `npm test -- tests/tray/trayTheme.test.tsx`
  기대: `data-theme`가 세팅되지 않아 `expected null to be "dark"` 등으로 2개 실패.

- [ ] 구현. `src/tray/TrayApp.tsx`에 테마 효과 추가(전체 교체):
```tsx
import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { TrayGame } from './screens/TrayGame'
import { TrayResult } from './screens/TrayResult'
import { TraySetup } from './screens/TraySetup'
import './tray.css'

/** 테마 확정: 메인(Electron)이 푸시하면 그 값, 아니면 prefers-color-scheme 폴백(기본 다크) */
function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export function TrayApp() {
  const committed = useGameStore((s) => s.committed)

  useEffect(() => {
    if (window.tray?.onTheme) {
      // 메인이 창 생성·did-finish-load 시 초기값을 포함해 푸시한다
      window.tray.onTheme((theme) => applyTheme(theme))
      // 초기 프레임에서 최소 다크를 보장(메인 푸시 전 깜빡임 방지)
      if (!document.documentElement.getAttribute('data-theme')) applyTheme('dark')
    } else {
      const prefersLight =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: light)').matches
      applyTheme(prefersLight ? 'light' : 'dark')
    }
  }, [])

  if (!committed) return <TraySetup />
  if (committed.phase.kind === 'gameOver') {
    return <TrayResult committed={committed} result={committed.phase.result} />
  }
  return <TrayGame committed={committed} />
}
```

- [ ] 통과 확인. 명령: `npm test -- tests/tray/trayTheme.test.tsx`
  기대: `2 passed`.

- [ ] 라우팅 회귀. 명령: `npm test -- tests/tray/trayApp.test.tsx`
  기대: `3 passed`.

- [ ] 커밋. `git add src/tray/TrayApp.tsx tests/tray/trayTheme.test.tsx && git commit -m "feat(tray): 테마 구독 — window.tray.onTheme→data-theme, prefers-color-scheme 폴백 (이슈 #16)"`

---

## Final Verification (모든 Task 완료 후)

- [ ] 전체 테스트. 명령: `npm test`
  기대: 기존 엔진/AI/스토어/UI 테스트 무회귀 + 트레이 테스트(`tests/tray/*`) 전부 통과.
- [ ] 타입체크. 명령: `npm run typecheck`
  기대: 종료코드 0.
- [ ] 린트. 명령: `npm run lint`
  기대: 종료코드 0.
- [ ] 웹+트레이 빌드. 명령: `npm run build`
  기대: 종료코드 0, `dist/index.html`·`dist/tray.html` 동시 생성(`ls dist/*.html`로 확인). 트레이 진입점(`src/tray/*`)은 `src/ui/**`·`styles.css`를 import하지 않는다(컬러 보드가 트레이 번들에 딸려오지 않음).
- [ ] preview 최종 육안 확인(다크·라이트 양 테마, 기존 `splendor-dev` 서버 `/splendor/tray.html`). 접힘 뷰 → 보드/상대/귀족 펼침 → 토큰 집기 확정 → AI 응수 → 무르기 → 결과 화면 흐름을 브라우저에서 통과.

---

## Notes for the executor

- **스토어 무변경**: `useGameStore`/`persistence`/`engine`은 절대 수정하지 않는다. 트레이는 소비자다.
- **룰 리터럴 금지**: 합법성은 항상 `dispatch`(내부 `validateAction`)·`togglePick`·`buildPickAction`으로만 판정. `togglePick`이 부분 조립 유효성까지 엔진으로 검사하므로 UI는 색 버튼만 붙인다. `PURCHASE` 지불은 `canonicalPayment`로 구성(지불 조정 UI는 이 Plan 범위 밖 — 트레이는 표준 지불만).
- **`window.tray` 접합면**: 항상 `window.tray?.` 옵셔널 체이닝. 브라우저 단독 실행에서 undefined여야 정상(no-op). 타입 선언은 `src/tray/tray-window.d.ts`(Task 4).
- **뷰어 인덱스**: 트레이는 사람 1명이지만 `me`는 항상 `viewerIndexFor(committed)`로 구한다(AI 차례일 때도 직전 사람 시점 유지). `handoffPending`은 발생하지 않으므로 오버레이·마스킹 UI는 만들지 않는다.
- **타입 위생(`verbatimModuleSyntax`·`noUnusedLocals`)**: 타입 전용 심볼은 인라인 `type` 한정자 또는 `import type`으로 가져오고, 각 Task에서 실제로 쓰는 심볼만 import한다(예: Task 6은 `WINNING_PRESTIGE`·`GameState`만, Task 7에서 `CARDS`·`TOKEN_COLORS` 추가, Task 8에서 `GEM_COLORS`·`NOBLES` 추가, Task 9에서 `canonicalPayment` 추가). 미사용 import는 `tsc -b`가 즉시 실패시킨다.
- **테스트 env**: `format.test.ts`는 node env(순수함수). 나머지 `tests/tray/*.tsx`는 파일 첫 줄 `// @vitest-environment jsdom`. AI 응수가 필요한 테스트는 파일 상단에서 `import { setAiDelayScale } from '../../src/ai/client'; setAiDelayScale(0)`. store 리셋 헬퍼에는 `aiSeq: 0`을 포함해 `GameStore` 형태와 일치시킨다.
- **format.ts 계약 정밀화**: `GEM_CODE`/`gemCode`는 계약의 `GemColor` 대신 `TokenColor`(gold 포함)를 쓴다 — gold 코드(`노`/`Y`)가 공급·토큰 요약에 필요하기 때문. `TokenColor ⊇ GemColor`라 모든 호출부와 호환된다.
