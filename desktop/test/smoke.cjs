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
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
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
