# Electron 데스크톱 셸 (desktop/) Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: superpowers:subagent-driven-development
>
> 각 Task 는 독립적으로 테스트 가능한 최소 산출물이다. 스텝은 한 동작(2~5분): 실패테스트 작성 → 실패 확인 → 최소 구현 → 통과 확인 → 커밋. TDD/DRY/YAGNI/잦은 커밋을 지킨다. 완료한 스텝은 체크박스(- [ ])에 표시한다. 플레이스홀더·"TODO"·"적절히 처리"·"Task N과 유사" 금지 — 모든 코드 스텝에 실제 코드 전체를 넣는다.

## Goal

요트다이스(`khkim3115/YachtDice_Helper`)의 `desktop/` Electron 트레이 앱을 스플랜더로 이식한다. 시스템 트레이 상주, 프레임리스·`skipTaskbar`·`alwaysOnTop` 초소형 창, 바깥클릭/보스키/트레이 클릭으로 show/hide, 투명도·테마·위치 영속, 자동 실행·자동 업데이트(win). 렌더러(트레이 뷰, Plan 1 소유)는 `app://splendor/tray.html` 커스텀 프로토콜로 서빙해 ESM AI 워커가 `file://` 제약 없이 로드되게 한다.

이 계획(Plan 2)은 **Electron 셸(`desktop/`)만** 소유한다. 렌더러 React 트레이 뷰(`src/tray/*`, `tray.html`, `format.ts`, `useTraySettings.ts`)는 Plan 1 이 소유한다. 두 계획의 접합면은 아래 Global Constraints 의 공유 계약이다 — 이름·경로·시그니처를 정확히 지킨다. Plan 2 는 Plan 1 의 빌드 산출물(`dist/tray.html`, ESM 워커 청크)을 `app://` 로 감싼다.

## Architecture

```
[Plan 1 소유 · 렌더러]                         [Plan 2 소유 · 이 계획 · Electron 셸]
tray.html + src/tray/*  ──vite build──▶ dist/  ──app://splendor/──▶ desktop/main.js
  window.tray?.resize/onTheme/…                  protocol.handle       BrowserWindow(frameless)
                                                                       Tray + Menu + globalShortcut
                                                 preload.js ─contextBridge─▶ window.tray
                                                 settings.json(userData): theme·opacity·pinned·winPos·bossKey·autostart
                                                 electron-updater(win) · adhoc-sign.cjs(mac)
                                                 .github/workflows/desktop-release.yml
```

- 창은 파괴하지 않고 hide 만 → 렌더러 스토어 상태·워커 구독 유지.
- 표시 설정 소유권: **테마(흰/검)·투명도·위치·보스키·자동실행은 메인 `settings.json`**. 글자코드 언어(한/영)는 렌더러 localStorage(Plan 1). 창 크기(펼침)는 렌더러가 목표 계산 → 메인 리사이즈.
- IPC 명명: 요트다이스 `yd-*` → 스플랜더 `tray-*`. preload 네임스페이스 `yd` → `tray`.

## Tech Stack

- Electron 33, electron-builder 25, electron-updater (요트다이스와 동일 버전).
- `desktop/` 는 저장소 루트 `package.json`(vite/react/vitest)과 **별도 npm 패키지**(`desktop/package.json`) — Electron 의존성이 웹 빌드를 오염시키지 않는다.
- 테스트 두 종류:
  - **순수 로직 → 루트 vitest**. `app://` 경로 해석·리사이즈 클램프·투명도 클램프·테마·자동실행 인자는 `desktop/lib/*.cjs` 로 추출해 `tests/desktop/*.test.ts` 로 Electron 런타임 없이 커버한다. 루트 `vite.config.ts` 의 `test.include = ['tests/**/*.test.ts', 'tests/**/*.test.tsx']` 가 `tests/desktop/` 를 이미 포함하고, `test.environment = 'node'` 라 jsdom 불필요하며, `coverage.include = ['src/engine/**']` 라 커버리지 게이트에 영향 없다(확인: 루트 `vite.config.ts`). `tsconfig.test.json` 의 `include: ["tests","src","scripts"]` 가 `tests/desktop/*.test.ts` 를 `tsc -b`(typecheck) 대상에 포함한다.
  - **Electron 스모크 → `desktop/test/smoke.cjs`**. 헤드리스로 `app://splendor/tray.html` 을 로드하고 **실제로 AI 게임을 한 턴 진행시켜** `window.__splendorAi.workerCreated===true` 와 `responses>0`(폴백 아님)을 관측한다. `workerCreated` 는 `aiClient.requestMove()`(=AI 착수)가 `ensureWorker()` 를 호출할 때만 `true` 가 되므로(확인: `src/ai/client.ts` L91~96), 셋업 화면을 가만히 로드하는 것만으로는 절대 `true` 가 되지 않는다 — 반드시 게임을 구동해야 한다(§Task 2.6). 구동 훅은 Plan 1 이 노출한다(공유 계약).
- 커스텀 프로토콜: `protocol.handle('app', …)` (Electron 25+ API), `dist/` 를 `app://splendor/` 루트로 매핑.

## Global Constraints

아래는 스펙(`docs/superpowers/specs/2026-07-07-tray-app-design.md`)과 공유 계약의 전역 제약을 verbatim 으로 옮긴 것이다. 모든 Task 가 준수한다.

- 엔진·AI·스토어·세이브 로직 무변경(그대로 재사용). 트레이 뷰는 `useGameStore`만 소비한다.
- 은밀성 = 위장 아님 → 최소 존재감(극소형·무채색·모노스페이스) + 점진적 공개.
- 창은 파괴하지 않고 hide 만 → 스토어 상태·워커 구독 유지. close→preventDefault+hide(quit 아닐 때).
- 표시 설정: 테마(흰/검)·투명도는 Electron `settings.json`(메인 소유) → IPC로 렌더러에 푸시(창 배경색도 메인이 플립). 글자코드 언어(한/영)는 렌더러 localStorage.
- 투명도 30~100% 클램프. 전역 보스키 기본 `CommandOrControl+Alt+Space`, 변경 가능, `will-quit`에서 `unregisterAll`.
- 자동 업데이트: Windows 만(electron-updater, 태그 `tray-vX.Y.Z`, `allowPrerelease=false`). macOS 는 미서명이라 미지원(ad-hoc 서명만).
- preload 가 노출하는 API 는 정확히: `window.tray = { hide(), resize(w,h), setOpacity(v, persist), onOpacity(cb), onTheme(cb) }`.
- IPC 채널: `tray-hide`, `tray-resize`, `tray-set-opacity`, `tray-opacity`(main→renderer 초기값), `tray-theme`(main→renderer, `'light'|'dark'`).
- 테마 팔레트 배경: 다크 `#14161a`, 라이트 `#f4f4f5`. `win.setBackgroundColor(BG[theme])` 로 깜빡임 방지.
- app:// 커스텀 프로토콜: `app://splendor/` → 패키지된 `dist/` 루트. `tray.html`·assets·ESM 워커 서빙.
- 데스크톱 빌드: `vite build --base=./` 로 dist 생성 후 `desktop/` 이 이를 `app://` 로 서빙.
- 창: frameless, `resizable:false`, `skipTaskbar:true`, `alwaysOnTop:true`, `movable:true`, `contextIsolation:true`, `nodeIntegration:false`, preload. mac 은 `setAlwaysOnTop(true,'screen-saver')` + `app.dock.hide()`.
- 단일 인스턴스 락(`requestSingleInstanceLock`, second-instance → 창 표시).
- 워커 로드 실패해도 greedy 폴백 내장(`client.ts` `workerBroken`) — 게임은 멈추지 않는다. 검증은 `window.__splendorAi.workerCreated`.

## Plan 1 의존 접합면 (이 계획이 소비만 하는 것)

이 계획은 아래 Plan 1 산출물에 의존한다. **미완이면 해당 스텝은 실행 불가**로 명시(각 스텝에 표시). 이름·경로·시그니처는 공유 계약 고정값이다.

- `dist/tray.html` + ESM 워커 청크 — `vite build --base=./` 산출(Plan 1 이 `vite.config.ts` `build.rollupOptions.input = { main: 'index.html', tray: 'tray.html' }` 로 설정). 이 계획은 **읽기만** 한다.
- `window.tray` 소비 코드 — Plan 1 렌더러가 `resize`/`onTheme`/`onOpacity`/`setOpacity`/`hide` 를 호출·구독.
- **스모크 구동 훅** `window.__traySmokeStart(): void` — Plan 1 이 `tray.html` 렌더러에 노출한다. 호출 시 `useGameStore.newGame` 으로 사람1+AI1(난이도 `easy`) 게임을 시작하고 즉시 AI 차례로 넘겨 `aiClient.requestMove` 가 돌게 한다(= 워커 생성). 스모크(§2.6)는 이 훅을 호출해 `workerCreated`/`responses` 를 관측한다. 훅이 없으면 스모크는 skip 하고 콘솔에 `SMOKE SKIP: __traySmokeStart 미노출(Plan 1 병합 전)` 을 남긴 뒤 exit 0(순수 테스트로 프로토콜 로직은 이미 확정).

---

## Task 1: `desktop/` 스캐폴드 — 트레이 상주 + 최소 창 로드

첫 목표: `desktop/` 이 독립 npm 패키지로 서고, `npm start` 시 트레이 아이콘과 (아직 로컬 HTML) 프레임리스 창이 뜬다. app:// 서빙은 Task 2, 실제 창 정책은 Task 3에서. 여기서는 "창이 뜬다"만 산출물로 확정한다.

