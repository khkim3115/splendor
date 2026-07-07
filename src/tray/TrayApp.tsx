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
