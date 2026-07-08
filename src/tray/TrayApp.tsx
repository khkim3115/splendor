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
  // data-theme 는 콜백에서 즉시(동기) 반영 — 테스트가 act() 밖에서 콜백을 직접 호출해도
  // React 커밋을 기다리지 않고 확인 가능해야 한다(회귀: trayTheme.test.tsx).
  useEffect(() => {
    return window.tray?.onTheme?.((t) => {
      applyTheme(t)
      setTheme(t)
    })
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