**Files**
- Create: `desktop/package.json`
- Create: `desktop/.gitignore`
- Create: `desktop/main.js`
- Create: `desktop/preload.js`
- Create: `desktop/assets/icon.png`(트레이 아이콘 — 1.3 스텝에서 생성)
- Create: `desktop/placeholder.html`(Task 2에서 삭제 — app:// 로 대체)

**Interfaces**
- Produces: 실행 가능한 Electron 앱(`electron .`). `window.tray`(공유 계약 형태의 스텁, Task 4~6에서 각 메서드가 실제 IPC로 채워짐).
- Consumes: 없음(스캐폴드).

### Steps

- [ ] **1.1 desktop/package.json 작성 (electron33/builder25/updater)**

파일 생성: `desktop/package.json`
```json
{
  "name": "splendor-desktop",
  "version": "0.0.0",
  "private": true,
  "description": "Splendor 트레이 데스크톱 셸 (Electron)",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder",
    "smoke": "electron test/smoke.cjs"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0"
  },
  "dependencies": {
    "electron-updater": "^6.3.0"
  }
}
```
`smoke` 는 `node` 가 아니라 `electron` 으로 실행한다 — `smoke.cjs` 가 `require('electron')` 의 `app`/`BrowserWindow` 를 쓰므로 Electron 런타임이 필수다. `build` 설정(nsis/dmg/afterPack)은 Task 9에서 추가한다(지금은 `npm start` 만 필요).

- [ ] **1.2 desktop/.gitignore**

파일 생성: `desktop/.gitignore`
```
node_modules/
release/
dist/
```

- [ ] **1.3 트레이 아이콘 생성 (무채색 16x16 PNG)**

`desktop/assets/` 디렉터리에 트레이용 단색 아이콘을 만든다. 다음 Node 스크립트를 임시로 실행(외부 의존 없이 최소 PNG 를 base64 로 기록). 저장소 루트에서 실행:
```
node -e "const fs=require('fs');const b64='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVR42mNgYGD4z0AEYBxVSFBBFDCoYNQwahg1jBpGDaOGkTAAAJ7cA/2X1V5wAAAAAElFTkSuQmCC';fs.mkdirSync('desktop/assets',{recursive:true});fs.writeFileSync('desktop/assets/icon.png',Buffer.from(b64,'base64'));console.log('icon.png written',fs.statSync('desktop/assets/icon.png').size,'bytes')"
```
기대 출력: `icon.png written 205 bytes`(정확히 205; 0 초과이면 통과). 릴리스용 고해상도 아이콘 교체는 후속(YAGNI). 트레이 표시에는 이 16x16 로 충분하다.

- [ ] **1.4 placeholder.html (창 로드 확인용, Task 2에서 삭제)**

파일 생성: `desktop/placeholder.html`
```html
<!doctype html>
<html lang="ko">
  <head><meta charset="UTF-8" /><title>Splendor Tray</title></head>
  <body style="margin:0;background:#14161a;color:#d7dbe0;font:12px monospace;display:grid;place-items:center;height:100vh">
    <div>Splendor Tray — 스캐폴드 OK</div>
  </body>
</html>
```

- [ ] **1.5 preload.js (window.tray — 공유 계약 형태)**

파일 생성: `desktop/preload.js`
```js
'use strict'
const { contextBridge, ipcRenderer } = require('electron')

// Plan 1 렌더러가 소비하는 정확한 형태(공유 계약).
// window.tray = { hide(), resize(w,h), setOpacity(v, persist), onOpacity(cb), onTheme(cb) }
contextBridge.exposeInMainWorld('tray', {
  hide() {
    ipcRenderer.send('tray-hide')
  },
  resize(w, h) {
    ipcRenderer.send('tray-resize', { w, h })
  },
  setOpacity(value, persist) {
    ipcRenderer.send('tray-set-opacity', { value, persist })
  },
  onOpacity(cb) {
    const handler = (_e, value) => cb(value)
    ipcRenderer.on('tray-opacity', handler)
    return () => ipcRenderer.removeListener('tray-opacity', handler)
  },
  onTheme(cb) {
    const handler = (_e, theme) => cb(theme)
    ipcRenderer.on('tray-theme', handler)
    return () => ipcRenderer.removeListener('tray-theme', handler)
  },
})
```

- [ ] **1.6 main.js (트레이 + placeholder 창)**

파일 생성: `desktop/main.js`
```js
'use strict'
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron')
const path = require('path')

let win = null
let tray = null

function createWindow() {
  win = new BrowserWindow({
    width: 250,
    height: 200,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    movable: true,
    backgroundColor: '#14161a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadFile(path.join(__dirname, 'placeholder.html'))
  win.once('ready-to-show', () => win.show())
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))
  tray = new Tray(icon)
  tray.setToolTip('Splendor')
  const menu = Menu.buildFromTemplate([
    { label: '열기', click: () => win && win.show() },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ])
  tray.on('click', () => tray.popUpContextMenu(menu))
  tray.on('right-click', () => tray.popUpContextMenu(menu))
}

app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  // 트레이 앱: 창 닫아도 종료 안 함(Task 3에서 close→hide 로 강화)
})
```

- [ ] **1.7 의존성 설치 + 실행 확인**

저장소 루트에서:
```
npm --prefix desktop install
```
기대: `electron`, `electron-builder`, `electron-updater` 설치 완료(경고는 무시 가능). `desktop/node_modules/electron/` 존재.

수동 확인(개발자 실행): `npm --prefix desktop start` → 프레임리스 250x200 창에 "Splendor Tray — 스캐폴드 OK", 트레이 아이콘 클릭 시 메뉴(열기/종료). 헤드리스 CI에서는 이 수동 확인 대신 Task 2의 자동 스모크로 대체된다. 지금은 로컬에서 창이 뜨는 것만 확인.

- [ ] **1.8 커밋**

```
git add desktop/ && git commit -m "feat(desktop): Electron 트레이 스캐폴드 — 트레이 상주 + 프레임리스 창"
```
커밋 메시지 끝에 빈 줄 하나 뒤:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Task 2: `app://` 커스텀 프로토콜 + 워커 로드 검증

`dist/` 를 `app://splendor/` 루트로 서빙한다. 프로토콜 경로 해석(요청 URL → 파일 경로)을 **순수 함수 `desktop/lib/appProtocol.cjs`** 로 추출해 루트 vitest 로 커버하고, `main.js` 는 그 함수를 `protocol.handle` 에 연결한다. 데스크톱 빌드를 로드해 **게임을 한 턴 구동**하고 `window.__splendorAi.workerCreated===true`·`responses>0` 를 스모크로 관측한다.

**Files**
- Create: `desktop/lib/appProtocol.cjs`
- Create: `tests/desktop/appProtocol.test.ts`
- Modify: `desktop/main.js`(프로토콜 등록 + dist 로드)
- Delete: `desktop/placeholder.html`
- Modify: `package.json`(루트 — `build:desktop`·`start:desktop` 스크립트 2줄)
- Create: `desktop/test/smoke.cjs`
- Create: `desktop/test/preload-probe.js`

(주의: `vite.config.ts` 는 **수정하지 않는다** — `rollupOptions.input.tray` 는 Plan 1 소유. 이 계획은 루트 `package.json` 스크립트만 추가한다.)

**Interfaces**
- Produces: `resolveAppRequest(url, distRoot)`(순수) → `{ filePath: string } | { notFound: true }`.
  ```ts
  export function resolveAppRequest(
    url: string,        // 예 'app://splendor/tray.html', 'app://splendor/assets/x.js'
    distRoot: string,   // 절대 경로(패키지된 dist)
  ): { filePath: string } | { notFound: true }
  ```
- Consumes: Plan 1 이 만든 `dist/tray.html`(vite build 산출) + `window.__traySmokeStart`(스모크 구동 훅). 이 계획은 그 파일명을 **읽기만**, 훅을 **호출만** 한다.

### Steps

- [ ] **2.1 실패테스트 — resolveAppRequest 경로 해석 + 디렉터리 탈출 차단**

파일 생성: `tests/desktop/appProtocol.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { resolveAppRequest } = require('../../desktop/lib/appProtocol.cjs') as {
  resolveAppRequest: (
    url: string,
    distRoot: string,
  ) => { filePath: string } | { notFound: true }
}

// 플랫폼 절대경로(win: C:\dist, posix: /dist) 로 정규화 — path.join 비교가 OS 독립적이도록
const DIST = path.resolve('dist')

describe('resolveAppRequest', () => {
  it('루트("/")는 tray.html 로 매핑한다', () => {
    expect(resolveAppRequest('app://splendor/', DIST)).toEqual({
      filePath: path.join(DIST, 'tray.html'),
    })
  })

  it('tray.html 을 직접 요청하면 dist/tray.html', () => {
    expect(resolveAppRequest('app://splendor/tray.html', DIST)).toEqual({
      filePath: path.join(DIST, 'tray.html'),
    })
  })

  it('assets 하위 ESM 워커 청크를 서빙한다', () => {
    expect(resolveAppRequest('app://splendor/assets/worker-abc123.js', DIST)).toEqual({
      filePath: path.join(DIST, 'assets', 'worker-abc123.js'),
    })
  })

  it('쿼리스트링·해시를 제거한다', () => {
    expect(resolveAppRequest('app://splendor/assets/x.js?v=1#h', DIST)).toEqual({
      filePath: path.join(DIST, 'assets', 'x.js'),
    })
  })

  it('URL 인코딩된 경로를 디코딩한다', () => {
    expect(resolveAppRequest('app://splendor/assets/a%20b.js', DIST)).toEqual({
      filePath: path.join(DIST, 'assets', 'a b.js'),
    })
  })

  it('디렉터리 탈출(..)은 notFound', () => {
    expect(resolveAppRequest('app://splendor/../secret.txt', DIST)).toEqual({
      notFound: true,
    })
  })

  it('인코딩된 탈출(%2e%2e)도 notFound', () => {
    expect(resolveAppRequest('app://splendor/%2e%2e/secret.txt', DIST)).toEqual({
      notFound: true,
    })
  })
})
```

명령(저장소 루트):
```
npm test -- tests/desktop/appProtocol.test.ts
```
기대 출력: 모듈 로드 실패 — `Cannot find module '../../desktop/lib/appProtocol.cjs'`(파일 없음). 실패 확인.

- [ ] **2.2 최소 구현 — appProtocol.cjs**

파일 생성: `desktop/lib/appProtocol.cjs`
```js
'use strict'
const path = require('path')

/**
 * app:// 요청 URL 을 dist 내부 절대 파일 경로로 해석한다(순수 함수).
 * - 'app://splendor/' 루트 → tray.html
 * - 쿼리·해시 제거, URL 디코딩
 * - distRoot 밖으로 탈출(..)하면 { notFound: true }
 * @param {string} url
 * @param {string} distRoot 절대 경로
 * @returns {{filePath: string} | {notFound: true}}
 */
function resolveAppRequest(url, distRoot) {
  let pathname
  try {
    // host('splendor') 는 무시하고 pathname 만 사용
    pathname = new URL(url).pathname
  } catch {
    return { notFound: true }
  }
  let rel
  try {
    rel = decodeURIComponent(pathname).replace(/^\/+/, '')
  } catch {
    return { notFound: true } // 잘못된 % 인코딩
  }
  if (rel === '' || rel.endsWith('/')) rel += 'tray.html'
  const filePath = path.normalize(path.join(distRoot, rel))
  const rootWithSep = distRoot.endsWith(path.sep) ? distRoot : distRoot + path.sep
  if (filePath !== distRoot && !filePath.startsWith(rootWithSep)) {
    return { notFound: true }
  }
  return { filePath }
}

module.exports = { resolveAppRequest }
```

명령:
```
npm test -- tests/desktop/appProtocol.test.ts
```
기대 출력: `Test Files  1 passed` / `Tests  7 passed`. 통과 확인.

- [ ] **2.3 main.js — 프로토콜 스킴 등록 + protocol.handle + dist 로드**

`desktop/main.js` 상단 require 를 교체하고 프로토콜 등록을 추가한다.

`main.js` 의 require 줄:
```js
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
```
을 다음으로 교체:
```js
const { app, BrowserWindow, Tray, Menu, nativeImage, protocol, net } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { resolveAppRequest } = require('./lib/appProtocol.cjs')

// 패키지된 앱에서 dist 는 asar 밖(extraResources)에 둔다(Task 9). 개발 모드는 ../dist.
const DIST_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '..', 'dist')

// app:// 를 표준 스킴으로 등록(privileged: 보안 컨텍스트·fetch 허용 → ESM 워커 로드).
// app.whenReady() 이전에 호출해야 한다(Electron 요구).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])
```

`createWindow()` 안의 `win.loadFile(...)` 줄:
```js
  win.loadFile(path.join(__dirname, 'placeholder.html'))
```
을 다음으로 교체:
```js
  win.loadURL('app://splendor/tray.html')
```

`app.whenReady().then(() => {` 블록을 다음으로 교체:
```js
app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const resolved = resolveAppRequest(request.url, DIST_ROOT)
    if ('notFound' in resolved) {
      return new Response('Not Found', { status: 404 })
    }
    return net.fetch(pathToFileURL(resolved.filePath).toString())
  })
  createWindow()
  createTray()
})
```
(`Response`·`net.fetch` 는 Electron 33 메인 프로세스 전역/API 이다.)

- [ ] **2.4 placeholder.html 제거**

명령:
```
git rm desktop/placeholder.html
```
(더는 로드하지 않으므로 제거. `dist/tray.html` 은 Plan 1 빌드가 생성한다.)

- [ ] **2.5 루트 package.json — 데스크톱 빌드 스크립트**

`package.json` 의 `"scripts"` 에 아래 두 줄을 추가(기존 스크립트 유지):
```json
    "build:desktop": "tsc -b && vite build --base=./",
    "start:desktop": "npm run build:desktop && npm --prefix desktop start",
```
`--base=./` 로 `app://` 프로토콜 루트 기준 상대경로 자산을 만든다(공유 계약). `vite build` 의 `rollupOptions.input`(`tray.html` 포함)은 Plan 1 이 `vite.config.ts` 에 설정한다 — 이 계획은 그 산출물을 소비만 한다.

명령:
```
npm run build:desktop
```
기대: `dist/` 생성. **Plan 1 완료 후** `dist/tray.html` 존재. **Plan 1 미완이면** `tray.html` input 부재로 `dist/tray.html` 이 없으나 `dist/index.html` 은 산출된다 — 이 스텝은 스크립트 배선(빌드가 도는지)만 검증하므로 `dist/` 생성 여부로 통과 판정한다. (`dist/tray.html` 존재 단정은 2.6/10.3 에서 Plan 1 병합 후 수행.)

- [ ] **2.6 Electron 스모크 — app:// 로드 + 게임 구동 + 워커 생성 관측**

**중요(리뷰):** `window.__splendorAi.workerCreated` 는 `aiClient.requestMove()`(AI 착수)가 `ensureWorker()` 를 호출할 때만 `true` 가 된다(확인: `src/ai/client.ts`). 셋업 화면을 가만히 로드하는 것만으로는 워커가 생성되지 않으므로, 스모크는 **Plan 1 이 노출한 `window.__traySmokeStart()` 훅으로 AI 게임을 한 턴 구동**시킨 뒤 진단을 읽어야 한다. 훅이 없으면(Plan 1 병합 전) skip 하고 exit 0 한다.

파일 생성: `desktop/test/preload-probe.js`
```js
'use strict'
const { ipcRenderer } = require('electron')

// 렌더러 로드 후: (1) 체감 지연 제거, (2) __traySmokeStart 로 AI 게임 구동,
// (3) __splendorAi 진단(workerCreated·responses·fallbacks·lastAlgo)을 폴링해 메인으로 보고.
window.addEventListener('load', () => {
  const started = typeof window.__traySmokeStart === 'function'
  if (started) {
    try {
      window.__splendorAi && window.__splendorAi.setDelayScale(0) // 연출 지연 제거
    } catch {}
    window.__traySmokeStart() // 사람1+AI1(easy) 게임 시작 → AI 차례로 넘어가 워커 구동
  }
  let tries = 0
  const iv = setInterval(() => {
    tries++
    const diag = window.__splendorAi
    const done = diag && diag.workerCreated && diag.responses > 0
    if (done || tries > 40) {
      clearInterval(iv)
      ipcRenderer.send('smoke-diag', {
        hookPresent: started,
        workerCreated: !!(diag && diag.workerCreated),
        responses: (diag && diag.responses) || 0,
        fallbacks: (diag && diag.fallbacks) || 0,
        lastAlgo: (diag && diag.lastAlgo) || null,
      })
    }
  }, 250) // 최대 10s
})
```

파일 생성: `desktop/test/smoke.cjs`
```js
'use strict'
// 헤드리스 Electron 스모크: app:// 로 tray.html 을 로드하고 AI 게임을 한 턴 구동해
// AI 워커가 실제로 생성·응답하는지(폴백 아님) 관측한다.
// 성공/skip 시 exit 0, 실패 시 exit 1. CI(desktop-release.yml)와 로컬(npm --prefix desktop run smoke)에서 실행.
const { app, BrowserWindow, protocol, net, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const { resolveAppRequest } = require('../lib/appProtocol.cjs')

const DIST_ROOT = path.join(__dirname, '..', '..', 'dist')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])

function fail(msg) {
  console.error('SMOKE FAIL:', msg)
  app.exit(1)
}

// Plan 1 미완: dist/tray.html 부재면 skip(순수 테스트가 프로토콜 로직을 이미 커버).
if (!fs.existsSync(path.join(DIST_ROOT, 'tray.html'))) {
  console.log('SMOKE SKIP: dist/tray.html 부재(Plan 1 병합/빌드 전)')
  process.exit(0)
}

const TIMEOUT = setTimeout(() => fail('워커 진단 보고 타임아웃(15s)'), 15000)

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const resolved = resolveAppRequest(request.url, DIST_ROOT)
    if ('notFound' in resolved) return new Response('Not Found', { status: 404 })
    return net.fetch(pathToFileURL(resolved.filePath).toString())
  })

  ipcMain.on('smoke-diag', (_e, diag) => {
    clearTimeout(TIMEOUT)
    if (!diag.hookPresent) {
      console.log('SMOKE SKIP: __traySmokeStart 미노출(Plan 1 병합 전)')
      return app.exit(0)
    }
    if (!diag.workerCreated) return fail('window.__splendorAi.workerCreated !== true')
    if (diag.responses < 1) return fail('워커 응답 없음(responses=0) — 폴백/미로드 의심')
    if (diag.fallbacks > 0) return fail('그리디 폴백 발생(fallbacks=' + diag.fallbacks + ')')
    console.log(
      'SMOKE OK: workerCreated=true responses=' + diag.responses + ' lastAlgo=' + diag.lastAlgo,
    )
    app.exit(0)
  })

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-probe.js'),
      contextIsolation: false, // 프로브가 window.__splendorAi/__traySmokeStart 를 직접 읽어야 함
      nodeIntegration: false,
    },
  })
  win.loadURL('app://splendor/tray.html').catch((e) => fail('loadURL: ' + e.message))
})

app.on('window-all-closed', () => {})
```
(주의: `offscreen: true` 는 쓰지 않는다 — 오프스크린 렌더러는 타이머/워커 스케줄링이 불안정해 `requestMove` 지연 연출·워커 로드가 어긋날 수 있다. `show:false` 로 충분히 은밀하다. 프로브가 `window.__splendorAi`·`window.__traySmokeStart` 를 직접 읽어야 하므로 이 스모크 창만 `contextIsolation:false` 로 둔다 — 프로덕션 트레이 창(`contextIsolation:true`)과 무관한 테스트 전용 창이다.)

명령(**Plan 1 병합 후**, dist/tray.html + __traySmokeStart 필요):
```
npm run build:desktop && npm --prefix desktop run smoke
```
기대 출력: `SMOKE OK: workerCreated=true responses=N lastAlgo=greedy1`, 종료코드 0. **Plan 1 미완이면** `SMOKE SKIP: ...` + 종료코드 0(프로토콜 로직은 2.2 순수 테스트로 확정). 병합 후 이 스텝을 재실행해 SMOKE OK 를 확인하도록 표시한다.

- [ ] **2.7 커밋**

```
git add desktop/ tests/desktop/ package.json && git commit -m "feat(desktop): app:// 커스텀 프로토콜 dist 서빙 + 게임 구동 워커 로드 스모크"
```
메시지 끝에 Co-Authored-By 추가.

---

## Task 3: 창 동작 — frameless/skipTaskbar/alwaysOnTop/단일인스턴스/blur→hide/close→hide

요트다이스 창 정책을 이식한다. 표시 300ms 가드(표시 직후 blur 무시), pinned 면 blur 유지, devtools 열림 예외, close→preventDefault+hide, 단일 인스턴스 락(second-instance→show), mac dock.hide + screen-saver.

**Files**
- Modify: `desktop/main.js`

**Interfaces**
- Produces: `showPanel()`, `hidePanel()`(내부). `isQuitting`, `pinned` 상태 플래그.
- Consumes: `settings.json`(Task 4에서 도입 — 여기서는 `pinned` 를 인메모리 기본 false 로).

### Steps

- [ ] **3.1 단일 인스턴스 락 + show/hide 헬퍼 + 앱 이벤트**

`desktop/main.js` 의 최상단(위 require·`protocol.registerSchemesAsPrivileged` 다음, `let win = null` 앞)에 추가:
```js
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}
let isQuitting = false
let pinned = false
let shownAt = 0
```
(락 실패 시 `app.quit()` 호출 이후에도 스크립트는 계속 실행되지만, 이후 `app.whenReady()` 는 첫 인스턴스에서만 의미가 있고 두 번째 인스턴스는 곧 종료된다 — 요트다이스 동일 패턴.)

`app.on('window-all-closed', ...)` 아래(파일 끝)에 추가:
```js
app.on('second-instance', () => {
  showPanel()
})

app.on('before-quit', () => {
  isQuitting = true
})
```

`createWindow()` 함수 뒤에 show/hide 헬퍼를 추가:
```js
function showPanel() {
  if (!win) return
  win.show()
  win.focus()
  shownAt = Date.now()
}

function hidePanel() {
  if (win) win.hide()
}
```

- [ ] **3.2 createWindow — blur→hide, close→hide, mac 정책**

`createWindow()` 안의 `win.once('ready-to-show', () => win.show())` 를 다음으로 교체:
```js
  win.once('ready-to-show', () => showPanel())

  // 바깥클릭(blur) 숨김 — 단, pinned·표시직후 300ms·devtools 열림은 예외.
  win.on('blur', () => {
    if (pinned) return
    if (Date.now() - shownAt < 300) return
    if (win.webContents.isDevToolsOpened()) return
    hidePanel()
  })

  // 닫기 = 종료 아님(트레이 상주). quit 중이 아니면 hide.
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      hidePanel()
    }
  })

  if (process.platform === 'darwin') {
    win.setAlwaysOnTop(true, 'screen-saver')
  }
```

`app.whenReady().then(...)` 블록 안 `createTray()` 다음에 추가:
```js
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }
```

- [ ] **3.3 트레이 클릭 → showPanel 토글**

`createTray()` 안 `tray.on('click', ...)` 와 `tray.on('right-click', ...)` 를 다음으로 교체:
```js
  tray.on('click', () => {
    if (win && win.isVisible() && !win.isMinimized()) hidePanel()
    else showPanel()
  })
  tray.on('right-click', () => tray.popUpContextMenu(menu))
```
좌클릭은 show/hide 토글, 우클릭은 메뉴. 메뉴의 "열기" 도 `showPanel` 로 교체:
```js
    { label: '열기', click: () => showPanel() },
```
"종료" 는 `isQuitting` 이 `before-quit` 에서 설정되므로 그대로 `app.quit()`.

- [ ] **3.4 로컬 창 정책 확인 (GUI — 자동 회귀는 순수 로직에 위임)**

이 Task 의 창 정책(blur/close/single-instance)은 실제 GUI 이벤트라 헤드리스 단정이 어렵다. 대신 다음을 로컬에서 확인한다:
- `npm --prefix desktop start`: 창 밖 클릭 → 숨김. 트레이 좌클릭 → 다시 표시. Alt+F4 → 숨김(종료 아님, 트레이 유지). 트레이 "종료" → 완전 종료.
- 두 번째 인스턴스 실행(`npm --prefix desktop start` 한 번 더) → 새 창 대신 기존 창 표시(single-instance).

자동 회귀는 순수 로직(프로토콜·리사이즈·투명도 클램프)으로 커버하고, hide 후 재표시 시 게임 상태 보존은 Task 2 스모크가 창을 파괴하지 않는 것으로(창은 `hide` 만) 간접 보장한다.

- [ ] **3.5 커밋**

```
git add desktop/main.js && git commit -m "feat(desktop): 창 정책 — blur→hide·close→hide·단일인스턴스·mac dock.hide"
```
메시지 끝에 Co-Authored-By 추가.

---

## Task 4: 투명도 30~100 클램프 + settings.json 영속 + IPC

`settings.json`(userData)을 도입하고, 투명도 클램프·저장·복원·IPC(`tray-set-opacity`/`tray-opacity`)를 붙인다. 클램프 로직은 순수 함수로 추출해 vitest 로 커버.

**Files**
- Create: `desktop/lib/settings.cjs`
- Create: `desktop/lib/opacity.cjs`
- Create: `tests/desktop/opacity.test.ts`
- Create: `tests/desktop/settings.test.ts`
- Modify: `desktop/main.js`

**Interfaces**
- Produces:
  ```ts
  // opacity.cjs
  export function clampPercent(value: number): number    // 임의 → 30..100 정수
  export function clampOpacity(value: number): number     // 30..100 → 0.30..1.00 (win.setOpacity 용 0~1)
  export const MIN: number  // 30
  export const MAX: number  // 100
  // settings.cjs
  export function readSettings(userDataDir: string): Settings
  export function writeSettings(userDataDir: string, patch: Partial<Settings>): Settings
  export const DEFAULTS: Settings
  type Settings = {
    theme: 'light' | 'dark'
    opacity: number
    pinned: boolean
    winPos: { x: number; y: number } | null
    bossKey: string
    autostart: boolean
  }
  ```
- Consumes: preload `window.tray.setOpacity`/`onOpacity`(Task 1에서 정의됨).

### Steps

- [ ] **4.1 실패테스트 — 투명도 클램프**

파일 생성: `tests/desktop/opacity.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { clampPercent, clampOpacity } = require('../../desktop/lib/opacity.cjs') as {
  clampPercent: (v: number) => number
  clampOpacity: (v: number) => number
}

describe('clampPercent', () => {
  it('30 미만은 30으로 바닥', () => {
    expect(clampPercent(0)).toBe(30)
    expect(clampPercent(29)).toBe(30)
    expect(clampPercent(-5)).toBe(30)
  })
  it('100 초과는 100으로 천장', () => {
    expect(clampPercent(150)).toBe(100)
  })
  it('범위 안은 정수로 반올림', () => {
    expect(clampPercent(55.4)).toBe(55)
    expect(clampPercent(72)).toBe(72)
  })
  it('NaN·비수치는 100(기본 불투명)', () => {
    expect(clampPercent(NaN)).toBe(100)
    expect(clampPercent(undefined as unknown as number)).toBe(100)
  })
})

describe('clampOpacity', () => {
  it('퍼센트를 0~1 로 변환(30→0.3)', () => {
    expect(clampOpacity(30)).toBeCloseTo(0.3)
    expect(clampOpacity(100)).toBeCloseTo(1)
  })
  it('바닥 클램프 후 변환(10→0.3)', () => {
    expect(clampOpacity(10)).toBeCloseTo(0.3)
  })
})
```

명령:
```
npm test -- tests/desktop/opacity.test.ts
```
기대 출력: `Cannot find module '../../desktop/lib/opacity.cjs'`. 실패 확인.

- [ ] **4.2 구현 — opacity.cjs**

파일 생성: `desktop/lib/opacity.cjs`
```js
'use strict'
const MIN = 30
const MAX = 100

/** 임의 입력 → 30..100 정수 퍼센트. 비수치는 100(불투명). */
function clampPercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return MAX
  return Math.min(MAX, Math.max(MIN, Math.round(n)))
}

/** 퍼센트 → win.setOpacity 용 0~1(먼저 클램프). */
function clampOpacity(value) {
  return clampPercent(value) / 100
}

module.exports = { clampPercent, clampOpacity, MIN, MAX }
```

명령:
```
npm test -- tests/desktop/opacity.test.ts
```
기대 출력: `Tests  8 passed`. 통과 확인.

- [ ] **4.3 settings.cjs — 읽기/쓰기(원자적·기본값 병합)**

파일 생성: `desktop/lib/settings.cjs`
```js
'use strict'
const fs = require('fs')
const path = require('path')

const DEFAULTS = {
  theme: 'dark',
  opacity: 100,
  pinned: false,
  winPos: null,
  bossKey: 'CommandOrControl+Alt+Space',
  autostart: true,
}

function settingsPath(userDataDir) {
  return path.join(userDataDir, 'settings.json')
}

/** 기본값에 파일값을 병합해 반환(파일 없음/손상 시 기본값). */
function readSettings(userDataDir) {
  try {
    const raw = fs.readFileSync(settingsPath(userDataDir), 'utf8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

/** patch 를 병합해 원자적으로 저장하고 병합 결과를 반환. */
function writeSettings(userDataDir, patch) {
  const next = { ...readSettings(userDataDir), ...patch }
  const file = settingsPath(userDataDir)
  const tmp = file + '.tmp'
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  fs.renameSync(tmp, file)
  return next
}

module.exports = { readSettings, writeSettings, DEFAULTS }
```

- [ ] **4.4 실패테스트 — settings 왕복**

파일 생성: `tests/desktop/settings.test.ts`
```ts
import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { readSettings, writeSettings, DEFAULTS } = require('../../desktop/lib/settings.cjs') as {
  readSettings: (d: string) => Record<string, unknown>
  writeSettings: (d: string, p: Record<string, unknown>) => Record<string, unknown>
  DEFAULTS: Record<string, unknown>
}

const dirs: string[] = []
function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'splendor-settings-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('settings', () => {
  it('파일이 없으면 기본값을 반환', () => {
    expect(readSettings(tmpDir())).toEqual(DEFAULTS)
  })
  it('patch 를 저장하고 다시 읽으면 병합된다', () => {
    const d = tmpDir()
    writeSettings(d, { theme: 'light', opacity: 55 })
    const s = readSettings(d)
    expect(s.theme).toBe('light')
    expect(s.opacity).toBe(55)
    expect(s.bossKey).toBe('CommandOrControl+Alt+Space') // 기본값 유지
  })
  it('손상된 JSON 은 기본값으로 폴백', () => {
    const d = tmpDir()
    fs.writeFileSync(path.join(d, 'settings.json'), '{ not json', 'utf8')
    expect(readSettings(d)).toEqual(DEFAULTS)
  })
})
```

명령:
```
npm test -- tests/desktop/settings.test.ts
```
기대 출력: `Tests  3 passed`(구현이 이미 4.3에 있으므로 바로 통과). 통과 확인.

- [ ] **4.5 main.js — ipcMain 통합 + 투명도 복원·IPC 배선**

`desktop/main.js` 최상단 electron 구조분해에 `ipcMain` 을 **추가**한다(중복 require 금지 — 기존 한 줄에 합류):
```js
const { app, BrowserWindow, Tray, Menu, nativeImage, protocol, net, ipcMain } = require('electron')
```
require 블록(`resolveAppRequest` 아래)에 추가:
```js
const { readSettings, writeSettings } = require('./lib/settings.cjs')
const { clampOpacity, clampPercent } = require('./lib/opacity.cjs')
```

`let win = null` 근처에 설정 로드용 변수 추가:
```js
let settings = null // app.whenReady 이후 초기화(userData 경로 필요)
```

`createWindow()` 의 `BrowserWindow` 생성 직후(`win.loadURL` 앞)에 투명도 복원:
```js
  win.setOpacity(clampOpacity(settings.opacity))
```

`app.whenReady().then(() => {` 블록 맨 위(`protocol.handle` 앞)에서 설정 로드:
```js
  settings = readSettings(app.getPath('userData'))
```

`createWindow()` 의 `win.loadURL(...)` 다음에 초기 투명도 퍼센트를 렌더러로 푸시:
```js
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('tray-opacity', settings.opacity)
  })
```

파일 하단에 IPC 핸들러 정의:
```js
function registerIpc() {
  ipcMain.on('tray-set-opacity', (_e, { value, persist }) => {
    if (!win) return
    win.setOpacity(clampOpacity(value))
    if (persist) settings = writeSettings(app.getPath('userData'), { opacity: clampPercent(value) })
  })

  ipcMain.on('tray-hide', () => hidePanel())
}
```
`app.whenReady().then(...)` 안 `createTray()` 다음에:
```js
  registerIpc()
```

- [ ] **4.6 확인 (투명도는 순수 테스트로 커버 — 스모크 생략)**

4.1 순수테스트가 클램프를 커버하고 `win.setOpacity` 자체는 Electron API 신뢰. 별도 스모크 절은 YAGNI. 회귀:
```
npm test -- tests/desktop/opacity.test.ts tests/desktop/settings.test.ts
```
기대: `opacity` 8 passed + `settings` 3 passed.

- [ ] **4.7 커밋**

```
git add desktop/ tests/desktop/ && git commit -m "feat(desktop): 투명도 30~100 클램프 + settings.json 영속 + tray-set-opacity/tray-opacity IPC"
```
메시지 끝에 Co-Authored-By 추가.

---

## Task 5: 테마(흰/검) — settings.theme + 트레이 "라이트 모드" 토글 + 배경색 플립 + tray-theme IPC

요트다이스 `yd-set-theme`/`yd-theme` 이식. 메인이 테마를 소유하고, 트레이 메뉴 체크박스로 토글, `win.setBackgroundColor(BG[theme])` 로 깜빡임 방지, `tray-theme` IPC 로 렌더러에 푸시(창 생성·`did-finish-load` 초기값 포함).

**Files**
- Create: `desktop/lib/theme.cjs`
- Create: `tests/desktop/theme.test.ts`
- Modify: `desktop/main.js`

**Interfaces**
- Produces:
  ```ts
  // theme.cjs
  export const BG: { dark: '#14161a'; light: '#f4f4f5' }
  export function nextTheme(t: 'light' | 'dark'): 'light' | 'dark'   // 토글
  export function bgFor(t: 'light' | 'dark'): string
  ```
  IPC: main→renderer `tray-theme` payload `'light'|'dark'`. preload `window.tray.onTheme(cb)`(Task 1).
- Consumes: `settings.theme`(Task 4).

### Steps

- [ ] **5.1 실패테스트 — theme 헬퍼**

파일 생성: `tests/desktop/theme.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { BG, nextTheme, bgFor } = require('../../desktop/lib/theme.cjs') as {
  BG: { dark: string; light: string }
  nextTheme: (t: 'light' | 'dark') => 'light' | 'dark'
  bgFor: (t: 'light' | 'dark') => string
}

describe('theme', () => {
  it('BG 팔레트는 공유 계약과 일치한다', () => {
    expect(BG.dark).toBe('#14161a')
    expect(BG.light).toBe('#f4f4f5')
  })
  it('nextTheme 는 dark↔light 를 토글', () => {
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
  })
  it('bgFor 는 테마별 배경색', () => {
    expect(bgFor('dark')).toBe('#14161a')
    expect(bgFor('light')).toBe('#f4f4f5')
  })
})
```

명령:
```
npm test -- tests/desktop/theme.test.ts
```
기대 출력: `Cannot find module '../../desktop/lib/theme.cjs'`. 실패 확인.

- [ ] **5.2 구현 — theme.cjs**

파일 생성: `desktop/lib/theme.cjs`
```js
'use strict'
// 공유 계약: 다크 배경 #14161a, 라이트 배경 #f4f4f5(= tray.css 라이트 배경).
const BG = { dark: '#14161a', light: '#f4f4f5' }

function nextTheme(t) {
  return t === 'dark' ? 'light' : 'dark'
}

function bgFor(t) {
  return BG[t] || BG.dark
}

module.exports = { BG, nextTheme, bgFor }
```

명령:
```
npm test -- tests/desktop/theme.test.ts
```
기대 출력: `Tests  3 passed`. 통과 확인.

- [ ] **5.3 main.js — 테마 적용 함수 + 초기 푸시 + 토글**

`desktop/main.js` require 에 추가:
```js
const { bgFor, nextTheme } = require('./lib/theme.cjs')
```

show/hide 헬퍼 근처에 테마 적용 함수 추가:
```js
function applyTheme(theme) {
  if (!win) return
  win.setBackgroundColor(bgFor(theme)) // 깜빡임 방지
  win.webContents.send('tray-theme', theme)
}

function toggleTheme() {
  const theme = nextTheme(settings.theme)
  settings = writeSettings(app.getPath('userData'), { theme })
  applyTheme(theme)
  rebuildTrayMenu()
}
```

`createWindow()` 의 `BrowserWindow` 옵션 `backgroundColor: '#14161a'` 를 초기 테마 기반으로 교체:
```js
    backgroundColor: bgFor(settings.theme),
```

`did-finish-load` 핸들러에 테마 초기값 푸시를 추가(투명도 push 옆):
```js
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('tray-opacity', settings.opacity)
    win.webContents.send('tray-theme', settings.theme)
  })
```

- [ ] **5.4 트레이 메뉴에 "라이트 모드" 체크박스 (동적 재빌드)**

`createTray()` 의 정적 메뉴를 동적 재빌드로 교체한다. 파일에 재빌드 함수를 추가:
```js
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '열기', click: () => showPanel() },
    {
      label: '라이트 모드',
      type: 'checkbox',
      checked: settings.theme === 'light',
      click: () => toggleTheme(),
    },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ])
}

function rebuildTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu())
}
```
`createTray()` 를 다음으로 정리(정적 `const menu = ...` 제거, `setContextMenu` 로 좌·우클릭 모두 최신 메뉴 사용):
```js
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))
  tray = new Tray(icon)
  tray.setToolTip('Splendor')
  rebuildTrayMenu()
  tray.on('click', () => {
    if (win && win.isVisible() && !win.isMinimized()) hidePanel()
    else showPanel()
  })
  tray.on('right-click', () => tray.popUpContextMenu(buildTrayMenu()))
}
```

- [ ] **5.5 확인**

전체 desktop 순수 테스트:
```
npm test -- tests/desktop/
```
기대: `appProtocol`(7)·`opacity`(8)·`settings`(3)·`theme`(3) 전부 통과.

로컬(개발자): `npm run start:desktop` → 트레이 "라이트 모드" 체크 → 창 배경이 즉시 `#f4f4f5` 로 플립, 렌더러 `data-theme="light"`(Plan 1 렌더러가 `onTheme` 구독). 재시작 후에도 유지(settings.json).

- [ ] **5.6 커밋**

```
git add desktop/ tests/desktop/ && git commit -m "feat(desktop): 흰/검 테마 — settings.theme·라이트 모드 토글·배경색 플립·tray-theme IPC"
```
메시지 끝에 Co-Authored-By 추가.

---

## Task 6: 점진적 공개 리사이즈 IPC (tray-resize)

렌더러가 목표 `{w,h}` 를 보내면 메인이 작업영역 클램프 + 우하단 앵커 유지로 `setBounds`. 자기 이동 저장 제외(`suppressMoveSave`). 위치 저장은 `moved` 이벤트. 요트다이스 `positionPanel` 이식. 클램프·앵커 계산은 순수 함수로 추출해 vitest 커버.

**Files**
- Create: `desktop/lib/position.cjs`
- Create: `tests/desktop/position.test.ts`
- Modify: `desktop/main.js`

**Interfaces**
- Produces:
  ```ts
  // position.cjs
  export function clampBounds(
    target: { w: number; h: number },
    anchor: { right: number; bottom: number },   // 현재 창의 우하단(px, 디스플레이 좌표)
    workArea: { x: number; y: number; width: number; height: number },
  ): { x: number; y: number; width: number; height: number }
  ```
  IPC: renderer→main `tray-resize` payload `{ w:number, h:number }`. preload `window.tray.resize(w,h)`(Task 1).
- Consumes: `screen.getDisplayMatching`/`getCursorScreenPoint`/`getDisplayNearestPoint`(Electron), `settings.winPos`.

### Steps

- [ ] **6.1 실패테스트 — clampBounds 우하단 앵커·작업영역 클램프**

파일 생성: `tests/desktop/position.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { clampBounds } = require('../../desktop/lib/position.cjs') as {
  clampBounds: (
    target: { w: number; h: number },
    anchor: { right: number; bottom: number },
    workArea: { x: number; y: number; width: number; height: number },
  ) => { x: number; y: number; width: number; height: number }
}

const WA = { x: 0, y: 0, width: 1920, height: 1040 } // 작업영역(태스크바 제외)

describe('clampBounds', () => {
  it('우하단 앵커를 유지하며 커진다(오른쪽·아래 고정)', () => {
    // 현재 우하단이 (1900, 1000). 250x178 → 260x440 로 확장.
    const b = clampBounds({ w: 260, h: 440 }, { right: 1900, bottom: 1000 }, WA)
    expect(b.width).toBe(260)
    expect(b.height).toBe(440)
    expect(b.x).toBe(1900 - 260) // 우변 1900 유지
    expect(b.y).toBe(1000 - 440) // 하변 1000 유지
  })
  it('왼쪽으로 넘치면 작업영역 안으로 클램프', () => {
    const b = clampBounds({ w: 400, h: 200 }, { right: 300, bottom: 500 }, WA)
    expect(b.x).toBe(0) // x 가 음수가 되지 않는다
    expect(b.width).toBe(400)
  })
  it('위로 넘치면 y 를 작업영역 상단으로 클램프', () => {
    const b = clampBounds({ w: 200, h: 600 }, { right: 500, bottom: 400 }, WA)
    expect(b.y).toBe(0)
  })
  it('오른쪽으로 넘치면 우변을 작업영역 우단으로 클램프', () => {
    const b = clampBounds({ w: 200, h: 100 }, { right: 2000, bottom: 500 }, WA)
    expect(b.x + b.width).toBe(WA.width) // 1920
  })
  it('아래로 넘치면 하변을 작업영역 하단으로 클램프', () => {
    const b = clampBounds({ w: 200, h: 100 }, { right: 500, bottom: 2000 }, WA)
    expect(b.y + b.height).toBe(WA.height) // 1040
  })
  it('작업영역 오프셋(멀티모니터)을 반영한다', () => {
    const wa = { x: 1920, y: 0, width: 1920, height: 1040 }
    const b = clampBounds({ w: 300, h: 300 }, { right: 1000, bottom: 300 }, wa)
    expect(b.x).toBe(1920) // 왼쪽 넘침 → 두 번째 모니터 좌단
  })
})
```

명령:
```
npm test -- tests/desktop/position.test.ts
```
기대 출력: `Cannot find module '../../desktop/lib/position.cjs'`. 실패 확인.

- [ ] **6.2 구현 — position.cjs**

파일 생성: `desktop/lib/position.cjs`
```js
'use strict'

/**
 * 목표 크기로 리사이즈하되 창의 우하단을 앵커로 유지하고 작업영역 안으로 클램프한다.
 * @param {{w:number,h:number}} target 목표 폭·높이
 * @param {{right:number,bottom:number}} anchor 현재 창 우하단(디스플레이 좌표)
 * @param {{x:number,y:number,width:number,height:number}} workArea 대상 디스플레이 작업영역
 */
function clampBounds(target, anchor, workArea) {
  const width = Math.round(target.w)
  const height = Math.round(target.h)
  // 우하단 앵커: 우변 = anchor.right, 하변 = anchor.bottom
  let x = anchor.right - width
  let y = anchor.bottom - height

  const minX = workArea.x
  const minY = workArea.y
  const maxX = workArea.x + workArea.width - width
  const maxY = workArea.y + workArea.height - height

  x = Math.min(Math.max(x, minX), Math.max(minX, maxX))
  y = Math.min(Math.max(y, minY), Math.max(minY, maxY))

  return { x, y, width, height }
}

module.exports = { clampBounds }
```

명령:
```
npm test -- tests/desktop/position.test.ts
```
기대 출력: `Tests  6 passed`. 통과 확인.

- [ ] **6.3 main.js — screen 통합 + tray-resize IPC + suppressMoveSave + moved 저장**

`desktop/main.js` 최상단 electron 구조분해에 `screen` 을 **추가**:
```js
const { app, BrowserWindow, Tray, Menu, nativeImage, protocol, net, ipcMain, screen } = require('electron')
```
require 에 추가:
```js
const { clampBounds } = require('./lib/position.cjs')
```

`let settings = null` 근처에 추가:
```js
let suppressMoveSave = false
```

`registerIpc()` 안에 리사이즈 핸들러 추가:
```js
  ipcMain.on('tray-resize', (_e, { w, h }) => {
    if (!win) return
    const cur = win.getBounds()
    const anchor = { right: cur.x + cur.width, bottom: cur.y + cur.height }
    const display = screen.getDisplayMatching(cur)
    const bounds = clampBounds({ w, h }, anchor, display.workArea)
    suppressMoveSave = true
    win.setBounds(bounds)
    suppressMoveSave = false
  })
```

`createWindow()` 안 이벤트 핸들러에 `moved`(사용자 이동만 저장) 추가:
```js
  win.on('moved', () => {
    if (suppressMoveSave) return
    const { x, y } = win.getBounds()
    settings = writeSettings(app.getPath('userData'), { winPos: { x, y } })
  })
```

- [ ] **6.4 초기 위치 복원 — positionPanel**

저장된 `winPos` 가 있으면 그 디스플레이 작업영역에 클램프해 배치, 없으면 커서 근처 우하단 앵커 기본. show/hide 헬퍼 근처에 추가:
```js
function positionPanel() {
  if (!win) return
  const size = win.getBounds()
  if (settings.winPos) {
    const display = screen.getDisplayMatching({
      x: settings.winPos.x,
      y: settings.winPos.y,
      width: size.width,
      height: size.height,
    })
    const anchor = {
      right: settings.winPos.x + size.width,
      bottom: settings.winPos.y + size.height,
    }
    const b = clampBounds({ w: size.width, h: size.height }, anchor, display.workArea)
    suppressMoveSave = true
    win.setBounds(b)
    suppressMoveSave = false
    return
  }
  // 저장 위치 없음: 커서 근처 우하단 앵커(작업영역 우하단에서 8px 여백)
  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const wa = display.workArea
  const b = clampBounds(
    { w: size.width, h: size.height },
    { right: wa.x + wa.width - 8, bottom: wa.y + wa.height - 8 },
    wa,
  )
  suppressMoveSave = true
  win.setBounds(b)
  suppressMoveSave = false
}
```
`showPanel()` 첫 표시 시 위치 지정 — `showPanel()` 을 다음으로 교체:
```js
function showPanel() {
  if (!win) return
  positionPanel()
  win.show()
  win.focus()
  shownAt = Date.now()
}
```

- [ ] **6.5 확인 + 커밋**

```
npm test -- tests/desktop/
```
기대: appProtocol·opacity·settings·theme·position 전부 통과.
```
git add desktop/ tests/desktop/ && git commit -m "feat(desktop): tray-resize 점진적 공개 — 우하단 앵커·작업영역 클램프·winPos 영속"
```
메시지 끝에 Co-Authored-By 추가.

---

## Task 7: 전역 보스키 (globalShortcut) — 기본 CommandOrControl+Alt+Space, 토글·변경·정리

`globalShortcut.register(settings.bossKey)` 로 show/hide 토글. 트레이 메뉴에서 변경(간이 입력 창), 등록 충돌 시 기존 조합 복구 + 콘솔 안내. `will-quit` 에서 `unregisterAll`.

**Files**
- Modify: `desktop/main.js`
- Create: `desktop/bosskey.html`(보스키 변경 입력용 초소형 창)

**Interfaces**
- Produces: `registerBossKey(accel)`(내부) → boolean(성공 여부). `togglePanel()`(내부). IPC `tray-set-bosskey`(bosskey.html→main, payload: accel 문자열 또는 null=취소).
- Consumes: `settings.bossKey`(Task 4 기본값 `CommandOrControl+Alt+Space`), `globalShortcut`.

### Steps

- [ ] **7.1 main.js — globalShortcut 통합 + registerBossKey + 토글**

`desktop/main.js` 최상단 electron 구조분해에 `globalShortcut` 을 **추가**:
```js
const { app, BrowserWindow, Tray, Menu, nativeImage, protocol, net, ipcMain, screen, globalShortcut } = require('electron')
```

show/hide 헬퍼 근처에 추가:
```js
function togglePanel() {
  if (win && win.isVisible() && !win.isMinimized()) hidePanel()
  else showPanel()
}

/** 보스키 등록. 성공 시 true. 실패(충돌)면 false — 호출자가 안내. */
function registerBossKey(accel) {
  globalShortcut.unregisterAll()
  try {
    return globalShortcut.register(accel, () => togglePanel())
  } catch {
    return false
  }
}
```

`app.whenReady().then(...)` 안 `registerIpc()` 다음에:
```js
  const bossOk = registerBossKey(settings.bossKey)
  if (!bossOk) {
    console.warn('보스키 등록 실패(충돌):', settings.bossKey)
  }
```

파일 하단에 정리 핸들러:
```js
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
```

- [ ] **7.2 보스키 변경 입력 창 (bosskey.html)**

파일 생성: `desktop/bosskey.html`
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>보스키 변경</title>
    <style>
      body { margin: 0; background: #14161a; color: #d7dbe0; font: 12px monospace; padding: 12px; }
      #cur { color: #868f9b; margin-bottom: 8px; }
      #cap { border: 1px solid #2b3138; padding: 8px; text-align: center; user-select: none; }
      .hint { color: #5b636e; margin-top: 8px; }
      button { background: #2b3138; color: #d7dbe0; border: none; padding: 4px 10px; font: 12px monospace; margin-top: 8px; cursor: pointer; }
    </style>
  </head>
  <body>
    <div id="cur"></div>
    <div id="cap" tabindex="0">여기를 클릭하고 새 조합을 누르세요</div>
    <div class="hint">예: Ctrl+Alt+Space</div>
    <button id="save" disabled>저장</button>
    <button id="cancel">취소</button>
    <script>
      const { ipcRenderer } = require('electron')
      let accel = null
      const cap = document.getElementById('cap')
      const save = document.getElementById('save')
      document.getElementById('cur').textContent =
        '현재: ' + (new URLSearchParams(location.search).get('cur') || '')
      cap.addEventListener('keydown', (e) => {
        e.preventDefault()
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return // 수식키 단독 무시
        const mods = []
        if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl')
        if (e.altKey) mods.push('Alt')
        if (e.shiftKey) mods.push('Shift')
        const key = e.key.length === 1 ? e.key.toUpperCase() : e.code.replace('Key', '')
        accel = [...mods, key].join('+')
        cap.textContent = accel
        save.disabled = mods.length === 0
      })
      save.addEventListener('click', () => {
        if (accel) ipcRenderer.send('tray-set-bosskey', accel)
      })
      document.getElementById('cancel').addEventListener('click', () =>
        ipcRenderer.send('tray-set-bosskey', null),
      )
    </script>
  </body>
</html>
```
이 창은 `nodeIntegration:true` 의 간이 유틸리티 창이므로 별도 BrowserWindow 로 연다(메인 트레이 창과 분리, contextIsolation 정책 무관).

- [ ] **7.3 main.js — 보스키 변경 창 열기 + IPC 반영 + 메뉴 항목**

show/hide 헬퍼 근처에 변경 창 로직:
```js
let bossWin = null
function openBossKeyDialog() {
  if (bossWin) {
    bossWin.focus()
    return
  }
  bossWin = new BrowserWindow({
    width: 280,
    height: 200,
    resizable: false,
    title: '보스키 변경',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  })
  bossWin.loadFile(path.join(__dirname, 'bosskey.html'), {
    search: 'cur=' + encodeURIComponent(settings.bossKey),
  })
  bossWin.on('closed', () => {
    bossWin = null
  })
}
```

`registerIpc()` 안에 추가:
```js
  ipcMain.on('tray-set-bosskey', (_e, accel) => {
    if (accel) {
      const ok = registerBossKey(accel)
      if (ok) {
        settings = writeSettings(app.getPath('userData'), { bossKey: accel })
      } else {
        registerBossKey(settings.bossKey) // 실패 시 기존 조합 복구
        console.warn('보스키 등록 실패(충돌):', accel)
      }
    }
    if (bossWin) bossWin.close()
    rebuildTrayMenu()
  })
```
(실패 안내는 콘솔 + 메뉴 라벨의 현재 보스키 표시로 충분. 별도 dialog 는 YAGNI.)

`buildTrayMenu()` 의 템플릿에 항목 추가("라이트 모드" 다음, `separator` 앞):
```js
    { label: '보스키 변경 (' + settings.bossKey + ')', click: () => openBossKeyDialog() },
```

- [ ] **7.4 확인**

순수 테스트 회귀:
```
npm test -- tests/desktop/
```
기대: 전부 통과(보스키는 Electron API라 순수 테스트 없음).

로컬: `npm run start:desktop` → 기본 `Ctrl+Alt+Space` 로 show/hide 토글. 트레이 "보스키 변경" → 새 조합 저장 → 새 조합으로 토글, 재시작 후 유지.

- [ ] **7.5 커밋**

```
git add desktop/ && git commit -m "feat(desktop): 전역 보스키 — CommandOrControl+Alt+Space 토글·변경 창·will-quit 정리"
```
메시지 끝에 Co-Authored-By 추가.

---

## Task 8: 트레이 네이티브 메뉴 완성 + 위치 고정/초기화 + 자동실행

메뉴에 위치 고정(핀), 위치 초기화, 자동실행 토글을 추가한다. 자동실행 기본 ON(`setLoginItemSettings openAsHidden`), 첫 실행 시 기본값 설정. `--hidden` 인자면 부팅 시 창 숨김 시작.

**Files**
- Create: `desktop/lib/autostart.cjs`
- Create: `tests/desktop/autostart.test.ts`
- Modify: `desktop/main.js`

**Interfaces**
- Produces:
  ```ts
  // autostart.cjs
  export function loginItemArgs(hidden: boolean): { openAtLogin: boolean; openAsHidden: boolean; args: string[] }
  export function startsHidden(argv: string[]): boolean   // --hidden 포함 여부
  ```
- Consumes: `settings.pinned`, `settings.autostart`, `app.setLoginItemSettings`.

### Steps

- [ ] **8.1 실패테스트 — autostart 헬퍼**

파일 생성: `tests/desktop/autostart.test.ts`
```ts
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { loginItemArgs, startsHidden } = require('../../desktop/lib/autostart.cjs') as {
  loginItemArgs: (hidden: boolean) => { openAtLogin: boolean; openAsHidden: boolean; args: string[] }
  startsHidden: (argv: string[]) => boolean
}

describe('autostart', () => {
  it('자동실행 ON: openAtLogin·openAsHidden·--hidden 인자', () => {
    expect(loginItemArgs(true)).toEqual({
      openAtLogin: true,
      openAsHidden: true,
      args: ['--hidden'],
    })
  })
  it('자동실행 OFF', () => {
    expect(loginItemArgs(false)).toEqual({
      openAtLogin: false,
      openAsHidden: false,
      args: [],
    })
  })
  it('startsHidden: --hidden 이 argv 에 있으면 true', () => {
    expect(startsHidden(['electron', '.', '--hidden'])).toBe(true)
    expect(startsHidden(['electron', '.'])).toBe(false)
  })
})
```

명령:
```
npm test -- tests/desktop/autostart.test.ts
```
기대 출력: `Cannot find module '../../desktop/lib/autostart.cjs'`. 실패 확인.

- [ ] **8.2 구현 — autostart.cjs**

파일 생성: `desktop/lib/autostart.cjs`
```js
'use strict'

/** setLoginItemSettings 인자를 구성한다. ON 이면 숨김 부팅(--hidden). */
function loginItemArgs(hidden) {
  return hidden
    ? { openAtLogin: true, openAsHidden: true, args: ['--hidden'] }
    : { openAtLogin: false, openAsHidden: false, args: [] }
}

/** 부팅 시 숨김 시작 여부(--hidden 플래그). */
function startsHidden(argv) {
  return argv.includes('--hidden')
}

module.exports = { loginItemArgs, startsHidden }
```

명령:
```
npm test -- tests/desktop/autostart.test.ts
```
기대 출력: `Tests  3 passed`. 통과 확인.

- [ ] **8.3 main.js — 자동실행 기본 ON + 숨김 부팅**

`desktop/main.js` require 에 추가:
```js
const { loginItemArgs, startsHidden } = require('./lib/autostart.cjs')
```

show/hide 헬퍼 근처에 자동실행 함수:
```js
function applyAutostart(on) {
  app.setLoginItemSettings(loginItemArgs(on))
}

function setupAutostartDefault() {
  // 첫 실행 포함: settings.autostart(기본 true)를 OS 로그인 항목에 반영.
  applyAutostart(settings.autostart)
}
```

`app.whenReady().then(...)` 안 보스키 등록 다음에:
```js
  setupAutostartDefault()
```

`createWindow()` 의 `win.once('ready-to-show', ...)` 를 숨김 부팅 반영으로 교체:
```js
  win.once('ready-to-show', () => {
    if (!startsHidden(process.argv)) showPanel()
  })
```
(`--hidden` 부팅이면 창을 띄우지 않고 트레이만 상주. 이후 보스키/트레이 클릭으로 표시.)

- [ ] **8.4 main.js — 메뉴에 위치 고정·초기화·자동실행 토글 + pinned 복원**

`buildTrayMenu()` 템플릿을 완성한다(열기 / 라이트 모드 / 보스키 변경 / separator / 위치 고정 / 위치 초기화 / 자동 실행 / separator / 종료):
```js
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '열기', click: () => showPanel() },
    {
      label: '라이트 모드',
      type: 'checkbox',
      checked: settings.theme === 'light',
      click: () => toggleTheme(),
    },
    { label: '보스키 변경 (' + settings.bossKey + ')', click: () => openBossKeyDialog() },
    { type: 'separator' },
    {
      label: '위치 고정',
      type: 'checkbox',
      checked: pinned,
      click: (item) => {
        pinned = item.checked
        settings = writeSettings(app.getPath('userData'), { pinned })
      },
    },
    {
      label: '위치 초기화',
      enabled: !!settings.winPos,
      click: () => {
        settings = writeSettings(app.getPath('userData'), { winPos: null })
        positionPanel()
        rebuildTrayMenu()
      },
    },
    {
      label: '부팅 시 자동 실행',
      type: 'checkbox',
      checked: settings.autostart,
      click: (item) => {
        settings = writeSettings(app.getPath('userData'), { autostart: item.checked })
        applyAutostart(item.checked)
      },
    },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ])
}
```
`pinned` 초기값을 settings 에서 복원 — `app.whenReady` 의 `settings = readSettings(...)` 다음에:
```js
  pinned = settings.pinned
