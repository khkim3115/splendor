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
