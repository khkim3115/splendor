'use strict'
const { app, BrowserWindow, Tray, Menu, nativeImage, protocol, net, ipcMain, screen } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { resolveAppRequest } = require('./lib/appProtocol.cjs')
const { shouldHideOnBlur } = require('./lib/windowPolicy.cjs')
const { readSettings, writeSettings } = require('./lib/settings.cjs')
const { clampOpacity, clampPercent } = require('./lib/opacity.cjs')
const { bgFor, nextTheme } = require('./lib/theme.cjs')
const { clampBounds, isUserMove, isValidResize } = require('./lib/position.cjs')

// 패키지된 앱에서 dist 는 asar 밖(extraResources)에 둔다(Task 9). 개발 모드는 ../dist.
const DIST_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '..', 'dist')

// app:// 를 표준(privileged) 스킴으로 등록한다. app.whenReady() 이전(모듈 최상위)에서
// 호출해야 한다(Electron 요구). standard+secure 없이는 ESM 모듈 워커·fetch 가 커스텀
// 스킴에서 실패한다(이 프로토콜이 존재하는 이유 = file:// 의 그 한계를 우회).
//   - standard: 표준 URL 파싱(호스트/경로) + 워커/모듈 resolve 가능
//   - secure: 보안 컨텍스트 → SubtleCrypto·모듈 워커 허용
//   - supportFetchAPI: fetch() 및 ESM import 의 내부 fetch 허용
//   - corsEnabled: 동일 스킴 리소스 간 CORS 허용
//   - stream: net.fetch 스트리밍 응답 허용(대용량 자산)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

// 단일 인스턴스 락 — 두 번째 실행은 즉시 종료하고 첫 인스턴스의 창을 띄운다(트레이 상주 앱 관례).
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let isQuitting = false
// pinned: 창 고정(핀) 상태 — Task 8 에서 트레이 메뉴 토글로 노출 예정.
// 여기서는 blur→hide 핸들러가 참조할 인메모리 기본값(false)만 마련한다.
let pinned = false
let shownAt = 0

let win = null
let tray = null
let settings = null // app.whenReady 이후 초기화(userData 경로 필요)
// setBounds() 호출은 'moved' 이벤트를 유발한다 — 프로그램 자체 이동을 사용자 드래그로
// 오인해 저장하지 않도록 setBounds 전후로 세운다(요트다이스 positionPanel/moved 이식).
// 다만 'moved' 가 항상 동기적으로 발생한다는 보장은 없다(Electron 문서 미보증) —
// 이 플래그만으로는 비동기 발생·스퓨리어스 재발화 시 자기이동을 사용자 이동으로
// 오분류할 수 있다. 그래서 아래 lastProgrammaticBounds + isUserMove() 의
// getBounds 비교가 "권위 있는" 판별 근거이고, suppressMoveSave 는 벨트-앤-서스펜더
// 용도의 1차 방어선으로만 유지한다.
let suppressMoveSave = false
// 프로그램(코드)이 마지막으로 setBounds() 한 위치 — moved 핸들러가 실제
// win.getBounds() 와 이 값을 비교해 사용자 드래그인지 판별한다(isUserMove).
let lastProgrammaticBounds = null

/** win.setBounds(bounds) 를 프로그램 자체 이동으로 표시하며 호출한다(공용 헬퍼). */
function setBoundsProgrammatically(bounds) {
  suppressMoveSave = true
  lastProgrammaticBounds = { x: bounds.x, y: bounds.y }
  win.setBounds(bounds)
  suppressMoveSave = false
}

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
    backgroundColor: bgFor(settings.theme),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setOpacity(clampOpacity(settings.opacity))
  win.loadURL('app://splendor/tray.html')
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('tray-opacity', settings.opacity)
    win.webContents.send('tray-theme', settings.theme)
  })
  win.once('ready-to-show', () => showPanel())

  // 바깥클릭(blur) 숨김 — pinned·표시직후 가드·devtools 열림은 예외(shouldHideOnBlur).
  win.on('blur', () => {
    const devtoolsOpen = win.webContents.isDevToolsOpened()
    if (shouldHideOnBlur({ now: Date.now(), shownAt, pinned, devtoolsOpen })) {
      hidePanel()
    }
  })

  // 사용자 드래그로 창을 옮긴 경우에만 winPos 를 저장한다. suppressMoveSave 는
  // 1차 방어선(빠른 경로)일 뿐, 권위 있는 판별은 isUserMove() 다 — 'moved' 가
  // 비동기로 발생하거나 스퓨리어스하게 재발화해도, 실제 getBounds() 가 마지막
  // 프로그램 설정 위치와 (허용오차 이내로) 같으면 사용자 이동으로 오저장하지 않는다.
  win.on('moved', () => {
    const bounds = win.getBounds()
    if (!isUserMove(bounds, lastProgrammaticBounds)) return
    if (suppressMoveSave) return
    const { x, y } = bounds
    settings = writeSettings(app.getPath('userData'), { winPos: { x, y } })
  })

  // 닫기 = 종료 아님(트레이 상주). quit 중이 아니면 hide.
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      hidePanel()
    }
  })

  if (process.platform === 'darwin') {
    // 풀스크린 앱 위에도 떠 있도록 screen-saver 레벨로 올린다.
    win.setAlwaysOnTop(true, 'screen-saver')
  }
}