```

- [ ] **8.5 확인**

```
npm test -- tests/desktop/
```
기대: appProtocol·opacity·settings·theme·position·autostart 전부 통과.

로컬: 트레이 메뉴 전 항목 동작 — 위치 고정 체크 시 바깥클릭에도 유지(blur→hide 예외), 위치 초기화로 우하단 복귀, 자동 실행 토글(OS 로그인 항목 반영), 재시작 후 각 설정 유지.

- [ ] **8.6 커밋**

```
git add desktop/ tests/desktop/ && git commit -m "feat(desktop): 트레이 메뉴 완성 — 위치 고정/초기화·자동실행 기본 ON·숨김 부팅"
```
메시지 끝에 Co-Authored-By 추가.

---

## Task 9: 자동 업데이트(win) + adhoc-sign(mac) + electron-builder build 설정

electron-builder `build`(nsis + dmg + electron-updater + extraResources dist + afterPack)를 추가하고, Windows 자동 업데이트(태그 `tray-vX.Y.Z`)를 붙인다. mac 은 `adhoc-sign.cjs` 로 ad-hoc 서명, 자동 업데이트는 즉시 return(미서명).

**Files**
- Modify: `desktop/package.json`(build 섹션 + dist:mac 스크립트)
- Create: `desktop/scripts/adhoc-sign.cjs`
- Modify: `desktop/main.js`(setupAutoUpdater)

**Interfaces**
- Produces: `dist`(win nsis) / `dist:mac`(dmg) 산출. `latest.yml`(win 업데이트 매니페스트). `update-downloaded` → 메뉴 "업데이트 설치 후 재시작" 항목.
- Consumes: `electron-updater`, `electron-builder`, `dist/`(Plan 1 빌드 + Task 2 app://).

### Steps

- [ ] **9.1 package.json — build 섹션 + scripts**

`desktop/package.json` 의 `scripts` 에 mac 빌드 추가:
```json
    "dist:mac": "electron-builder --mac"
