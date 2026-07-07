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