// 창 위치를 정한다 — 저장된 winPos 가 있으면 그 디스플레이 작업영역에 클램프해 복원,
// 없으면 커서 근처 디스플레이의 우하단(여백 8px)에 앵커(요트다이스 positionPanel 이식).
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
    setBoundsProgrammatically(b)
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
  setBoundsProgrammatically(b)
}

function showPanel() {
  if (!win) return
  positionPanel()
  win.show()
  win.focus()
  shownAt = Date.now()
}

function hidePanel() {
  if (win) win.hide()
}

// 테마 적용 — 배경색 플립(깜빡임 방지) + 렌더러 푸시(Plan 1 onTheme 이 소비).
function applyTheme(theme) {
  if (!win) return
  win.setBackgroundColor(bgFor(theme))
  win.webContents.send('tray-theme', theme)
}

function toggleTheme() {
  const theme = nextTheme(settings.theme)
  settings = writeSettings(app.getPath('userData'), { theme })
  applyTheme(theme)
  rebuildTrayMenu()
}

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

app.whenReady().then(() => {
  settings = readSettings(app.getPath('userData'))
  // app://splendor/<path> → dist 내부 파일. Content-Type 은 net.fetch(file://)
  // 가 확장자로 추론한다(.js/.mjs → text/javascript, .html → text/html, .css,
  // .json, .svg, .wasm 등). ESM 워커 청크(.js)가 올바른 MIME 으로 서빙돼야
  // `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`
  // 가 로드된다(src/ai/client.ts).
  protocol.handle('app', (request) => {
    const resolved = resolveAppRequest(request.url, DIST_ROOT)
    if ('notFound' in resolved) {
      return new Response('Not Found', { status: 404 })
    }
    return net.fetch(pathToFileURL(resolved.filePath).toString())
  })
  createWindow()
  createTray()
  registerIpc()

  if (process.platform === 'darwin' && app.dock) {
    // 메뉴바(트레이) 전용 discreet 앱 — Dock 아이콘 숨김.
    app.dock.hide()
  }
})

app.on('window-all-closed', () => {
  // 트레이 앱: 창 닫아도 종료 안 함(close→hide 로 강화됨)
})

app.on('second-instance', () => {
  // 두 번째 인스턴스 실행 시도 → 새 창 대신 기존 창을 띄운다.
  showPanel()
})

app.on('before-quit', () => {
  isQuitting = true
})

function registerIpc() {
  // 드래그 중(slider move) = 적용만, 드래그 종료(release) = persist. 클램프는
  // clampOpacity/clampPercent 단일 소스(opacity.cjs)를 통해서만 이뤄진다.
  ipcMain.on('tray-set-opacity', (_e, { value, persist }) => {
    if (!win) return
    win.setOpacity(clampOpacity(value))
    if (persist) settings = writeSettings(app.getPath('userData'), { opacity: clampPercent(value) })
  })

  ipcMain.on('tray-hide', () => hidePanel())

  // 렌더러가 패널 확장/축소로 계산한 목표 {w,h} 를 보내면, 현재 창의 우하단을
  // 앵커로 유지한 채 작업영역에 클램프해 리사이즈한다(점진적 공개).
  ipcMain.on('tray-resize', (_e, { w, h } = {}) => {
    if (!win) return
    // 입력 검증(Fix 2): NaN/0/음수/누락된 w·h 를 그대로 setBounds 에 넘기면
    // Electron 이 미정의 동작(창 소실 등)을 보일 수 있다 — 조기 반환으로 무시.
    if (!isValidResize({ w, h })) return
    const cur = win.getBounds()
    const anchor = { right: cur.x + cur.width, bottom: cur.y + cur.height }
    const display = screen.getDisplayMatching(cur)
    const bounds = clampBounds({ w, h }, anchor, display.workArea)
    setBoundsProgrammatically(bounds)
  })
}