```
(최종 `scripts` 는 `start`/`dist`/`smoke`/`dist:mac` 네 개.)

`build` 섹션 추가(`dependencies` 아래, 같은 최상위 레벨):
```json
  "build": {
    "appId": "com.khkim3115.splendor",
    "productName": "Splendor",
    "files": ["main.js", "preload.js", "bosskey.html", "lib/**/*", "scripts/**/*", "assets/**/*"],
    "extraResources": [{ "from": "../dist", "to": "dist" }],
    "afterPack": "scripts/adhoc-sign.cjs",
    "directories": { "output": "release" },
    "win": {
      "target": "nsis",
      "icon": "assets/icon.png"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    },
    "mac": {
      "target": "dmg",
      "icon": "assets/icon.png",
      "darkModeSupport": true,
      "category": "public.app-category.games"
    },
    "dmg": {
      "artifactName": "${productName}-${version}-mac.${ext}"
    },
    "publish": [{ "provider": "github", "owner": "khkim3115", "repo": "splendor" }]
  }
```
`extraResources` 로 Plan 1 빌드 산출 `dist/` 를 앱 리소스에 포함 → 런타임에 `process.resourcesPath/dist`(Task 2 `DIST_ROOT`)에서 `app://` 서빙. (`build.publish` 의 owner/repo `khkim3115/splendor` 는 태그 `tray-vX.Y.Z` 릴리스에 `latest.yml` 을 게시하는 electron-updater 피드다.)

