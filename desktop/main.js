'use strict'
const { app, BrowserWindow, Tray, Menu, nativeImage, protocol, net } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { resolveAppRequest } = require('./lib/appProtocol.cjs')

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
  win.loadURL('app://splendor/tray.html')
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
})

app.on('window-all-closed', () => {
  // 트레이 앱: 창 닫아도 종료 안 함(Task 3에서 close→hide 로 강화)
})
