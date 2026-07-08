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