- [ ] **9.2 adhoc-sign.cjs — mac ad-hoc 서명 afterPack 훅**

파일 생성: `desktop/scripts/adhoc-sign.cjs`
```js
'use strict'
// electron-builder afterPack 훅: mac 에서 ad-hoc 서명(codesign -s -). win/기타는 no-op.
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename + '.app'
  const appPath = path.join(context.appOutDir, appName)
  execFileSync('codesign', ['--deep', '--force', '-s', '-', appPath], { stdio: 'inherit' })
  console.log('ad-hoc 서명 완료:', appPath)
}
```

- [ ] **9.3 main.js — setupAutoUpdater(win 전용)**

`desktop/main.js` require 에 추가:
```js
const { autoUpdater } = require('electron-updater')
```

show/hide 헬퍼 근처에 업데이트 로직:
```js
let updateReady = false

function setupAutoUpdater() {
  if (process.platform !== 'win32') return // mac 미서명 — 수동 .dmg
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false // 태그 tray-vX.Y.Z 를 정식으로 취급

  autoUpdater.on('update-downloaded', () => {
    updateReady = true
    rebuildTrayMenu()
  })
  autoUpdater.on('error', (err) => {
    console.warn('자동 업데이트 오류:', err && err.message)
  })

  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, 60 * 60 * 1000) // 1시간 간격
}
```

`app.whenReady().then(...)` 안 `setupAutostartDefault()` 다음에:
```js
  setupAutoUpdater()
```

`buildTrayMenu()` 템플릿의 **마지막 `separator` 앞**(자동 실행 항목과 종료 사이의 separator 앞이 아니라, "종료" 직전 separator 앞)에 "설치"(업데이트 준비 시만) 항목을 스프레드로 추가. 구체적으로 `{ type: 'separator' }, { label: '종료', ... }` 를 다음으로 교체:
```js
    ...(updateReady
      ? [
          { type: 'separator' },
          {
            label: '업데이트 설치 후 재시작',
            click: () => {
              isQuitting = true
              autoUpdater.quitAndInstall()
            },
          },
        ]
      : []),
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
```
(사용자가 눌러야 `quitAndInstall` — 강제 재시작 안 함. `isQuitting=true` 로 `close→hide` 가드를 통과시켜 실제 종료·설치되게 한다.)

- [ ] **9.4 확인**

순수 테스트 회귀:
```
npm test -- tests/desktop/
```
기대: 전부 통과.

빌드 검증(로컬, 실행 OS 타깃만):
```
npm run build:desktop && npm --prefix desktop run dist
```
기대(win): `desktop/release/` 에 `Splendor Setup 0.0.0.exe` + `latest.yml` + `.blockmap` 생성. mac 은 `npm --prefix desktop run dist:mac` → `.dmg` + `ad-hoc 서명 완료:` 로그. (Plan 1 미완이면 `extraResources ../dist` 에 `tray.html` 이 없어 런타임엔 흰 화면이지만 패키징 자체는 성공 — 이 스텝은 패키징 산출물 생성만 검증.)

- [ ] **9.5 커밋**

```
git add desktop/ && git commit -m "feat(desktop): electron-builder nsis/dmg + win 자동 업데이트 + mac ad-hoc 서명"
```
메시지 끝에 Co-Authored-By 추가.

---

## Task 10: CI — desktop-release.yml (win exe+latest.yml, mac dmg)

요트다이스 `desktop-release.yml` 이식. `release: published` + `workflow_dispatch` 트리거. `build-windows`(windows-latest): 루트 웹 빌드(`build:desktop`) → `desktop` npm ci → `dist -- --publish never` → `latest.yml` 검증 → `gh release upload`. `build-mac`(macos-latest): dmg 빌드·검증·업로드.

**Files**
- Create: `.github/workflows/desktop-release.yml`

**Interfaces**
- Produces: 릴리스 published 시 `.exe`+`latest.yml`+`.blockmap`(win), `.dmg`(mac) 첨부.
- Consumes: `package.json` `build:desktop`, `desktop/package.json` `dist`/`dist:mac`, secrets `GITHUB_TOKEN`.

### Steps

- [ ] **10.1 워크플로 작성**

파일 생성: `.github/workflows/desktop-release.yml`
```yaml
name: desktop-release

on:
  release:
    types: [published]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: 웹 트레이 번들 빌드 (dist/tray.html + ESM 워커)
        run: |
          npm ci
          npm run build:desktop
      - name: Electron 셸 의존성
        working-directory: desktop
        run: npm ci
      - name: Windows 패키징 (nsis + latest.yml)
        working-directory: desktop
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
        run: npm run dist -- --publish never
      - name: latest.yml 존재 검증
        working-directory: desktop
        shell: bash
        run: |
          test -f release/latest.yml || (echo 'latest.yml 누락' && exit 1)
          ls -la release
      - name: 릴리스 첨부 (exe + latest.yml + blockmap)
        if: github.event_name == 'release'
        working-directory: desktop
        shell: bash
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release upload "${{ github.event.release.tag_name }}" \
            release/*.exe release/latest.yml release/*.blockmap --clobber

  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: 웹 트레이 번들 빌드
        run: |
          npm ci
          npm run build:desktop
      - name: Electron 셸 의존성
        working-directory: desktop
        run: npm ci
      - name: macOS 패키징 (dmg, ad-hoc 서명)
        working-directory: desktop
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
        run: npm run dist:mac -- --publish never
      - name: dmg 존재 검증
        working-directory: desktop
        shell: bash
        run: |
          ls -la release
          test -n "$(ls release/*.dmg 2>/dev/null)" || (echo 'dmg 누락' && exit 1)
      - name: 릴리스 첨부 (dmg)
        if: github.event_name == 'release'
        working-directory: desktop
        shell: bash
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release upload "${{ github.event.release.tag_name }}" \
            release/*.dmg --clobber
```
(`build-mac` 의 검증·업로드 스텝도 `shell: bash` 를 명시 — macos-latest 기본 셸이 bash 이나 `$(...)`·`\` 연속행을 명시적으로 보장한다.)

- [ ] **10.2 워크플로 문법 검증**

명령(저장소 루트 — Node 로 검증, js-yaml 부재 시 python 폴백):
```
node -e "const fs=require('fs');let y;try{y=require('js-yaml')}catch{console.log('js-yaml 미설치 — python 폴백');process.exit(2)}y.load(fs.readFileSync('.github/workflows/desktop-release.yml','utf8'));console.log('yaml ok')" || python -c "import yaml; yaml.safe_load(open('.github/workflows/desktop-release.yml')); print('yaml ok')"
```
기대 출력: `yaml ok`. (둘 다 없으면 육안 검토 — YAML 들여쓰기·`on`/`jobs` 키·2-space 인덴트 확인.)

- [ ] **10.3 최종 회귀 — 전체 테스트/타입/린트/빌드**

명령:
```
npm test -- tests/desktop/
```
기대: desktop 순수 테스트 전부 통과(appProtocol 7·opacity 8·settings 3·theme 3·position 6·autostart 3 = 30개).

명령:
```
npm run typecheck && npm run lint && npm test
```
기대: 기존 engine/ai/store/ui 테스트 무회귀(트레이 셸은 스토어·엔진 무변경). `tests/desktop/*.test.ts` 는 `tsconfig.test.json` `include: ["tests",...]` 로 typecheck 되고 `eslint .` 로 린트된다(`.cjs` 는 eslint `files: ['**/*.{ts,tsx}']` 대상 밖이라 무영향). `desktop/main.js`·`desktop/**/*.cjs` 는 `.ts`/`.tsx` 가 아니라 `tsc -b`·`eslint` 대상 밖.

명령(Electron 스모크 — Plan 1 병합 후):
```
npm run build:desktop && npm --prefix desktop run smoke
```
기대: Plan 1 병합 후 `SMOKE OK: workerCreated=true responses=N lastAlgo=greedy1`. 미병합이면 `SMOKE SKIP: ...`(exit 0). 병합 후 SMOKE OK 확인을 이 스텝에 표시한다.

명령(웹+데스크톱 빌드):
```
npm run build:desktop
```
기대: `dist/` 생성(Plan 1 병합 후 `dist/tray.html` 포함). Plan 1 미병합이면 `index.html` 산출만.

- [ ] **10.4 커밋**

```
git add .github/workflows/desktop-release.yml && git commit -m "ci(desktop): desktop-release.yml — win exe+latest.yml·mac dmg 릴리스 첨부"
```
메시지 끝에 Co-Authored-By 추가.

---

## 완료 기준 검증 매핑 (DoD)

| DoD 항목 | 검증 |
|---|---|
| 트레이 상주 → 보스키/아이콘으로 표시, 바깥클릭·보스키로 숨김(종료 아님) | Task 3(blur→hide·close→hide), Task 7(보스키 토글) — 로컬 확인 |
| 접힘/펼침 창 리사이즈(우하단 앵커) | Task 6 `clampBounds` 순수 테스트 6개 + `tray-resize` IPC |
| 흰/검 테마 전환·설정 영속 | Task 5 `theme.cjs` 테스트 3개 + `tray-theme` IPC + settings.json |
| 투명도 30~100% 조절·복원 | Task 4 `opacity.cjs` 클램프 테스트 8개 + `settings` 3개 + settings.json |
| 전역 보스키 동작·변경 | Task 7 registerBossKey + bosskey.html + will-quit 정리 |
| AI 워커가 app://로 정상 로드(폴백 아님) | Task 2 `resolveAppRequest` 테스트 7개 + Electron 스모크(`__traySmokeStart` 로 게임 구동 후 `workerCreated===true`·`responses>0`·`fallbacks===0`) |
| 엔진·AI·스토어·세이브 무변경 | 이 계획은 `desktop/`·`tests/desktop/` 만 추가 + 루트 `package.json` 스크립트 2줄. 회귀는 Task 10.3 `npm test` |
| Win .exe(자동 업데이트) + mac .dmg 빌드·릴리스 첨부(CI) | Task 9(build/updater/adhoc) + Task 10(desktop-release.yml) |
| 신규 테스트 추가·통과, typecheck/lint/전체 테스트/build 통과 | Task 10.3 |

> 주의(스펙 DoD `lastAlgo==='mcts'`): 스펙 워커 검증은 하드 AI 의 `mcts` 도 언급하나, 이 셸 스모크는 **폴백 아님**(`fallbacks===0`, `responses>0`)을 핵심 게이트로 둔다. `__traySmokeStart` 는 `easy` 게임을 구동하므로 `lastAlgo==='greedy1'` 이 정상이다(워커 경로로 응답이 왔다는 증거 = app:// 워커 로드 성공). 하드=mcts 확인은 렌더러 소유 e2e(Plan 1)나 별도 하드 구동 훅에서 다룬다 — 이 계획 범위(셸의 app:// 워커 서빙)는 `responses>0 && fallbacks===0` 으로 충족된다.

## 접합면 체크리스트 (Plan 1 과의 정합)

- preload `window.tray = { hide, resize(w,h), setOpacity(v,persist), onOpacity(cb), onTheme(cb) }` — Task 1.5 에서 정확히 이 형태.
- IPC 채널명 `tray-hide`/`tray-resize`/`tray-set-opacity`/`tray-opacity`/`tray-theme` — Task 1·4·5·6 에서 준수.
- `app://splendor/tray.html` 로드 — Task 2.3. `dist/tray.html` 은 Plan 1 이 `vite.config.ts` `rollupOptions.input.tray` 로 산출(이 계획은 소비만).
- 스모크 구동 훅 `window.__traySmokeStart()` — Plan 1 이 `tray.html` 렌더러에 노출(사람1+AI1 easy 게임 시작). Task 2.6 스모크가 호출. Plan 1 미노출 시 스모크는 skip(exit 0).
- 테마 배경 BG.dark `#14161a` / BG.light `#f4f4f5` — Task 5.2. 렌더러는 `data-theme` 로 팔레트 분기(Plan 1).
- 보스키 기본 `CommandOrControl+Alt+Space` — Task 4.3 DEFAULTS + Task 7.
- `vite build --base=./` — 루트 `build:desktop` 스크립트(Task 2.5).
